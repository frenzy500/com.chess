'use strict';

const assert = require('assert');
const { getAppSources, runAppInContext } = require('./load-app');

const { html, js } = getAppSources();

const htmlIds = new Set();
const idRe = /\bid="([^"]+)"/g;
let m;
while ((m = idRe.exec(html)) !== null) htmlIds.add(m[1]);

let networkDelayMs = 5;
const broker = new Map();
const pendingTimers = new Set();

function trackedTimeout(fn, ms) {
  const id = setTimeout(() => {
    pendingTimers.delete(id);
    fn();
  }, ms);
  pendingTimers.add(id);
  return id;
}

class MockConn {
  constructor(targetId) {
    this.targetId = targetId;
    this.open = false;
    this.peerConn = null;
    this.handlers = {};
  }
  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
  }
  emit(ev, arg) {
    for (const fn of this.handlers[ev] || []) fn(arg);
  }
  send(data) {
    const cloned = JSON.parse(JSON.stringify(data));
    trackedTimeout(() => {
      if (this.peerConn && this.open) this.peerConn.emit('data', cloned);
    }, networkDelayMs);
  }
  close() {
    this.open = false;
    if (this.peerConn && this.peerConn.open) {
      this.peerConn.open = false;
      trackedTimeout(() => this.peerConn.emit('close'), 2);
    }
  }
  removeAllListeners() {
    this.handlers = {};
  }
}

class MockPeer {
  constructor(idOrOpts) {
    this.id = typeof idOrOpts === 'string' ? idOrOpts : 'guest-' + Math.random().toString(36).slice(2, 8);
    this.handlers = {};
    broker.set(this.id, this);
    trackedTimeout(() => this.emit('open', this.id), 2);
  }
  on(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
  }
  emit(ev, arg) {
    for (const fn of this.handlers[ev] || []) fn(arg);
  }
  connect(targetId) {
    const c1 = new MockConn(targetId);
    const hostPeer = broker.get(targetId);
    const c2 = new MockConn(this.id);
    c1.peerConn = c2;
    c2.peerConn = c1;
    trackedTimeout(() => {
      c1.open = true;
      c2.open = true;
      hostPeer.emit('connection', c2);
      c1.emit('open');
      c2.emit('open');
    }, 3);
    return c1;
  }
  destroy() {
    broker.delete(this.id);
  }
}

