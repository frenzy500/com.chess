'use strict';

const assert = require('assert');
const { loadAppExports, getAppSources, runAppInContext } = require('./load-app');

const { html, css, js } = getAppSources();

console.log('Running Mobile Ergonomics, Variant Icons, Touch Drag & Share/Paste Suite...\n');

/* ============================================================================
 * 1. STATIC CHECKS: SVG VARIANT ICONS, NO EMOJIS, NO AI GLASSMORPHISM, iOS 16PX
 * ============================================================================ */
{
  const requiredSymbols = [
    'icon-variant-standard',
    'icon-variant-cannibal',
    'icon-variant-crazyhouse',
    'icon-variant-fog',
    'icon-flip',
    'icon-share'
  ];

  for (const symId of requiredSymbols) {
    const symRegex = new RegExp(
      `<symbol\\s+id="${symId}"\\s+viewBox="[^"]+">[\\s\\S]*?<path[^>]+d="([^"]+)"[\\s\\S]*?<\\/symbol>`
    );
    const match = html.match(symRegex);
    assert(match && match[1].length > 30, `Missing or empty SVG <symbol id="${symId}"> in index.html`);
  }

  // Ensure zero emojis in index.html, style.css, and game.js
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert(!emojiRegex.test(html), 'index.html must not contain emoji icons');
  assert(!emojiRegex.test(css), 'style.css must not contain emoji characters');
  assert(!emojiRegex.test(js), 'game.js must not contain emoji characters');

  // Ensure zero glassmorphism (backdrop-filter) in style.css
  assert(!/backdrop-filter/i.test(css), 'style.css must not use backdrop-filter glassmorphism');

  // Ensure iOS auto-zoom prevention (16px font size on mobile inputs)
  assert(
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.name-input,\s*\.code-input\s*\{[\s\S]*?font-size:\s*16px/m.test(
      css
    ),
    'Mobile text inputs must have font-size: 16px to prevent iOS Safari auto-zoom'
  );

  // Ensure viewport-fit=cover is present for notched phones
  assert(html.includes('viewport-fit=cover'), 'index.html should include viewport-fit=cover');

  console.log('1. PASS: All 6 vector SVG symbols verified, zero emojis/glassmorphism, and 16px iOS input protection confirmed!');
}

/* ============================================================================
 * MOCK PEERJS + MOBILE DOM HARNESS (390px iPhone Viewport)
 * ============================================================================ */

const peerRegistry = new Map();

class MockConn {
  constructor(targetId) {
    this.targetId = targetId;
    this.open = false;
    this.handlers = {};
    this.partner = null;
  }
  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
  }
  emit(ev, arg) {
    for (const fn of this.handlers[ev] || []) fn(arg);
  }
  send(data) {
    const cloned = JSON.parse(JSON.stringify(data));
    if (this.partner && this.partner.open) {
      this.partner.emit('data', cloned);
    }
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    if (this.partner && this.partner.open) {
      this.partner.open = false;
      this.partner.emit('close');
    }
  }
}

class MockPeer {
  constructor(idOrOpts) {
    this.handlers = {};
    this.destroyed = false;
    this.id = typeof idOrOpts === 'string' ? idOrOpts : 'guest-' + Math.random().toString(36).slice(2, 8);
    peerRegistry.set(this.id, this);
    Promise.resolve().then(() => {
      if (!this.destroyed) this.emit('open', this.id);
    });
  }
  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
  }
  emit(ev, arg) {
    for (const fn of this.handlers[ev] || []) fn(arg);
  }
  connect(hostId) {
    const guestConn = new MockConn(hostId);
    const hostPeer = peerRegistry.get(hostId);
    Promise.resolve().then(() => {
      if (!hostPeer || hostPeer.destroyed) {
        this.emit('error', { type: 'peer-unavailable' });
        return;
      }
      const hostConn = new MockConn(this.id);
      guestConn.partner = hostConn;
      hostConn.partner = guestConn;
      guestConn.open = true;
      hostConn.open = true;
      hostPeer.emit('connection', hostConn);
      guestConn.emit('open');
      hostConn.emit('open');
    });
    return guestConn;
  }
  destroy() {
    this.destroyed = true;
    peerRegistry.delete(this.id);
  }
}

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

