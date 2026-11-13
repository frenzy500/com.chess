'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { loadAppExports, getAppSources, runAppInContext } = require('./load-app');

const { repoDir, html: indexHtml, css: styleCss, js: gameJs, expectedVersion } = getAppSources();

console.log('Running P2P Chat (Chess.com Badges & Emojis), UI Polish, Reconnect Fix & Mobile Parity Suite...\n');

// ---------------------------------------------------------------------------
// 1. Static HTML / CSS / Cache-Bust / Security Checks
// ---------------------------------------------------------------------------
console.log('1. Checking cache-busters, Chat-first icons, Left Dice tray, Red Leave Modal & XSS safety...');
assert(!/innerHTML|outerHTML|insertAdjacentHTML/.test(gameJs), 'Strict zero innerHTML policy');
assert(!/window\.confirm\s*\(/.test(gameJs), 'No native window.confirm prompt in game.js');

const htmlIds = new Set([...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const referencedIds = [...gameJs.matchAll(/document\.getElementById\('([^']+)'\)/g)].map((m) => m[1]);
const missingIds = referencedIds.filter((id) => !htmlIds.has(id));
assert.strictEqual(missingIds.length, 0, `Missing HTML IDs referenced in game.js: ${missingIds.join(', ')}`);

assert(
  !/property="og:|name="twitter:|name="description"/i.test(indexHtml),
  'index.html has NO OpenGraph/Twitter/description embed tags for main website link'
);
assert(
  indexHtml.includes(`css/base.css?v=${expectedVersion}`) &&
    indexHtml.includes(`js/main.js?v=${expectedVersion}`),
  `index.html asset URLs bumped to ?v=${expectedVersion}`
);
assert(
  !indexHtml.includes('chat-image-input') && !indexHtml.includes('chat-lightbox') && !indexHtml.includes('chat-staged-preview'),
  'Image upload / lightbox markup removed from chat'
);
assert(
  indexHtml.includes('id="chat-emoji-picker"') && indexHtml.includes('id="chat-emoji-btn"'),
  'Chat emoji & Chess.com badge picker controls exist in index.html'
);

// Chat tab before Moves on desktop (with Chat auto-selected) & mobile, with SVG icons
const dTabChatPos = indexHtml.indexOf('id="desktop-tab-chat"');
const dTabMovesPos = indexHtml.indexOf('id="desktop-tab-moves"');
assert(dTabChatPos > 0 && dTabMovesPos > dTabChatPos, 'Desktop puts Chat tab before Moves tab');
assert(
  /id="desktop-tab-chat"[^>]*class="desktop-tab-btn active"[^>]*aria-selected="true"/.test(indexHtml) ||
    /class="desktop-tab-btn active"[^>]*id="desktop-tab-chat"[^>]*aria-selected="true"/.test(indexHtml),
  'Desktop Chat tab starts selected (.active, aria-selected=true)'
);
assert(/class="chat-section" id="chat-section"/.test(indexHtml), '#chat-section starts visible on desktop');
assert(/class="moves-section hidden" id="moves-section"/.test(indexHtml), '#moves-section starts hidden on desktop');
assert(
  /id="desktop-tab-chat"[\s\S]*?<svg class="tab-icon"/.test(indexHtml) &&
    /id="desktop-tab-moves"[\s\S]*?<svg class="tab-icon"/.test(indexHtml),
  'Desktop Chat & Moves tabs include inline SVG icons'
);

const mChatPos = indexHtml.indexOf('id="mobile-chat-tab-btn"');
const mMovesPos = indexHtml.indexOf('data-tab="moves"');
assert(mChatPos > 0 && mMovesPos > mChatPos, 'Mobile puts Chat tab before Moves tab');
assert(
  /id="mobile-chat-tab-btn"[\s\S]*?<svg class="tab-icon"[\s\S]*?data-tab="moves"[\s\S]*?<svg class="tab-icon"/.test(indexHtml),
  'Mobile Chat & Moves tabs include inline SVG icons'
);

// Red Leave button + Confirmation Modal
assert(/class="btn btn-leave-danger btn-sm" id="leave-game-btn"/.test(indexHtml), '#leave-game-btn uses red .btn-leave-danger style');
assert(/class="btn btn-leave-danger btn-mob" id="mob-leave-btn"/.test(indexHtml), '#mob-leave-btn uses red .btn-leave-danger style');
assert(
  indexHtml.includes('id="leave-confirm-backdrop"') &&
    indexHtml.includes('id="leave-confirm-stay-btn"') &&
    indexHtml.includes('id="leave-confirm-yes-btn"'),
  'Custom Leave Confirmation Modal exists in index.html'
);

// Dice tray on LEFT of board on desktop (>= 1120px) + Player bar right-aligned over board
const desktopDiceCss = styleCss.slice(styleCss.indexOf('@media (min-width: 1120px)'));
assert(
  /body\.dice-mode\s+\.dice-bar\s*\{[\s\S]*?order:\s*-1;/.test(desktopDiceCss),
  'Desktop Dice tray placed on LEFT of board via order: -1'
);
assert(
  /body\.dice-mode\s+\.player-bar[\s\S]*?margin-left:\s*auto;/.test(desktopDiceCss),
  'Desktop Dice mode player bars align cleanly over the shifted board'
);

for (const slug of ['standard', 'cannibal', 'crazyhouse', 'fog', 'secret', 'dice', 'schrodinger']) {
  const html = fs.readFileSync(path.join(repoDir, 'invite', `${slug}.html`), 'utf8');
  assert(
    html.includes(`content="https://frenzy500.github.io/com.chess/assets/og/${slug}.jpg?v=20261113g"`),
    `invite/${slug}.html uses ?v=20261113g on OG/Twitter image URLs`
  );
}

assert(styleCss.includes('touch-action: manipulation'), 'touch-action: manipulation present for responsive taps');
assert(styleCss.includes('grid-template-columns: repeat(4, 1fr)'), '.mobile-tabs supports 4 tabs (Play | Variants | Chat | Moves)');
assert(
  styleCss.includes('@media (max-width: 900px) and (max-height: 620px)'),
  'Landscape phone viewport board clamp defined'
);
assert(
  /\.chat-text-input\s*\{[\s\S]*?font-size:\s*16px/m.test(styleCss.slice(styleCss.indexOf('@media (max-width: 900px)'))),
  '.chat-text-input uses >= 16px on mobile to prevent iOS Safari zoom'
);
console.log(`   PASS: All ${referencedIds.length} DOM IDs matched, ?v=${expectedVersion} live, Chat-first icons, Left Dice CSS & Red Leave Modal verified!`);

// ---------------------------------------------------------------------------
// 2. Pure Chat Sanitization, Chess.com Badges & Tokenization Tests
// ---------------------------------------------------------------------------
console.log('2. Testing Chess.com badge definitions, safe chat tokenization & sanitization...');
{
  const engineExports = loadAppExports();

  assert.strictEqual(engineExports.sanitizeChatText('  hello\x00\x07 world  '), 'hello world');
  assert.strictEqual(engineExports.sanitizeChatText('x'.repeat(700)).length, 500, 'Chat text capped at 500 chars');
  assert.strictEqual(engineExports.sanitizeChatImageUrl, undefined, 'sanitizeChatImageUrl removed');

  for (const key of ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']) {
    assert(engineExports.CHESS_CHAT_BADGES[key], `Missing Chess.com badge ${key}`);
  }
  assert(engineExports.CHAT_QUICK_EMOJIS.length >= 12, 'Quick emoji palette populated');

  const toks = engineExports.tokenizeChatText('What a move! :brilliant: not :blunder: or :fake_tag:');
  assert.deepStrictEqual(toks, [
    { type: 'text', value: 'What a move! ' },
    { type: 'badge', key: 'brilliant' },
    { type: 'text', value: ' not ' },
    { type: 'badge', key: 'blunder' },
    { type: 'text', value: ' or :fake_tag:' }
  ]);

  assert.strictEqual(
    engineExports.normalizeIncomingChatPacket({ type: 'chat_msg', text: '   ' }),
    null,
    'Empty whitespace chat packet rejected'
  );
  const normText = engineExports.normalizeIncomingChatPacket({
    type: 'chat_msg',
    id: 'm1',
    ts: 1700000000000,
    senderName: '<b>Alice</b>',
    text: ':brilliant: 🔥'
  });
  assert(normText && normText.text === ':brilliant: 🔥');
  assert.strictEqual(normText.senderName, '<b>Alice</b>');
}
console.log('   PASS: Chess.com badges, emoji constants, safe tokenizer & packet sanitizer verified!');

// ---------------------------------------------------------------------------
// 3. Full Dual-Peer Relay Network + Mobile/Desktop Chat UI Harness
// ---------------------------------------------------------------------------
function makeFakeEl(tagName, id = null) {
  const classes = new Set();
  const listeners = new Map();
  const attrs = {};
  const el = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    id,
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    textContent: '',
    value: '',
    src: '',
    alt: '',
    loading: '',
    disabled: false,
    checked: false,
    scrollTop: 0,
    scrollHeight: 240,
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(v) {
      classes.clear();
      String(v || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c));
    },
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) {
            classes.delete(c);
            return false;
          }
          classes.add(c);
          return true;
        }
        if (force) classes.add(c);
        else classes.delete(c);
        return Boolean(force);
      },
      contains: (c) => classes.has(c)
    },
    setAttribute(k, v) {
      attrs[k] = String(v);
      if (k === 'id') el.id = String(v);
      else if (k === 'class') el.className = String(v);
      else if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        el.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    removeAttribute(k) {
      delete attrs[k];
      if (k === 'src') el.src = '';
    },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    append(...nodes) {
      nodes.forEach((n) => el.appendChild(n));
    },
    replaceChildren(...nodes) {
      el.children = [];
      nodes.forEach((n) => el.appendChild(n));
    },
    contains(target) {
      if (target === el) return true;
      return el.children.some((ch) => (ch.contains ? ch.contains(target) : ch === target));
    },
    closest(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        let cur = el;
        while (cur) {
          if (cur.classList && cur.classList.contains(cls)) return cur;
          cur = cur.parentElement;
        }
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const ch of node.children || []) {
          if (sel.startsWith('.')) {
            const cls = sel.slice(1);
            if (ch.classList && ch.classList.contains(cls)) out.push(ch);
          }
          walk(ch);
        }
      };
      walk(el);
      return out;
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    dispatch(ev, eventObj = {}) {
      const e = {
        target: eventObj.target || el,
        preventDefault() {},
        stopPropagation() {},
        ...eventObj
      };
      for (const fn of listeners.get(ev) || []) fn(e);
    },
    focus() {},
    scrollIntoView() {
      el._scrolledIntoView = (el._scrolledIntoView || 0) + 1;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 360, bottom: 360, width: 360, height: 360 };
    }
  };
  return el;
}