function makeFakeElement(tag = 'div', id = '') {
  const classes = new Set();
  const listeners = {};
  const attrs = {};
  const el = {
    tagName: tag.toUpperCase(),
    id,
    value: '',
    textContent: '',
    disabled: false,
    draggable: false,
    src: '',
    alt: '',
    title: '',
    dataset: {},
    style: {},
    scrollTop: 0,
    scrollHeight: 100,
    children: [],
    setAttribute(k, v) {
      attrs[k] = v;
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    closest() {
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
      // Support `.square[data-r="R"][data-c="C"]` and `.piece` queries used by drag/animation
      const sqMatch = sel.match(/^\.square\[data-r="(\d+)"\]\[data-c="(\d+)"\](?:\s+\.piece)?$/);
      if (sqMatch) {
        const r = sqMatch[1];
        const c = sqMatch[2];
        const sq = this.children.find((ch) => ch.dataset && ch.dataset.r === r && ch.dataset.c === c);
        if (!sq) return null;
        if (sel.endsWith('.piece')) {
          return sq.children.find((ch) => ch.classList && ch.classList.contains('piece')) || null;
        }
        return sq;
      }
      if (sel === '.square.drag-target') {
        return this.children.find((ch) => ch.classList && ch.classList.contains('drag-target')) || null;
      }
      if (sel === '.piece.dragging-source') {
        for (const ch of this.children) {
          const p = (ch.children || []).find((sub) => sub.classList && sub.classList.contains('dragging-source'));
          if (p) return p;
        }
        return null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 640, bottom: 640, width: 640, height: 640 };
    },
    addEventListener(ev, fn) {
      (listeners[ev] ||= []).push(fn);
    },
    click() {
      for (const fn of listeners.click || []) fn({ stopPropagation() {}, preventDefault() {}, target: el });
    },
    trigger(ev, payload = {}) {
      for (const fn of listeners[ev] || []) {
        fn({ stopPropagation() {}, preventDefault() {}, target: el, ...payload });
      }
    }
  };
  return el;
}

const activeIntervals = [];
function fakeSetInterval(fn, ms) {
  const id = setInterval(fn, ms);
  activeIntervals.push(id);
  return id;
}

function createTab(urlSearch = '') {
  const elementsById = new Map();
  for (const id of htmlIds) {
    const el = makeFakeElement('div', id);
    if (
      [
        'promotion-backdrop',
        'game-setup',
        'game-waiting',
        'game-connected',
        'game-feedback',
        'online-controls',
        'drag-ghost',
        'draw-offer-banner'
      ].includes(id)
    ) {
      el.classList.add('hidden');
    }
    elementsById.set(id, el);
  }
  elementsById.get('setup-minutes-slider').value = '10';
  elementsById.get('setup-increment-slider').value = '5';

  const winListeners = {};
  const windowObj = {
    location: {
      href: 'https://frenzy500.github.io/com.chess/' + urlSearch,
      search: urlSearch,
      pathname: '/com.chess/',
      hash: ''
    },
    history: { replaceState() {} },
    addEventListener(ev, fn) {
      (winListeners[ev] ||= []).push(fn);
    },
    triggerWin(ev, payload = {}) {
      for (const fn of winListeners[ev] || []) {
        fn({ preventDefault() {}, stopPropagation() {}, ...payload });
      }
    },
    triggerKey(key) {
      for (const fn of winListeners.keydown || []) {
        fn({ key, target: { tagName: 'DIV' }, preventDefault() {} });
      }
    }
  };

  const documentObj = {
    readyState: 'complete',
    title: 'Chess',
    body: makeFakeElement('body'),
    getElementById: (id) => elementsById.get(id),
    createElement: (tag) => makeFakeElement(tag),
    createElementNS: (_ns, tag) => makeFakeElement(tag),
    createDocumentFragment: () => ({
      isFrag: true,
      children: [],
      appendChild(c) {
        this.children.push(c);
      }
    }),
    querySelectorAll: () => []
  };

  const store = {};
  const sandbox = {
    window: windowObj,
    document: documentObj,
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => {
        store[k] = String(v);
      }
    },
    navigator: { clipboard: { writeText: async () => {} } },
    performance: { now: () => performance.now() },
    Peer: MockPeer,
    URL,
    URLSearchParams,
    Uint8Array,
    setTimeout: trackedTimeout,
    clearTimeout: (id) => {
      pendingTimers.delete(id);
      clearTimeout(id);
    },
    setInterval: fakeSetInterval,
    clearInterval,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    encodeURIComponent,
    module: undefined
  };

  runAppInContext(
    sandbox,
    `\nglobalThis.__dbg = {
      getState: () => gameState,
      setCustomBoard: (fn) => { fn(gameState, PIECE_DEFS); viewPly = gameState.moveHistory.length; renderAll(); broadcastHostState(); },
      getNet: () => net,
      getPremoveQueue: () => premoveQueue,
      getSelectedSq: () => selectedSq,
      getPremoveOriginSq: () => premoveOriginSq,
      getPendingPromotion: () => pendingPromotion,
      getDrag: () => drag,
      isFlipped: () => boardFlipped,
      getProjected: () => getProjectedPremoveState(),
      submitMove: submitPlayerMove
    };`
  );

  // Convert (r, c) board coordinate to clientX/clientY accounting for boardFlipped!
  function sqCenter(r, c) {
    const flipped = sandbox.__dbg.isFlipped();
    const visCol = flipped ? 7 - c : c;
    const visRow = flipped ? 7 - r : r;
    return { clientX: visCol * 80 + 40, clientY: visRow * 80 + 40 };
  }

  const boardEl = elementsById.get('board');

  return {
    elementsById,
    dbg: sandbox.__dbg,
    windowObj,
    sqCenter,
    clickSquare(r, c, pointerId = 1) {
      const pt = sqCenter(r, c);
      boardEl.trigger('pointerdown', { button: 0, pointerId, ...pt });
      windowObj.triggerWin('pointerup', { button: 0, pointerId, ...pt });
    },
    rightClickSquare(r, c, pointerId = 2) {
      const pt = sqCenter(r, c);
      boardEl.trigger('pointerdown', { button: 2, pointerId, ...pt });
      windowObj.triggerWin('pointerup', { button: 2, pointerId, ...pt });
    },
    startDrag(r, c, hoverR, hoverC, pointerId = 1) {
      const p1 = sqCenter(r, c);
      const p2 = sqCenter(hoverR, hoverC);
      boardEl.trigger('pointerdown', { button: 0, pointerId, ...p1 });
      windowObj.triggerWin('pointermove', { pointerId, ...p2 });
    },
    finishDrag(dropR, dropC, pointerId = 1) {
      const p2 = sqCenter(dropR, dropC);
      windowObj.triggerWin('pointerup', { button: 0, pointerId, ...p2 });
    },
    pickPromotion(promoType) {
      const menu = elementsById.get('promotion-menu');
      const btn = menu.children.find((b) => b.dataset && b.dataset.promo === promoType);
      assert(btn, `Expected promotion option "${promoType}" to be open in promotion-menu`);
      btn.click();
    },
    isPromoOpen() {
      return !elementsById.get('promotion-backdrop').classList.contains('hidden');
    }
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred, timeoutMs = 1000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await wait(10);
  }
}