function makeFakeElement(tag = 'div', id = '') {
  const classes = new Set();
  const listeners = {};
  const attrs = {};
  const el = {
    tagName: tag.toUpperCase(),
    id,
    dataset: {},
    style: {},
    children: [],
    textContent: '',
    value: '',
    disabled: false,
    src: '',
    alt: '',
    title: '',
    scrollTop: 0,
    scrollHeight: 0,
    setAttribute(k, v) {
      attrs[k] = String(v);
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      return attrs[k];
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    focus() {
      this._focused = true;
    },
    closest(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        if (classes.has(cls)) return el;
      }
      return null;
    },
    get className() {
      return [...classes].join(' ');
    },
    set className(v) {
      classes.clear();
      String(v)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c));
    },
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        const should = force === undefined ? !classes.has(c) : Boolean(force);
        if (should) classes.add(c);
        else classes.delete(c);
      },
      contains: (c) => classes.has(c)
    },
    appendChild(child) {
      if (child && child.isFrag) this.children.push(...child.children);
      else if (child) this.children.push(child);
      return child;
    },
    append(...nodes) {
      nodes.forEach((n) => this.appendChild(n));
    },
    replaceChildren(...nodes) {
      this.children = [];
      nodes.forEach((n) => this.appendChild(n));
    },
    querySelector(sel) {
      const sqMatch = sel.match(/^\.square\[data-r="(\d+)"\]\[data-c="(\d+)"\](?:\s+\.piece)?$/);
      if (sqMatch) {
        const sq = this.children.find(
          (ch) => ch.dataset && ch.dataset.r === sqMatch[1] && ch.dataset.c === sqMatch[2]
        );
        if (!sq) return null;
        if (sel.endsWith('.piece')) {
          return sq.children.find((ch) => ch.classList?.contains('piece')) || null;
        }
        return sq;
      }
      if (sel.startsWith('.')) {
        const req = sel.split('.').filter(Boolean);
        const search = (node) => {
          for (const ch of node.children || []) {
            if (req.every((c) => ch.classList?.contains(c))) return ch;
            const d = search(ch);
            if (d) return d;
          }
          return null;
        };
        return search(this);
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return this.children.filter((ch) => ch.classList?.contains(cls));
      }
      return [];
    },
    addEventListener(ev, fn) {
      (listeners[ev] ||= []).push(fn);
    },
    dispatch(ev, eventObj = {}) {
      const e = {
        target: eventObj.target || el,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 0,
        clientY: 0,
        preventDefault() {},
        stopPropagation() {},
        ...eventObj
      };
      for (const fn of listeners[ev] || []) fn(e);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 360, bottom: 360, width: 360, height: 360 };
    },
    scrollIntoView() {
      this._scrolledIntoView = (this._scrolledIntoView || 0) + 1;
    }
  };
  return el;
}