function createNetworkHarness() {
  const sockets = new Map();
  const bcRegistry = new Map();

  class FakeBC {
    constructor(name) {
      this.name = name;
      this.closed = false;
      this.onmessage = null;
      if (!bcRegistry.has(name)) bcRegistry.set(name, new Set());
      bcRegistry.get(name).add(this);
    }
    postMessage(msg) {
      if (this.closed) return;
      const cloned = JSON.parse(JSON.stringify(msg));
      for (const ch of [...(bcRegistry.get(this.name) || [])]) {
        if (ch === this || ch.closed) continue;
        setImmediate(() => {
          if (!ch.closed && typeof ch.onmessage === 'function') {
            ch.onmessage({ data: JSON.parse(JSON.stringify(cloned)) });
          }
        });
      }
    }
    close() {
      this.closed = true;
      const set = bcRegistry.get(this.name);
      if (set) set.delete(this);
    }
  }

  class BlockedConn {
    constructor(peerId, metadata) {
      this.peer = peerId;
      this.metadata = metadata || {};
      this.open = false;
      this.destroyed = false;
      this.listeners = {};
    }
    on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    send() {}
    close() { this.destroyed = true; }
  }

  let seq = 0;
  class RelayOnlyPeer {
    constructor(idOrOpts) {
      seq++;
      this.id = typeof idOrOpts === 'string' ? idOrOpts : `guest-p-${seq}`;
      this.destroyed = false;
      this.disconnected = false;
      this.listeners = {};
      this.socket = {
        _wsOpen: () => !this.destroyed,
        _sendHeartbeat: () => {},
        send: (msg) => {
          const dst = sockets.get(msg.dst);
          if (dst && !dst.destroyed) {
            const payload = msg.payload ? JSON.parse(JSON.stringify(msg.payload)) : msg.payload;
            setImmediate(() => {
              if (!dst.destroyed) {
                dst._handleMessage({ type: msg.type, src: this.id, dst: msg.dst, payload });
              }
            });
          }
        }
      };
      sockets.set(this.id, this);
      setImmediate(() => {
        if (!this.destroyed) {
          for (const fn of this.listeners.open || []) fn(this.id);
        }
      });
    }
    _handleMessage() {}
    on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    connect(targetId, opts) { return new BlockedConn(targetId, opts?.metadata); }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      sockets.delete(this.id);
    }
  }

  function createPeerEnv(name, { initialWidth = 375 } = {}) {
    const els = new Map();
    for (const id of htmlIds) els.set(id, makeFakeEl('div', id));

    els.get('setup-minutes-slider').value = '10';
    els.get('setup-increment-slider').value = '0';
    els.get('sidebar').dataset.mobileTab = 'play';
    els.get('leave-confirm-backdrop').classList.add('hidden');
    els.get('chat-emoji-picker').classList.add('hidden');
    els.get('moves-section').classList.add('hidden');
    els.get('desktop-tab-chat').classList.add('active');
    els.get('desktop-tab-chat').setAttribute('aria-selected', 'true');
    els.get('desktop-tab-moves').setAttribute('aria-selected', 'false');
    els.get('player-name-input').value = name;

    const mobTabBtns = [];
    for (const t of ['play', 'variants', 'chat', 'moves']) {
      const b = makeFakeEl('button');
      b.className = 'mobile-tab-btn' + (t === 'play' ? ' active' : '');
      b.dataset.tab = t;
      els.get('mobile-tabs').appendChild(b);
      mobTabBtns.push(b);
    }

    for (const v of ['standard', 'cannibal', 'crazyhouse', 'fog', 'secret', 'dice', 'schrodinger']) {
      const b1 = makeFakeEl('button');
      b1.className = 'variant-btn';
      b1.dataset.variant = v;
      els.get('setup-variant-grid').appendChild(b1);

      const b2 = makeFakeEl('button');
      b2.className = 'variant-btn';
      b2.dataset.variant = v;
      els.get('mobile-variant-grid').appendChild(b2);
    }

    const winListeners = {};
    const docListeners = {};
    const copiedTexts = [];
    const sharedPayloads = [];
    const soundsPlayed = [];
    let scrollCalls = 0;

    const fakeDoc = {
      readyState: 'complete',
      visibilityState: 'visible',
      getElementById: (id) => els.get(id) || null,
      querySelectorAll: (sel) => {
        if (sel === '.theme-dot' || sel === '.variant-info-dot') return [];
        return [];
      },
      createElement: (tag) => makeFakeEl(tag),
      createElementNS: (_, tag) => makeFakeEl(tag),
      createTextNode: (text) => ({ nodeType: 3, textContent: String(text || '') }),
      createDocumentFragment: () => {
        const frag = { children: [], append: (...ns) => ns.forEach((n) => frag.children.push(n)), appendChild: (n) => { frag.children.push(n); return n; } };
        return frag;
      },
      addEventListener: (ev, fn) => { (docListeners[ev] ||= []).push(fn); }
    };

    const fakeWin = {
      innerWidth: initialWidth,
      location: { href: 'https://frenzy500.github.io/com.chess/', search: '' },
      history: { replaceState() {} },
      addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
      dispatch: (ev, obj = {}) => {
        const e = { preventDefault() {}, stopPropagation() {}, ...obj };
        for (const fn of winListeners[ev] || []) fn(e);
      },
      requestAnimationFrame: (cb) => setTimeout(cb, 0),
      scrollTo: () => { scrollCalls++; },
      Blob: global.Blob,
      URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
      document: fakeDoc,
      BroadcastChannel: FakeBC,
      Peer: RelayOnlyPeer
    };
    fakeDoc.defaultView = fakeWin;

    // Tiny AudioContext recorder to verify 'chat' sound fires
    class FakeAudioCtx {
      constructor() {
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.state = 'running';
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(256) };
      }
      createBufferSource() {
        return { buffer: null, connect() {}, start() {}, stop() {} };
      }
      createBiquadFilter() {
        return { type: 'bandpass', frequency: { setValueAtTime() {} }, Q: { setValueAtTime() {} }, connect() {} };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {},
          start() {},
          stop() {}
        };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
      }
    }
    fakeWin.AudioContext = FakeAudioCtx;

    const trailerSource =
      `\n;globalThis.__testHooks = {
        getNet: () => net,
        getSetupConfig: () => setupConfig,
        getGameState: () => gameState,
        getChatMessages: () => chatMessages,
        getUnreadCount: () => unreadChatCount,
        getDesktopTab: () => desktopSidebarTab,
        getOpponentDisconnected: () => opponentDisconnected,
        handleTransientDisconnect: () => handleTransientDisconnect(),
        onHostGuestChannelReady: (v) => onHostGuestChannelReady(v),
        emitPeerOpen: () => {
          for (const fn of (net.peer && net.peer.listeners && net.peer.listeners.open) || []) fn(net.peer.id);
        },
        getClockInterval: () => clockState.intervalId,
        sendChatMessage,
        playSoundOriginalRef: playSound,
        createGameRoom,
        joinGameRoom
      };\n`;

    const ctx = {
      window: fakeWin,
      document: fakeDoc,
      navigator: {
        clipboard: { writeText: async (t) => { copiedTexts.push(t); } },
        share: async (p) => { sharedPayloads.push(p); }
      },
      location: fakeWin.location,
      history: fakeWin.history,
      localStorage: { getItem: () => null, setItem() {} },
      AudioContext: FakeAudioCtx,
      BroadcastChannel: FakeBC,
      Peer: RelayOnlyPeer,
      Worker: undefined,
      URL,
      URLSearchParams,
      console,
      Math,
      Date,
      Set,
      Map,
      Promise,
      setTimeout,
      clearTimeout,
      setInterval: (...args) => {
        const id = setInterval(...args);
        if (id && typeof id.unref === 'function') id.unref();
        return id;
      },
      clearInterval,
      Uint8Array,
      Float32Array,
      module: { exports: {} }
    };
    ctx.globalThis = ctx;

    // Intercept AudioContext oscillator calls by spying on playSound via wrapper if needed; wait—instead wrap playToneNote?
    // Even simpler: patch AudioContext.createOscillator to count tones when playSound('chat') plays!
    let toneCount = 0;
    FakeAudioCtx.prototype.createOscillator = function () {
      toneCount++;
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
    };

    const vmCtx = runAppInContext(ctx, trailerSource);

    return {
      els,
      mobTabBtns,
      copiedTexts,
      sharedPayloads,
      win: fakeWin,
      getToneCount: () => toneCount,
      getScrollCalls: () => scrollCalls,
      hooks: vmCtx.__testHooks,
      exports: vmCtx.module?.exports || {},
      cleanup() {
        clearInterval(vmCtx.__testHooks.getClockInterval());
        const net = vmCtx.__testHooks.getNet();
        if (net.peer && !net.peer.destroyed) net.peer.destroy();
      }
    };
  }

  return { createPeerEnv };
}