async function createConnectedPair() {
  const host = createTab('');
  host.elementsById.get('open-setup-btn').click();
  host.elementsById.get('create-game-btn').click();
  await waitFor(() => host.dbg.getNet().roomCode !== null);
  const code = host.dbg.getNet().roomCode;
  const guest = createTab(`?game=${code}`);
  await waitFor(() => host.dbg.getNet().mode === 'online' && guest.dbg.getNet().mode === 'online');
  return { host, guest };
}

(async () => {
  console.log('Running exhaustive Multi-Premove, Promotion & Turn-Transition Edge Case Suite...\n');

  // =========================================================================
  // TEST 1 & 2: Selecting a piece during opponent's turn -> opponent moves ->
  // clicking target square IMMEDIATELY moves without unselect/reselect!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // Host is White, Guest is Black (boardFlipped === true on Guest!).
    // 1A. Guest selects Black Knight on g8 (0, 6) during White's turn:
    guest.clickSquare(0, 6);
    assert.deepStrictEqual({ ...guest.dbg.getPremoveOriginSq() }, { r: 0, c: 6 });
    assert.strictEqual(guest.dbg.getSelectedSq(), null);

    // White (Host) plays e2->e4:
    host.clickSquare(6, 4);
    host.clickSquare(4, 4);
    await wait(30);

    // Guest's selection MUST have automatically upgraded to live selectedSq!
    assert.strictEqual(guest.dbg.getPremoveOriginSq(), null);
    assert.deepStrictEqual({ ...guest.dbg.getSelectedSq() }, { r: 0, c: 6 });

    // Guest now clicks f6 (2, 5) ONCE -> Nf6 MUST play immediately!
    guest.clickSquare(2, 5);
    await wait(30);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['e4', 'Nf6']);
    assert.deepStrictEqual([...guest.dbg.getState().moveHistory], ['e4', 'Nf6']);

    // 1B. Now test the reverse: Host selects White Knight g1 (7, 6) BEFORE Guest moves!
    // Wait: first play White d3 so it's Black's turn:
    host.clickSquare(6, 3);
    host.clickSquare(5, 3);
    await wait(30);
    assert.strictEqual(host.dbg.getState().turn, 'b');

    // Host clicks g1 (7, 6) during Black's turn:
    host.clickSquare(7, 6);
    assert.deepStrictEqual({ ...host.dbg.getPremoveOriginSq() }, { r: 7, c: 6 });

    // Guest plays d7->d5:
    guest.clickSquare(1, 3);
    guest.clickSquare(3, 3);
    await wait(30);

    // Host's g1 MUST now be live selectedSq, so 1 click on f3 (5, 5) plays Nf3!
    assert.strictEqual(host.dbg.getPremoveOriginSq(), null);
    assert.deepStrictEqual({ ...host.dbg.getSelectedSq() }, { r: 7, c: 6 });
    host.clickSquare(5, 5);
    await wait(30);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['e4', 'Nf6', 'd3', 'd5', 'Nf3']);
    console.log('1. PASS: Click-selection seamlessly upgrades on turn change for BOTH Guest and Host!');
  }

  // =========================================================================
  // TEST 3: Mid-air Drag during opponent's turn -> Opponent moves mid-drag ->
  // releasing pointer executes live move immediately!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // Guest starts dragging e7 (1, 4) toward e5 (3, 4) while it is still White's turn:
    guest.startDrag(1, 4, 3, 4);
    assert.strictEqual(guest.dbg.getDrag().active, true);
    assert.strictEqual(guest.dbg.getDrag().isPremoveDrag, true);

    // Host plays e2->e4 while Guest is STILL holding the piece mid-air!
    host.clickSquare(6, 4);
    host.clickSquare(4, 4);
    await wait(30);

    // Guest's active drag must stay alive and upgrade to isPremoveDrag === false!
    assert.strictEqual(guest.dbg.getDrag().active, true);
    assert.strictEqual(guest.dbg.getDrag().isPremoveDrag, false);

    // Guest releases pointer on e5 (3, 4) -> immediately plays live move e5!
    guest.finishDrag(3, 4);
    await wait(30);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['e4', 'e5']);
    console.log('2. PASS: Mid-air drag seamlessly upgrades from premove drag to live move on turn change!');
  }

  // =========================================================================
  // TEST 4: Opponent CAPTURES the exact piece Player has selected / mid-drag!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // 1. e4 d5
    host.clickSquare(6, 4); host.clickSquare(4, 4); await wait(25);
    guest.clickSquare(1, 3); guest.clickSquare(3, 3); await wait(25);
    // Now it's White's turn; Guest starts dragging Black's d5 pawn (3, 3) toward d4 (4, 3):
    guest.startDrag(3, 3, 4, 3);
    assert.strictEqual(guest.dbg.getDrag().active, true);

    // White captures d5! (exd5: 4,4 -> 3,3)
    host.clickSquare(4, 4); host.clickSquare(3, 3);
    await wait(30);

    // Guest's drag & selection on (3,3) MUST be cleanly canceled because d5 is now White's pawn!
    assert.strictEqual(guest.dbg.getDrag().active, false);
    assert.strictEqual(guest.dbg.getSelectedSq(), null);
    assert.strictEqual(guest.dbg.getPremoveOriginSq(), null);
    assert(guest.elementsById.get('drag-ghost').classList.contains('hidden'));
    console.log('3. PASS: Capturing a selected/mid-drag piece cleanly cancels drag & selection without getting stuck!');
  }

  // =========================================================================
  // TEST 5: Guest Optimistic Move + Immediate Multi-Premove BEFORE Host RTT!
  // =========================================================================
  {
    networkDelayMs = 45; // Realistic 45ms one-way / 90ms RTT latency
    const { host, guest } = await createConnectedPair();
    host.clickSquare(6, 4); host.clickSquare(4, 4); // 1. e4
    await wait(70);

    // Guest plays 1...e5 AND 5ms later (long before Host's sync_state echo returns!)
    // queues 2 premoves: Ng8->f6 and Nf6->e4!
    guest.clickSquare(1, 4); guest.clickSquare(3, 4); // 1...e5 (optimistic!)
    await wait(5);
    assert.strictEqual(guest.dbg.getState().turn, 'w');
    guest.clickSquare(0, 6); guest.clickSquare(2, 5); // Premove 1: Ng8->f6
    guest.clickSquare(2, 5); guest.clickSquare(4, 4); // Premove 2: Nf6->xe4 (chained from projected f6!)
    assert.strictEqual(guest.dbg.getPremoveQueue().length, 2);

    // Wait 120ms for Host's sync_state echo of 1...e5 to arrive back at Guest:
    await wait(120);
    // Guest's 2 queued premoves MUST still be intact!
    assert.strictEqual(guest.dbg.getPremoveQueue().length, 2);

    // Now Host plays 2. d3 -> Guest's Premove 1 (Nf6) fires automatically!
    host.clickSquare(6, 3); host.clickSquare(5, 3);
    await wait(130);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['e4', 'e5', 'd3', 'Nf6']);
    assert.strictEqual(guest.dbg.getPremoveQueue().length, 1);

    // Now Host plays 3. a3 -> Guest's Premove 2 (Nxe4) fires automatically!
    host.clickSquare(6, 0); host.clickSquare(5, 0);
    await wait(130);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['e4', 'e5', 'd3', 'Nf6', 'a3', 'Nxe4']);
    assert.strictEqual(guest.dbg.getPremoveQueue().length, 0);
    networkDelayMs = 5;
    console.log('4. PASS: Guest 0ms optimistic moves + multi-premove queue survive 90ms RTT & execute turn-by-turn!');
  }

  // =========================================================================
  // TEST 6: 4-Step Multi-Premove Chain With Same Pawn + Multi-Premove Castling!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // Guest chains 4 premoves with the a7 pawn: a7->a5, a5->a4, a4->a3, a3->b2!
    guest.clickSquare(1, 0); guest.clickSquare(3, 0); // P1: a7->a5
    guest.clickSquare(3, 0); guest.clickSquare(4, 0); // P2: a5->a4 (grabbed from projected a5!)
    guest.clickSquare(4, 0); guest.clickSquare(5, 0); // P3: a4->a3 (grabbed from projected a4!)
    guest.clickSquare(5, 0); guest.clickSquare(6, 1); // P4: a3xb2 (diagonal pre-capture!)
    assert.strictEqual(guest.dbg.getPremoveQueue().length, 4);
    assert.strictEqual(guest.dbg.getProjected().board[6][1], 'bp');
    assert.strictEqual(guest.dbg.getProjected().board[1][0], null);
    assert(guest.elementsById.get('status-banner').textContent.includes('4 premoves queued'));

    // Host plays 4 moves: 1. Nf3, 2. Bf1? (wait: 1. Nf3, 2. e3, 3. Be2, 4. O-O!)
    // Even better: let's have Host ALSO multi-premove castling!
    host.clickSquare(7, 6); host.clickSquare(5, 5); // 1. Nf3 -> triggers Guest's a5!
    await wait(35);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['Nf3', 'a5']);

    host.clickSquare(6, 4); host.clickSquare(5, 4); // 2. e3 -> triggers Guest's a4!
    await wait(35);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['Nf3', 'a5', 'e3', 'a4']);

    host.clickSquare(7, 5); host.clickSquare(6, 4); // 3. Be2 -> triggers Guest's a3!
    await wait(35);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['Nf3', 'a5', 'e3', 'a4', 'Be2', 'a3']);

    host.clickSquare(7, 4); host.clickSquare(7, 6); // 4. O-O -> triggers Guest's axb2!
    await wait(35);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['Nf3', 'a5', 'e3', 'a4', 'Be2', 'a3', 'O-O', 'axb2']);
    assert.strictEqual(guest.dbg.getPremoveQueue().length, 0);

    // Also verify Multi-Premove Castling + Rook follow-up on projected board:
    const pair2 = await createConnectedPair();
    // Guest premoves: P1 Ng8->f6, P2 e7->e6, P3 Bf8->e7, P4 Ke8->g8 (O-O), P5 Rf8->e8 (moving the castled Rook!)
    pair2.guest.clickSquare(0, 6); pair2.guest.clickSquare(2, 5); // Ng8->f6
    pair2.guest.clickSquare(1, 4); pair2.guest.clickSquare(2, 4); // e7->e6
    pair2.guest.clickSquare(0, 5); pair2.guest.clickSquare(1, 4); // Bf8->e7 (onto vacated e7!)
    pair2.guest.clickSquare(0, 4); pair2.guest.clickSquare(0, 6); // Ke8->g8 (O-O!)
    // Projected board MUST now have Black Rook on f8 (0, 5) and Black King on g8 (0, 6)!
    assert.strictEqual(pair2.guest.dbg.getProjected().board[0][5], 'br');
    assert.strictEqual(pair2.guest.dbg.getProjected().board[0][6], 'bk');
    pair2.guest.clickSquare(0, 5); pair2.guest.clickSquare(0, 4); // Rf8->e8!
    assert.strictEqual(pair2.guest.dbg.getPremoveQueue().length, 5);

    // Play 5 waiting White moves on Host:
    const whiteMoves = [
      [[6, 0], [5, 0]], // a3
      [[6, 1], [5, 1]], // b3
      [[6, 2], [5, 2]], // c3
      [[6, 3], [5, 3]], // d3
      [[6, 7], [5, 7]]  // h3
    ];
    for (const [f, t] of whiteMoves) {
      pair2.host.clickSquare(f[0], f[1]);
      pair2.host.clickSquare(t[0], t[1]);
      await wait(35);
    }
    assert.deepStrictEqual(
      [...pair2.host.dbg.getState().moveHistory],
      ['a3', 'Nf6', 'b3', 'e6', 'c3', 'Be7', 'd3', 'O-O', 'h3', 'Re8']
    );
    console.log('5. PASS: 4-step pawn chain & 5-step multi-premove O-O + castled Rook chain (Re8) executed!');
  }

  // =========================================================================
  // TEST 7: Premove Pawn Promotion Chooser (Underpromotion to Knight + Chaining
  // the Promoted Knight + Diagonal Pre-Capture Promotion onto Empty Square!)
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // Set up board where White has pawns on a7 (1, 0) and g7 (1, 6), Kings safe, Black to move:
    host.dbg.setCustomBoard((st) => {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.board[r][c] = null;
      st.board[7][4] = 'wk';
      st.board[0][4] = 'bk';
      st.board[1][0] = 'wp'; // White pawn on a7
      st.board[1][6] = 'wp'; // White pawn on g7
      st.board[0][6] = 'br'; // Black rook on g8 (can move to h8!)
      st.board[6][7] = 'bp'; // Black pawn on h2 ( wait: keep h3 bp so Black has safe moves )
      st.board[3][7] = 'bp';
      st.castling = { wK: false, wQ: false, bK: false, bQ: false };
      st.turn = 'b';
      st.historyFrames = [{ board: st.board.map((r) => r.slice()), turn: 'b', inCheck: false, lastMove: null, captured: { w: [], b: [] }, meta: null }];
    });
    await wait(35);

    // 7A. Host (White, during Black's turn) premoves a7 -> a8:
    host.clickSquare(1, 0);
    host.clickSquare(0, 0);
    // Promotion Chooser MUST open immediately!
    assert.strictEqual(host.isPromoOpen(), true);
    assert.strictEqual(host.dbg.getPendingPromotion().isPremove, true);

    // Host chooses KNIGHT ('n'), NOT Queen!
    host.pickPromotion('n');
    assert.strictEqual(host.isPromoOpen(), false);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 1);
    assert.strictEqual(host.dbg.getPremoveQueue()[0].promotion, 'n');
    // Projected board MUST show 'wn' on a8 (0, 0)!
    assert.strictEqual(host.dbg.getProjected().board[0][0], 'wn');

    // Host now chains Premove #2 WITH THAT PROMOTED KNIGHT: Na8 -> b6 (2, 1)!
    host.clickSquare(0, 0);
    host.clickSquare(2, 1);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 2);
    assert.strictEqual(host.dbg.getProjected().board[2][1], 'wn');

    // Also chain Premove #3: diagonal pre-capture promotion g7 -> h8 (1, 6 -> 0, 7) even though h8 is currently EMPTY!
    host.clickSquare(1, 6);
    host.clickSquare(0, 7);
    assert.strictEqual(host.isPromoOpen(), true);
    host.pickPromotion('r'); // Choose Rook ('r')!
    assert.strictEqual(host.dbg.getPremoveQueue().length, 3);

    // Turn 1: Guest plays h5->h4 (3,7 -> 4,7) -> Host plays a8=N!
    guest.clickSquare(3, 7); guest.clickSquare(4, 7);
    await waitFor(() => host.dbg.getState().moveHistory.length >= 2);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['h4', 'a8=N']);

    // Turn 2: Guest plays h4->h3 (4,7 -> 5,7) -> Host plays Nb6!
    guest.clickSquare(4, 7); guest.clickSquare(5, 7);
    await waitFor(() => host.dbg.getState().moveHistory.length >= 4);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['h4', 'a8=N', 'h3', 'Nb6']);

    // Turn 3: Guest plays Rg8->h8 (0,6 -> 0,7) -> Host's diagonal pre-capture gxh8=R+ executes!
    guest.clickSquare(0, 6); guest.clickSquare(0, 7);
    await waitFor(() => host.dbg.getState().moveHistory.length >= 6);
    assert.deepStrictEqual(
      [...host.dbg.getState().moveHistory],
      ['h4', 'a8=N', 'h3', 'Nb6', 'Rh8', 'gxh8=R+']
    );
    console.log('6. PASS: Premove Pawn Promotion Chooser (a8=N -> chained Nb6 + empty-square diagonal gxh8=R+) verified!');
  }

  // =========================================================================
  // TEST 8: Promotion Chooser OPEN during Opponent's Turn -> Opponent Moves
  // BEFORE Player Picks Piece -> Upgrades Seamlessly to Live Promotion!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    host.dbg.setCustomBoard((st) => {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.board[r][c] = null;
      st.board[7][4] = 'wk';
      st.board[0][4] = 'bk';
      st.board[1][0] = 'wp'; // a7
      st.board[3][7] = 'bp'; // h5
      st.castling = { wK: false, wQ: false, bK: false, bQ: false };
      st.turn = 'b';
      st.historyFrames = [{ board: st.board.map((r) => r.slice()), turn: 'b', inCheck: false, lastMove: null, captured: { w: [], b: [] }, meta: null }];
    });
    await wait(35);

    // Host opens premove promotion chooser on a7->a8, and holds it open:
    host.clickSquare(1, 0);
    host.clickSquare(0, 0);
    assert.strictEqual(host.isPromoOpen(), true);
    assert.strictEqual(host.dbg.getPendingPromotion().isPremove, true);

    // Guest plays h5->h4 while Host's Promotion Chooser is STILL OPEN!
    guest.clickSquare(3, 7); guest.clickSquare(4, 7);
    await wait(35);

    // Chooser MUST remain open and upgrade to isPremove === false!
    assert.strictEqual(host.isPromoOpen(), true);
    assert.strictEqual(host.dbg.getPendingPromotion().isPremove, false);

    // Host clicks Bishop ('b') -> immediately executes real move a8=B!
    host.pickPromotion('b');
    await wait(35);
    assert.deepStrictEqual([...guest.dbg.getState().moveHistory], ['h4', 'a8=B']);
    console.log('7. PASS: Open premove Promotion Chooser seamlessly upgrades to live move when opponent moves!');
  }

  // =========================================================================
  // TEST 9: Broken Multi-Premove Chain Clears Entire Queue + Right-Click Cancel!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // 1. e4 e5 2. Qh5 (preparing check or attack)
    host.clickSquare(6, 4); host.clickSquare(4, 4); await wait(25);
    guest.clickSquare(1, 4); guest.clickSquare(3, 4); await wait(25);
    host.clickSquare(6, 3); host.clickSquare(5, 3); await wait(25); // 2. d3
    // Now it's Black's turn. Host queues [P1: a2->a3, P2: b2->b3]:
    host.clickSquare(6, 0); host.clickSquare(5, 0);
    host.clickSquare(6, 1); host.clickSquare(5, 1);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 2);

    // Test Right-click cancels all premoves:
    host.rightClickSquare(4, 4);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 0);

    // Re-queue [P1: a2->a3, P2: b2->b3], and have Guest play Bb4+ (check!):
    host.clickSquare(6, 0); host.clickSquare(5, 0);
    host.clickSquare(6, 1); host.clickSquare(5, 1);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 2);

    guest.clickSquare(0, 5); guest.clickSquare(4, 1); // 2...Bb4+!
    await wait(35);

    // Because White is in check, a2->a3 is ILLEGAL -> ENTIRE queue [P1, P2] must clear!
    assert.strictEqual(host.dbg.getPremoveQueue().length, 0);
    assert.strictEqual(host.dbg.getState().turn, 'w');
    assert.strictEqual(host.dbg.getState().inCheck, true);

    // White blocks check with c2->c3, Black plays Ba5 -> verify P2 (b2->b3) did NOT fire!
    host.clickSquare(6, 2); host.clickSquare(5, 2); await wait(25);
    guest.clickSquare(4, 1); guest.clickSquare(3, 0); await wait(25);
    assert.strictEqual(host.dbg.getState().turn, 'w');
    assert.strictEqual(host.dbg.getState().board[6][1], 'wp'); // b2 pawn untouched!
    console.log('8. PASS: Illegal P1 on check cancels entire multi-premove chain & right-click cancels all premoves!');
  }

  // =========================================================================
  // TEST 10: Custom Variant Piece ('a' Archbishop = Bishop + Knight) Multi-Premoves!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    // Register custom Archbishop ('a') in PIECE_DEFS on both tabs (simulating Section 1 edit):
    const addArchbishop = (st, defs) => {
      defs.a = {
        name: 'Archbishop',
        symbol: 'A',
        value: 7,
        isRoyal: false,
        canPromoteTo: true,
        leapOffsets: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
        slideDirs: [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      };
      st.board[7][1] = 'wa';
    };
    host.dbg.setCustomBoard(addArchbishop);
    guest.dbg.setCustomBoard(addArchbishop);
    await wait(35);

    // Host plays 1. a3 so it's Guest's turn:
    host.clickSquare(6, 0); host.clickSquare(5, 0); await wait(25);

    // Host chains 2 premoves with custom Archbishop: Ab1->c3 (knight leap) -> Ac3->f6 (bishop slide!):
    host.clickSquare(7, 1); host.clickSquare(5, 2); // P1: Ab1->c3
    host.clickSquare(5, 2); host.clickSquare(2, 5); // P2: Ac3->f6
    assert.strictEqual(host.dbg.getPremoveQueue().length, 2);
    assert.strictEqual(host.dbg.getProjected().board[2][5], 'wa');

    guest.clickSquare(1, 0); guest.clickSquare(2, 0); await wait(35); // 1...a6 -> 2. Ac3
    guest.clickSquare(1, 7); guest.clickSquare(2, 7); await wait(35); // 2...h6 -> 3. Af6+ (Knight-jump check on Ke8!)
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['a3', 'a6', 'Ac3', 'h6', 'Af6+']);
    console.log('9. PASS: Custom variant piece (Archbishop) chains multi-premoves + auto-check SAN (Af6+)!');
  }

  // =========================================================================
  // TEST 11: Downstream P2 Sanitization When P1 Succeeds But P2's Piece Was Captured,
  // Drag-to-Promote Premove, and Escape Key Cancellation!
  // =========================================================================
  {
    const { host, guest } = await createConnectedPair();
    host.dbg.setCustomBoard((st) => {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.board[r][c] = null;
      st.board[7][4] = 'wk';
      st.board[0][4] = 'bk';
      st.board[6][4] = 'wp'; // e2
      st.board[7][6] = 'wn'; // g1
      st.board[1][0] = 'wp'; // a7
      st.board[3][2] = 'bb'; // Black bishop on c5 aiming at g1 (3,2 -> 7,6)!
      st.castling = { wK: false, wQ: false, bK: false, bQ: false };
      st.turn = 'b';
      st.historyFrames = [{ board: st.board.map((r) => r.slice()), turn: 'b', inCheck: false, lastMove: null, captured: { w: [], b: [] }, meta: null }];
    });
    await wait(35);

    // Test Drag-to-Promote Premove + Escape key closing chooser without wiping earlier premoves:
    host.clickSquare(6, 4); host.clickSquare(4, 4); // P1: e2->e4
    host.clickSquare(7, 6); host.clickSquare(5, 5); // P2: Ng1->f3
    assert.strictEqual(host.dbg.getPremoveQueue().length, 2);

    // Drag a7 (1,0) -> a8 (0,0) as P3 -> opens Promotion Chooser!
    host.startDrag(1, 0, 0, 0);
    host.finishDrag(0, 0);
    assert.strictEqual(host.isPromoOpen(), true);

    // Press Escape once -> closes Promotion Chooser while keeping [P1, P2]!
    host.windowObj.triggerKey('Escape');
    assert.strictEqual(host.isPromoOpen(), false);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 2);

    // Now Black plays Bxg1 (3,2 -> 7,6), capturing White's Knight on g1!
    // P1 (e2->e4) is still legal and MUST execute, while P2 (Ng1->f3) MUST be pruned immediately!
    guest.clickSquare(3, 2); guest.clickSquare(7, 6);
    await waitFor(() => host.dbg.getState().moveHistory.length >= 2);
    assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['Bxg1', 'e4']);
    assert.strictEqual(host.dbg.getPremoveQueue().length, 0);
    console.log('10. PASS: Downstream P2 pruned when g1 captured, drag-to-promote & Escape key verified!');
  }

  activeIntervals.forEach(clearInterval);
  pendingTimers.forEach(clearTimeout);
  console.log('\nALL MULTI-PREMOVE, PROMOTION & TURN-TRANSITION EDGE CASE TESTS PASSED!');
})();