function createMobileApp({ clipboardText = '', enableShare = true } = {}) {
  const elements = new Map();
  for (const id of htmlIds) elements.set(id, makeFakeElement('div', id));

  elements.get('setup-minutes-slider').value = '10';
  elements.get('setup-increment-slider').value = '5';
  elements.get('sidebar').dataset.mobileTab = 'play';
  elements.get('drag-ghost').classList.add('hidden');
  elements.get('promotion-backdrop').classList.add('hidden');

  const mobileVarBtns = {};
  const setupVarBtns = {};
  for (const v of ['standard', 'cannibal', 'crazyhouse', 'fog']) {
    const vb = makeFakeElement('button');
    vb.className = 'variant-btn';
    vb.dataset.variant = v;
    elements.get('setup-variant-grid').appendChild(vb);
    setupVarBtns[v] = vb;

    const mvb = makeFakeElement('button');
    mvb.className = 'variant-btn';
    mvb.dataset.variant = v;
    elements.get('mobile-variant-grid').appendChild(mvb);
    mobileVarBtns[v] = mvb;

    const lb = makeFakeElement('button');
    lb.className = 'local-variant-btn';
    lb.dataset.variant = v;
    elements.get('local-variant-bar').appendChild(lb);
  }

  const tabBtns = {};
  for (const t of ['play', 'variants', 'moves', 'chat']) {
    const tb = makeFakeElement('button');
    tb.className = 'mobile-tab-btn' + (t === 'play' ? ' active' : '');
    tb.dataset.tab = t;
    elements.get('mobile-tabs').appendChild(tb);
    tabBtns[t] = tb;
  }

  for (const s of ['w', 'random', 'b']) {
    const sb = makeFakeElement('button');
    sb.className = 'side-btn';
    sb.dataset.side = s;
    elements.get('side-buttons').appendChild(sb);
  }

  const unlimChip = makeFakeElement('button');
  unlimChip.className = 'preset-chip';
  unlimChip.dataset.unlimited = '1';
  elements.get('preset-row').appendChild(unlimChip);

  const winListeners = {};
  const intervalIds = [];
  const sharedPayloads = [];
  let copiedText = '';
  let scrollTopCalls = 0;

  const navObj = {
    clipboard: {
      async writeText(t) {
        copiedText = t;
      },
      async readText() {
        return clipboardText;
      }
    }
  };
  if (enableShare) {
    navObj.share = async (payload) => {
      sharedPayloads.push(payload);
    };
  }

  const sandbox = {
    Peer: MockPeer,
    console,
    Math,
    Date,
    URL,
    URLSearchParams,
    encodeURIComponent,
    performance: { now: () => 1000 },
    localStorage: {
      _s: {},
      getItem(k) {
        return this._s[k] ?? null;
      },
      setItem(k, v) {
        this._s[k] = String(v);
      }
    },
    navigator: navObj,
    setTimeout,
    clearTimeout,
    setInterval(fn, ms) {
      const id = setInterval(fn, ms);
      intervalIds.push(id);
      return id;
    },
    clearInterval,
    window: {
      innerWidth: 390,
      location: {
        href: 'https://frenzy500.github.io/com.chess/',
        search: '',
        pathname: '/com.chess/',
        hash: ''
      },
      history: { replaceState() {} },
      scrollTo() {
        scrollTopCalls++;
      },
      addEventListener(ev, fn) {
        (winListeners[ev] ||= []).push(fn);
      },
      dispatch(ev, eventObj = {}) {
        const e = {
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: 0,
          clientY: 0,
          preventDefault() {},
          ...eventObj
        };
        for (const fn of winListeners[ev] || []) fn(e);
      }
    },
    document: {
      readyState: 'complete',
      title: 'Chess',
      body: makeFakeElement('body'),
      getElementById(id) {
        return elements.get(id) || null;
      },
      createElement(tag) {
        return makeFakeElement(tag);
      },
      createElementNS(_ns, tag) {
        return makeFakeElement(tag);
      },
      createDocumentFragment() {
        return {
          isFrag: true,
          children: [],
          appendChild(c) {
            this.children.push(c);
          }
        };
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    }
  };

  runAppInContext(
    sandbox,
    `globalThis.__test = {
      getState: () => gameState,
      setState: (s) => { gameState = s; viewPly = s.moveHistory.length; renderAll(); },
      getNet: () => net,
      getPremoves: () => premoveQueue,
      isFlipped: () => boardFlipped
    };`
  );

  return {
    elements,
    mobileVarBtns,
    setupVarBtns,
    tabBtns,
    win: sandbox.window,
    sharedPayloads,
    getCopied: () => copiedText,
    getScrollTopCalls: () => scrollTopCalls,
    api: sandbox.__test,
    cleanup() {
      intervalIds.forEach(clearInterval);
    }
  };
}

const flush = () => new Promise((r) => setTimeout(r, 15));

(async () => {
  /* ==========================================================================
   * 2. MOBILE VARIANT PILL, TABS & VARIANT CARD SWITCHING
   * ========================================================================== */
  {
    const app = createMobileApp();

    assert.strictEqual(app.elements.get('mobile-variant-pill').dataset.variant, 'standard');
    assert.strictEqual(
      app.elements.get('mobile-variant-pill-use').getAttribute('href'),
      '#icon-variant-standard'
    );
    assert.strictEqual(app.elements.get('mobile-variant-pill-label').textContent, 'Standard');

    // Tapping top-bar variant pill switches mobile sheet to "variants" tab & scrolls sidebar into view
    app.elements.get('mobile-variant-pill').dispatch('click');
    assert.strictEqual(app.elements.get('sidebar').dataset.mobileTab, 'variants');
    assert(app.tabBtns.variants.classList.contains('active'));
    assert.strictEqual(app.elements.get('sidebar')._scrolledIntoView, 1);

    // Tapping Crazyhouse card in mobile-variant-grid switches local board & scrolls back up to board!
    app.elements.get('mobile-variant-grid').dispatch('click', {
      target: app.mobileVarBtns.crazyhouse
    });
    assert.strictEqual(app.api.getState().variant, 'crazyhouse');
    assert.strictEqual(app.elements.get('mobile-variant-pill').dataset.variant, 'crazyhouse');
    assert.strictEqual(
      app.elements.get('mobile-variant-pill-use').getAttribute('href'),
      '#icon-variant-crazyhouse'
    );
    assert.strictEqual(app.elements.get('mobile-variant-pill-label').textContent, 'Crazyhouse');
    assert(!app.elements.get('bottom-pocket').classList.contains('hidden'), 'Crazyhouse pocket row visible');
    assert(app.getScrollTopCalls() >= 1, 'Auto-scrolled up to board on mobile after picking variant');

    // Tapping "Play Friend" in mobile thumb dock opens setup & switches to "play" tab
    app.elements.get('mob-play-friend-btn').dispatch('click');
    assert.strictEqual(app.api.getNet().mode, 'setup');
    assert.strictEqual(app.elements.get('sidebar').dataset.mobileTab, 'play');

    // Picking Fog of War from mobile-variant-grid while in setup mode updates setupConfig & returns to "play" tab
    app.elements.get('mobile-variant-pill').dispatch('click');
    app.elements.get('mobile-variant-grid').dispatch('click', {
      target: app.mobileVarBtns.fog
    });
    assert.strictEqual(app.elements.get('mobile-variant-pill').dataset.variant, 'fog');
    assert.strictEqual(
      app.elements.get('mobile-variant-pill-use').getAttribute('href'),
      '#icon-variant-fog'
    );
    assert.strictEqual(app.elements.get('sidebar').dataset.mobileTab, 'play');

    // Mobile sound toggle syncs mobile sound icon
    assert(!app.elements.get('mobile-sound-on').classList.contains('hidden'));
    app.elements.get('mobile-sound-btn').dispatch('click');
    assert(app.elements.get('mobile-sound-on').classList.contains('hidden'));
    assert(!app.elements.get('mobile-sound-off').classList.contains('hidden'));

    app.cleanup();
    console.log('2. PASS: Mobile top bar, variant pill SVG updates, mobile tabs, and variant card switching verified!');
  }

  /* ==========================================================================
   * 3. TOUCH ERGONOMICS: JITTER TOLERANCE, TOUCH DRAG LIFT & H-FILE PROMOTION CLAMP
   * ========================================================================== */
  {
    const app = createMobileApp();
    const board = app.elements.get('board');
    const ghost = app.elements.get('drag-ghost');

    // Square size on 360px board = 45px. White pawn e2 = (r=6, c=4) -> center (202.5, 292.5)
    board.dispatch('pointerdown', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 202,
      clientY: 292
    });
    // 6.4px thumb wobble (< 9px touch threshold) should NOT trigger drag ghost!
    app.win.dispatch('pointermove', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 207,
      clientY: 296
    });
    assert(ghost.classList.contains('hidden'), '6.4px touch wobble must NOT start accidental drag');
    app.win.dispatch('pointerup', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 207,
      clientY: 296
    });

    // Now tap e4 (r=4, c=4 -> center 202, 202) to complete clean tap-to-move e4!
    board.dispatch('pointerdown', {
      pointerId: 8,
      pointerType: 'touch',
      clientX: 202,
      clientY: 202
    });
    app.win.dispatch('pointerup', {
      pointerId: 8,
      pointerType: 'touch',
      clientX: 202,
      clientY: 202
    });
    assert.deepStrictEqual([...app.api.getState().moveHistory], ['e4'], 'Clean 2-tap move e4 succeeded despite thumb wobble');

    // Now drag Black pawn e7 (r=1, c=4 -> 202, 67) -> e5 (r=3, c=4 -> 202, 157) with touch pointer
    board.dispatch('pointerdown', {
      pointerId: 9,
      pointerType: 'touch',
      clientX: 202,
      clientY: 67
    });
    app.win.dispatch('pointermove', {
      pointerId: 9,
      pointerType: 'touch',
      clientX: 202,
      clientY: 110
    });
    assert(!ghost.classList.contains('hidden'), 'Touch drag ghost visible past 9px');
    assert(ghost.classList.contains('touch-drag'), 'Touch drag applies .touch-drag lift class');

    app.win.dispatch('pointerup', {
      pointerId: 9,
      pointerType: 'touch',
      clientX: 202,
      clientY: 157
    });
    assert(ghost.classList.contains('hidden'), 'Ghost hidden after touch drop');
    assert(!ghost.classList.contains('touch-drag'), '.touch-drag removed after touch drop');
    assert.deepStrictEqual([...app.api.getState().moveHistory], ['e4', 'e5']);

    // Test Mobile Quick Replay (< / >) & Flip Board in thumb dock
    app.elements.get('mob-prev-btn').dispatch('click');
    assert(app.elements.get('mobile-status-strip').classList.contains('viewing-past'));
    app.elements.get('mob-next-btn').dispatch('click');
    assert(!app.elements.get('mobile-status-strip').classList.contains('viewing-past'));

    assert.strictEqual(app.api.isFlipped(), false);
    app.elements.get('mob-flip-btn').dispatch('click');
    assert.strictEqual(app.api.isFlipped(), true);
    app.elements.get('mob-flip-btn').dispatch('click');
    assert.strictEqual(app.api.isFlipped(), false);

    // Test Promotion Menu horizontal clamping on rightmost column (h8 -> r=0, c=7 -> visCol=7)
    const engine = loadAppExports();
    const promoState = engine.createInitialState('standard');
    promoState.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    promoState.board[0][0] = 'bk';
    promoState.board[7][4] = 'wk';
    promoState.board[1][7] = 'wp'; // h7 ready to promote on h8!
    promoState.historyFrames = [
      {
        board: promoState.board.map((r) => r.slice()),
        turn: 'w',
        inCheck: false,
        lastMove: null,
        captured: { w: [], b: [] },
        pockets: { w: [], b: [] },
        meta: null
      }
    ];
    app.api.setState(promoState);

    // Tap h7 (r=1, c=7 -> 337, 67) then h8 (r=0, c=7 -> 337, 22)
    board.dispatch('pointerdown', { pointerId: 10, pointerType: 'touch', clientX: 337, clientY: 67 });
    app.win.dispatch('pointerup', { pointerId: 10, pointerType: 'touch', clientX: 337, clientY: 67 });
    board.dispatch('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 337, clientY: 22 });
    app.win.dispatch('pointerup', { pointerId: 11, pointerType: 'touch', clientX: 337, clientY: 22 });

    const promoMenu = app.elements.get('promotion-menu');
    assert.strictEqual(promoMenu.style.right, '0', 'h-file promotion menu clamped to right: 0');
    assert.strictEqual(promoMenu.style.left, 'auto', 'h-file promotion menu sets left: auto');

    app.cleanup();
    console.log('3. PASS: Touch jitter protection (<9px), .touch-drag thumb lift, dock step/flip, and h-file promotion clamping verified!');
  }

  /* ==========================================================================
   * 4. ONLINE MOBILE FLOW: NATIVE SHARE, 1-TAP PASTE JOIN, PREMOVE CLEAR & DOCK
   * ========================================================================== */
  {
    const host = createMobileApp({ enableShare: true });
    // Host selects Cannibal Chess & creates room
    host.elements.get('mob-play-friend-btn').dispatch('click');
    host.elements.get('setup-variant-grid').dispatch('click', {
      target: host.setupVarBtns.cannibal
    });
    host.elements.get('create-game-btn').dispatch('click');
    await flush();

    const roomCode = host.api.getNet().roomCode;
    assert.strictEqual(roomCode.length, 5);
    assert(!host.elements.get('share-link-btn').classList.contains('hidden'), 'Native Share Invite button shown on mobile');
    assert(!host.elements.get('mob-waiting-actions').classList.contains('hidden'), 'Mobile waiting actions shown in thumb dock');
    assert(host.elements.get('mob-local-actions').classList.contains('hidden'), 'Mobile local actions hidden while waiting');
    assert(!host.elements.get('mob-share-link-btn').classList.contains('hidden'), 'Mobile Share Invite quick action shown in thumb dock');

    // Host taps Native Share Invite button (either sidebar or thumb dock works!)
    host.elements.get('mob-share-link-btn').dispatch('click');
    await flush();
    assert.strictEqual(host.sharedPayloads.length, 1);
    assert(host.sharedPayloads[0].title.includes('Cannibal Chess'));
    assert(host.sharedPayloads[0].url.includes(`game=${roomCode}`));

    // Guest copies Discord invite sentence & taps 1-tap "Paste" button (#paste-code-btn)!
    const guest = createMobileApp({
      clipboardText: `Come play Cannibal Chess! https://frenzy500.github.io/com.chess/?game=${roomCode.toLowerCase()}`
    });
    guest.elements.get('paste-code-btn').dispatch('click');
    await flush();
    await flush();

    // Both Host and Guest should now be connected in an online Cannibal Chess match!
    assert.strictEqual(host.api.getNet().mode, 'online');
    assert.strictEqual(guest.api.getNet().mode, 'online');
    assert.strictEqual(guest.api.getState().variant, 'cannibal');
    assert.strictEqual(guest.elements.get('active-variant-tag').textContent, 'Cannibal Chess');
    assert.strictEqual(guest.elements.get('active-variant-tag').dataset.variant, 'cannibal');
    assert(!guest.elements.get('mob-online-actions').classList.contains('hidden'));
    assert(guest.elements.get('mob-local-actions').classList.contains('hidden'));
    assert(guest.getScrollTopCalls() >= 1, 'Guest auto-scrolled to chessboard when online match started');

    // Guest (Black, boardFlipped = true) queues 2 premoves on mobile, then clears them in 1 tap!
    // On flipped 360px board: Black's b8 Knight (r=0, c=1) is at visual (row=7, col=6) -> (292, 337)
    // Target c6 (r=2, c=2) is at visual (row=5, col=5) -> (247, 247)
    // Next target d4 (r=4, c=3) is at visual (row=3, col=4) -> (202, 157)
    const gBoard = guest.elements.get('board');
    gBoard.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 292, clientY: 337 });
    guest.win.dispatch('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 292, clientY: 337 });
    gBoard.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 247, clientY: 247 });
    guest.win.dispatch('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 247, clientY: 247 });

    gBoard.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 247, clientY: 247 });
    guest.win.dispatch('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 247, clientY: 247 });
    gBoard.dispatch('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 202, clientY: 157 });
    guest.win.dispatch('pointerup', { pointerId: 4, pointerType: 'touch', clientX: 202, clientY: 157 });

    assert.strictEqual(guest.api.getPremoves().length, 2, 'Guest queued 2 premoves via touch taps');
    assert(!guest.elements.get('mobile-cancel-premove-btn').classList.contains('hidden'));
    assert.strictEqual(guest.elements.get('mobile-cancel-premove-btn').textContent, 'Clear (2)');
    assert(!guest.elements.get('premove-cancel-bar').classList.contains('hidden'));
    assert.strictEqual(guest.elements.get('premove-count-label').textContent, '2 premoves queued');

    // 1-tap clear via mobile thumb dock chip!
    guest.elements.get('mobile-cancel-premove-btn').dispatch('click');
    assert.strictEqual(guest.api.getPremoves().length, 0, '1-tap mobile Clear Premoves emptied queue');
    assert(guest.elements.get('mobile-cancel-premove-btn').classList.contains('hidden'));

    // Mobile Draw Offer & Decline via mobile dock
    guest.elements.get('mob-draw-btn').dispatch('click');
    await flush();
    assert.strictEqual(guest.elements.get('mob-draw-btn').textContent, 'Sent');
    assert(!host.elements.get('mobile-draw-banner').classList.contains('hidden'));
    host.elements.get('mob-decline-draw-btn').dispatch('click');
    await flush();
    assert(host.elements.get('mobile-draw-banner').classList.contains('hidden'));
    assert.strictEqual(guest.elements.get('mob-draw-btn').textContent, 'Draw');

    // Mobile 2-Tap Resign Confirm via mobile dock (#mob-resign-btn)
    guest.elements.get('mob-resign-btn').dispatch('click');
    assert.strictEqual(guest.elements.get('mob-resign-btn').textContent, 'Confirm?');
    assert(guest.elements.get('mob-resign-btn').classList.contains('btn-danger'));
    guest.elements.get('mob-resign-btn').dispatch('click');
    await flush();
    assert.strictEqual(host.api.getState().status, 'resigned');
    assert.strictEqual(guest.api.getState().status, 'resigned');

    // Mobile Rematch via mobile dock (#mob-rematch-btn)
    guest.elements.get('mob-rematch-btn').dispatch('click');
    await flush();
    assert.strictEqual(host.elements.get('mob-rematch-btn').textContent, 'Accept');
    host.elements.get('mob-rematch-btn').dispatch('click');
    await flush();
    assert.strictEqual(host.api.getState().status, 'playing');
    assert.strictEqual(guest.api.getState().status, 'playing');

    host.cleanup();
    guest.cleanup();
    console.log('4. PASS: Native phone Share Invite, 1-tap Clipboard Paste auto-join, 1-tap Premove Clear, and Mobile Draw/Resign/Rematch dock verified!');
  }

  console.log('\nALL MOBILE UX & VARIANT ICON TESTS PASSED!');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