(async () => {
  const { createPeerEnv } = createNetworkHarness();

  // -------------------------------------------------------------------------
  // 3. Mobile Action Dock + Editor Tab Sync + Invite Variant Slug Priority
  // -------------------------------------------------------------------------
  console.log('3. Testing Invite URL setup variant priority, Mobile Waiting Dock & Board Editor tab sync...');
  {
    const host = createPeerEnv('Alice', { initialWidth: 375 });
    const h = host.hooks;

    // Start in Standard locally, then open Setup and pick Dice Chess!
    assert.strictEqual(h.getGameState().variant, 'standard');
    host.els.get('mob-play-friend-btn').dispatch('click');
    assert.strictEqual(h.getNet().mode, 'setup');
    assert(!host.els.get('mob-setup-actions').classList.contains('hidden'), '#mob-setup-actions visible in setup mode');
    assert(host.els.get('mob-local-actions').classList.contains('hidden'), '#mob-local-actions hidden in setup mode');

    // Switch setup variant directly via setupConfig and check buildInviteUrl BEFORE gameState switches
    h.getSetupConfig().variant = 'dice';
    const inviteInSetup = host.exports.buildInviteUrl('D9X4K');
    assert(
      inviteInSetup.endsWith('/invite/dice.html?game=D9X4K'),
      `Expected /invite/dice.html?game=D9X4K in setup mode, got ${inviteInSetup}`
    );

    // Go back, switch to Variants tab, open Board Editor -> MUST highlight Play tab button cleanly!
    host.els.get('mob-setup-back-btn').dispatch('click');
    assert.strictEqual(h.getNet().mode, 'local');
    host.exports.setMobileTab('variants');
    assert(host.mobTabBtns[1].classList.contains('active'), 'Variants tab highlighted');
    host.exports.openBoardEditor();
    assert.strictEqual(host.els.get('sidebar').dataset.mobileTab, 'play', 'Editor switched sidebar to play tab');
    assert(host.mobTabBtns[0].classList.contains('active'), 'Play tab button class updated to active');
    assert(!host.mobTabBtns[1].classList.contains('active'), 'Variants tab active highlight cleared');
    assert(!host.els.get('mob-setup-actions').classList.contains('hidden'), 'Exit Editor button shown in mobile dock');
    assert.strictEqual(host.els.get('mob-setup-back-btn').textContent, 'Exit Editor');

    host.els.get('mob-setup-back-btn').dispatch('click'); // closes editor back to local
    assert.strictEqual(h.getNet().mode, 'local');
    assert(!host.els.get('mob-local-actions').classList.contains('hidden'), 'Mobile local actions restored after exiting editor');

    host.cleanup();
  }
  console.log('   PASS: Setup variant invite URL priority, mobile Editor tab sync, & Exit Editor dock verified!');

  // -------------------------------------------------------------------------
  // 4. End-to-End P2P Chat (Badges + Emojis), Reconnect Toast Fix & Leave Modal
  // -------------------------------------------------------------------------
  console.log('4. Testing Chat-first default, Chess.com badges, Reconnect toast accuracy & Leave Modal...');
  {
    const host = createPeerEnv('HostAlice', { initialWidth: 1280 });
    const guest = createPeerEnv('GuestBob', { initialWidth: 375 });

    // Verify Desktop starts with Chat auto-selected!
    assert.strictEqual(host.hooks.getDesktopTab(), 'chat', 'Desktop starts on Chat tab by default');
    assert(!host.els.get('chat-section').classList.contains('hidden'), 'Desktop #chat-section starts visible');
    assert(host.els.get('moves-section').classList.contains('hidden'), 'Desktop #moves-section starts hidden');

    host.hooks.getSetupConfig().variant = 'dice';
    host.hooks.createGameRoom();
    await new Promise((r) => setTimeout(r, 25));

    const roomCode = host.hooks.getNet().roomCode;
    assert.strictEqual(host.hooks.getNet().mode, 'waiting');
    assert(host.els.get('game-feedback').classList.contains('hidden'));

    // Guest joins while on mobile 'variants' tab -> match_start brings Guest back to 'play' tab & enables chat
    guest.exports.setMobileTab('variants');
    guest.hooks.joinGameRoom(roomCode);
    await new Promise((r) => setTimeout(r, 80));

    assert.strictEqual(host.hooks.getNet().mode, 'online');
    assert.strictEqual(guest.hooks.getNet().mode, 'online');
    assert.strictEqual(guest.els.get('sidebar').dataset.mobileTab, 'play', 'Guest auto-switched from variants to play tab on match start');
    assert(!guest.els.get('mobile-chat-pill').classList.contains('hidden'), 'Mobile Chat quick pill visible during online match');

    // Regression Test: Repeated PeerJS 'open' signaling reconnects / channel re-checks while connected MUST NOT spam "Opponent reconnected!"
    guest.hooks.emitPeerOpen();
    guest.hooks.emitPeerOpen();
    host.hooks.onHostGuestChannelReady(false);
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(host.hooks.getGameState().status, 'playing');
    assert.strictEqual(host.els.get('game-feedback').textContent, '', 'Healthy connection never shows false Opponent reconnected toast');

    // Real Disconnect + Comeback MUST show "Opponent reconnected!" once
    host.hooks.handleTransientDisconnect();
    assert.strictEqual(host.hooks.getOpponentDisconnected(), true, 'Host marks opponentDisconnected when connection genuinely drops');
    host.hooks.onHostGuestChannelReady(false);
    assert.strictEqual(host.hooks.getOpponentDisconnected(), false, 'Host clears opponentDisconnected on recovery');
    assert.strictEqual(host.els.get('game-feedback').textContent, 'Opponent reconnected!', 'Host announces Opponent reconnected! after genuine disconnect');
    host.els.get('game-feedback').textContent = '';

    // Test Chess.com badge & Emoji picker on Host -> renders crisp SVG badge + emoji on Guest!
    host.els.get('chat-emoji-btn').dispatch('click');
    assert(!host.els.get('chat-emoji-picker').classList.contains('hidden'), 'Emoji & Chess.com badge picker opens on click');
    const badgeBtns = host.els.get('chat-emoji-picker').querySelectorAll('.chess-badge-btn');
    const emojiBtns = host.els.get('chat-emoji-picker').querySelectorAll('.chat-emoji-item');
    assert.strictEqual(badgeBtns.length, 10, '10 Chess.com Game Review badges rendered in picker');
    assert.strictEqual(emojiBtns.length, 16, '16 quick emojis rendered in picker');

    // Click Brilliant badge + fire emoji -> inserts into #chat-text-input and submits!
    badgeBtns[0].dispatch('click');
    emojiBtns[8].dispatch('click');
    assert(host.els.get('chat-text-input').value.includes(':brilliant:'), 'Clicking Brilliant inserts :brilliant:');

    const tonesBefore = guest.getToneCount();
    host.els.get('chat-form').dispatch('submit');
    await new Promise((r) => setTimeout(r, 60));

    assert(host.els.get('chat-emoji-picker').classList.contains('hidden'), 'Picker closes after sending');
    const gMsgs = guest.hooks.getChatMessages();
    assert.strictEqual(gMsgs.length, 1, 'Guest received Chess.com badge + emoji message');
    assert(gMsgs[0].text.includes(':brilliant:'), 'Guest message carries :brilliant: token');
    assert(guest.getToneCount() > tonesBefore, 'Incoming chat triggered WebAudio notification tone');

    assert.strictEqual(guest.hooks.getUnreadCount(), 1, 'Unread badge count incremented on mobile Play tab');
    guest.els.get('mobile-chat-pill').dispatch('click');
    assert.strictEqual(guest.els.get('sidebar').dataset.mobileTab, 'chat');
    assert.strictEqual(guest.hooks.getUnreadCount(), 0);

    const renderedBadges = guest.els.get('chat-messages').querySelectorAll('.chess-inline-badge');
    assert.strictEqual(renderedBadges.length, 1, 'Rendered .chess-inline-badge SVG inside Guest chat message');

    // Sticker-only Chess.com badge (e.g. ":blunder:") renders as larger sticker badge!
    guest.els.get('chat-text-input').value = ':blunder:';
    guest.els.get('chat-form').dispatch('submit');
    await new Promise((r) => setTimeout(r, 40));
    const hostStickers = host.els.get('chat-messages').querySelectorAll('.chess-sticker-badge');
    assert.strictEqual(hostStickers.length, 1, 'Sticker-only :blunder: rendered with .chess-sticker-badge class');

    // Verify Chat History Persists Across Rematch!
    guest.els.get('mob-resign-btn').dispatch('click');
    guest.els.get('mob-resign-btn').dispatch('click');
    await new Promise((r) => setTimeout(r, 30));
    guest.els.get('mob-rematch-btn').dispatch('click');
    host.els.get('rematch-btn').dispatch('click');
    await new Promise((r) => setTimeout(r, 60));

    assert.strictEqual(host.hooks.getGameState().status, 'playing');
    assert.strictEqual(guest.hooks.getGameState().status, 'playing');
    assert.strictEqual(host.hooks.getChatMessages().length, 2, 'Host kept all 2 chat messages across Rematch!');
    assert.strictEqual(guest.hooks.getChatMessages().length, 2, 'Guest kept all 2 chat messages across Rematch!');

    // Test Red Leave Button + Custom Confirmation Modal!
    guest.els.get('mob-leave-btn').dispatch('click');
    assert(!guest.els.get('leave-confirm-backdrop').classList.contains('hidden'), 'Leave button opens custom Leave Confirmation Modal');
    assert.strictEqual(guest.hooks.getNet().mode, 'online', 'Match remains active before confirming Leave');

    // Clicking Stay dismisses modal & keeps player in active match
    guest.els.get('leave-confirm-stay-btn').dispatch('click');
    assert(guest.els.get('leave-confirm-backdrop').classList.contains('hidden'), 'Stay button closes modal');
    assert.strictEqual(guest.hooks.getNet().mode, 'online', 'Player stays in active match');

    // Pressing Escape also dismisses modal cleanly
    guest.els.get('mob-leave-btn').dispatch('click');
    assert(!guest.els.get('leave-confirm-backdrop').classList.contains('hidden'));
    guest.win.dispatch('keydown', { key: 'Escape', target: { tagName: 'BODY' } });
    assert(guest.els.get('leave-confirm-backdrop').classList.contains('hidden'), 'Escape dismisses Leave Confirmation Modal');
    assert.strictEqual(guest.hooks.getNet().mode, 'online');

    // Clicking Leave Game confirms resign & leaves cleanly back to local
    guest.els.get('mob-leave-btn').dispatch('click');
    guest.els.get('leave-confirm-yes-btn').dispatch('click');
    await new Promise((r) => setTimeout(r, 40));
    assert(guest.els.get('leave-confirm-backdrop').classList.contains('hidden'));
    assert.strictEqual(guest.hooks.getNet().mode, 'local');
    assert.strictEqual(guest.hooks.getChatMessages().length, 0, 'Leaving game wiped chat history cleanly');
    assert.strictEqual(guest.hooks.getUnreadCount(), 0);
    assert.strictEqual(guest.els.get('sidebar').dataset.mobileTab, 'play');
    assert.strictEqual(guest.hooks.getDesktopTab(), 'chat', 'Leaving game keeps Desktop tab reset to Chat');

    host.cleanup();
    guest.cleanup();
  }
  console.log('   PASS: Chat-first default, Chess.com badges, accurate reconnect banner, Leave modal & cleanup verified!');

  console.log('\nALL P2P CHAT & MOBILE PARITY TESTS PASSED!');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
