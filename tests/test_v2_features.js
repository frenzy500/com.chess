const assert = require('assert');
const { loadAppExports, getAppSources, runAppInContext } = require('./load-app');
const engine = loadAppExports();

const { html, css, js } = getAppSources();

// 1. Verify all DOM IDs match index.html
const ids = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
for (const id of ids) {
  assert(html.includes(`id="${id}"`), `Missing id="${id}" in index.html`);
}
console.log(`1. PASS: All ${ids.length} DOM IDs in game.js exist in index.html`);

// 2. Verify "Party" replaced with "Game" in visible HTML
assert(!html.includes('Create Party'), 'HTML should say Create Game');
assert(html.includes('Create Game'), 'HTML must have Create Game');
assert(html.includes('Join Game'), 'HTML must have Join Game');
assert(css.includes('user-select: none'), 'CSS must prevent accidental text highlighting');
console.log('2. PASS: UI terminology ("Game") and user-select: none verified');

// 3. Test 0 / -67 Elo Easter Egg & Name Sanitizer
assert.strictEqual(engine.computeDisplayElo('Guest'), 0);
assert.strictEqual(engine.computeDisplayElo('Alex'), 0);
assert.strictEqual(engine.computeDisplayElo('6'), 0);
assert.strictEqual(engine.computeDisplayElo('67'), -67);
assert.strictEqual(engine.computeDisplayElo('Pro67Player'), -67);
assert.strictEqual(engine.computeDisplayElo('12367'), -67);
console.log('3. PASS: 0 Elo / -67 Elo rule verified');

// 4. Test Variant-Proof Premoves & History Snapshots with a Custom Variant Piece!
engine.PIECE_DEFS.z = {
  name: 'Wizard',
  symbol: 'Z',
  value: 7,
  isRoyal: false,
  canPromoteTo: false,
  leapOffsets: [[-3, 0], [3, 0], [0, -3], [0, 3]],
  slideDirs: [[-1, -1], [1, 1]],
  afterMove(nextState, move) {
    // Custom variant side-effect: transforms a8 into a white pawn!
    nextState.board[0][0] = 'wp';
  }
};
const customState = engine.createInitialState();
customState.board[4][4] = 'wz';
const preTargets = engine.getPremoveTargetsForSquare(customState, 4, 4, 'w');
// Wizard at (4,4) should automatically premove 3-step jumps (1,4), (7,4), (4,1), (4,7) + diagonals even through pawns!
assert(preTargets.some((t) => t.r === 1 && t.c === 4), 'Wizard premove jump through occupied rank');
assert(preTargets.some((t) => t.r === 0 && t.c === 0), 'Wizard premove slide through occupied pawns');

const afterCustom = engine.tryMakeMove(customState, { r: 4, c: 4 }, { r: 3, c: 3 });
assert.strictEqual(afterCustom.board[0][0], 'wp');
// Verify snapshot 0 still has 'br' at (0,0) while snapshot 1 has 'wp' at (0,0)!
assert.strictEqual(afterCustom.historyFrames[0].board[0][0], 'br');
assert.strictEqual(afterCustom.historyFrames[1].board[0][0], 'wp');
delete engine.PIECE_DEFS.z;
console.log('4. PASS: Custom variant piece + afterMove works automatically with Premoves & < / > Snapshots!');

// 5. Full End-to-End Simulated P2P Test (Setup -> Timed Clocks -> Names/-67 Elo -> Premoves -> Replay < / > -> Draw Offer)
const broker = new Map();

class MockConn {
  constructor() {
    this.open = false;
    this.peerSide = null;
    this.listeners = {};
  }
  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }
  emit(ev, arg) {
    for (const fn of this.listeners[ev] || []) fn(arg);
  }
  send(data) {
    if (!this.open || !this.peerSide || !this.peerSide.open) return;
    const copy = JSON.parse(JSON.stringify(data));
    this.peerSide.emit('data', copy);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    if (this.peerSide && this.peerSide.open) {
      this.peerSide.open = false;
      this.peerSide.emit('close');
    }
  }
}

class MockPeer {
  constructor(idOrOpts) {
    this.id = typeof idOrOpts === 'string' ? idOrOpts : 'guest-' + Math.random().toString(36).slice(2);
    this.listeners = {};
    setImmediate(() => {
      if (broker.has(this.id)) {
        this.emit('error', { type: 'unavailable-id' });
        return;
      }
      broker.set(this.id, this);
      this.emit('open', this.id);
    });
  }
  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }
  emit(ev, arg) {
    for (const fn of this.listeners[ev] || []) fn(arg);
  }
  connect(targetId) {
    const clientConn = new MockConn();
    const hostPeer = broker.get(targetId);
    setImmediate(() => {
      if (!hostPeer) {
        this.emit('error', { type: 'peer-unavailable' });
        return;
      }
      const hostConn = new MockConn();
      clientConn.peerSide = hostConn;
      hostConn.peerSide = clientConn;
      hostPeer.emit('connection', hostConn);
      clientConn.open = true;
      hostConn.open = true;
      clientConn.emit('open');
      hostConn.emit('open');
    });
    return clientConn;
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
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    closest() { return null; },
    get className() { return [...classes].join(' '); },
    set className(v) {
      classes.clear();
      String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
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
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
    replaceChildren(...nodes) {
      this.children = [];
      nodes.forEach((n) => this.appendChild(n));
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 640, bottom: 640, width: 640, height: 640 };
    },
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    click() {
      for (const fn of listeners.click || []) fn({ stopPropagation() {}, preventDefault() {}, target: el });
    },
    trigger(ev, payload = {}) {
      for (const fn of listeners[ev] || []) fn({ stopPropagation() {}, preventDefault() {}, target: el, ...payload });
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
  for (const id of ids) {
    const el = makeFakeElement('div', id);
    if (['promotion-backdrop', 'game-setup', 'game-waiting', 'game-connected', 'game-feedback', 'online-controls', 'drag-ghost', 'draw-offer-banner'].includes(id)) {
      el.classList.add('hidden');
    }
    elementsById.set(id, el);
  }
  elementsById.get('setup-minutes-slider').value = '10';
  elementsById.get('setup-increment-slider').value = '5';

  const winListeners = {};
  const windowObj = {
    location: {
      href: 'https://example.github.io/mychess/' + urlSearch,
      search: urlSearch,
      pathname: '/mychess/',
      hash: ''
    },
    history: { replaceState() {} },
    addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
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
    createDocumentFragment: () => ({ isFrag: true, children: [], appendChild(c) { this.children.push(c); } }),
    querySelectorAll: () => []
  };

  let copiedText = '';
  const store = {};
  const sandbox = {
    window: windowObj,
    document: documentObj,
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); }
    },
    navigator: { clipboard: { writeText: async (t) => { copiedText = t; } } },
    performance: { now: () => performance.now() },
    Peer: MockPeer,
    URL,
    URLSearchParams,
    Uint8Array,
    setTimeout,
    clearTimeout,
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
    '\nglobalThis.__dbg = { getState: () => gameState, getNet: () => net, getClock: () => clockState, getViewPly: () => viewPly, setPremove: enqueuePremove, submitMove: submitPlayerMove, getArrows: () => drawnArrows, toggleArrow: toggleRightClickArrowOrMark, isFlipped: () => boardFlipped };'
  );
  return { elementsById, dbg: sandbox.__dbg, windowObj, getCopied: () => copiedText };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const host = createTab('');

  // Set Host name with "67" -> Elo should become -67!
  host.elementsById.get('player-name-input').value = 'Boss67';
  host.elementsById.get('player-name-input').trigger('input');
  assert.strictEqual(host.elementsById.get('elo-preview').textContent, '(-67)');

  // Clicking "Create Game" should open Setup first, NOT create PeerJS room yet!
  host.elementsById.get('open-setup-btn').click();
  assert.strictEqual(host.dbg.getNet().mode, 'setup');
  assert.strictEqual(host.dbg.getNet().roomCode, null);

  // Configure 5 minutes + 12 seconds increment
  host.elementsById.get('setup-minutes-slider').value = '5';
  host.elementsById.get('setup-minutes-slider').trigger('input');
  host.elementsById.get('setup-increment-slider').value = '12';
  host.elementsById.get('setup-increment-slider').trigger('input');

  // Now click "Start & Get Code"
  host.elementsById.get('create-game-btn').click();
  await wait(30);
  const code = host.dbg.getNet().roomCode;
  assert.strictEqual(code.length, 5);
  assert.strictEqual(host.dbg.getNet().mode, 'waiting');

  // Guest opens ?game=CODE
  const guest = createTab(`?game=${code}`);
  await wait(40);
  assert.strictEqual(host.dbg.getNet().mode, 'online');
  assert.strictEqual(guest.dbg.getNet().mode, 'online');
  assert.strictEqual(guest.dbg.getClock().minutes, 5);
  assert.strictEqual(guest.dbg.getClock().incrementSec, 12);
  // Guest sees Host's name "Boss67" and (-67) Elo on top bar!
  assert.strictEqual(guest.elementsById.get('top-player-name').textContent, 'Boss67');
  assert.strictEqual(guest.elementsById.get('top-player-elo').textContent, '(-67)');
  assert.strictEqual(guest.elementsById.get('bottom-player-elo').textContent, '(0)');

  // Guest queues a PREMOVE (e7 -> e5) BEFORE Host moves!
  guest.dbg.setPremove({ r: 1, c: 4 }, { r: 3, c: 4 });

  // Host plays e4 -> Guest's premove e5 should automatically execute!
  host.dbg.submitMove({ r: 6, c: 4 }, { r: 4, c: 4 }, null, false);
  await wait(90);
  assert.deepStrictEqual([...host.dbg.getState().moveHistory], ['e4', 'e5']);
  assert.deepStrictEqual([...guest.dbg.getState().moveHistory], ['e4', 'e5']);
  console.log('5. PASS: Setup panel, 5+12 Clocks, Names + (-67) Elo sync, and automatic Premove execution verified!');

  // Test Move History Replay (< / > buttons and Left/Right arrow keys)
  assert.strictEqual(host.dbg.getViewPly(), 2);
  host.windowObj.triggerKey('ArrowLeft');
  assert.strictEqual(host.dbg.getViewPly(), 1);
  host.elementsById.get('nav-first-btn').click();
  assert.strictEqual(host.dbg.getViewPly(), 0);
  host.windowObj.triggerKey('ArrowRight');
  assert.strictEqual(host.dbg.getViewPly(), 1);
  host.elementsById.get('nav-last-btn').click();
  assert.strictEqual(host.dbg.getViewPly(), 2);

  // Test Right-Click Tactical Arrow + Board Flip
  host.dbg.toggleArrow({ r: 7, c: 6 }, { r: 5, c: 5 }); // Knight arrow g1->f3
  assert.strictEqual(host.dbg.getArrows().length, 1);

  // Test Copy PGN
  host.elementsById.get('copy-pgn-btn').click();
  await wait(20);
  assert(host.getCopied().includes('1. e4 e5'), 'PGN should contain moves');
  assert(host.getCopied().includes('[White "Boss67"]'), 'PGN should contain custom name');

  // Test Offer Draw + Accept Draw
  guest.elementsById.get('draw-btn').click();
  await wait(30);
  assert(!host.elementsById.get('draw-offer-banner').classList.contains('hidden'));
  host.elementsById.get('accept-draw-btn').click();
  await wait(30);
  assert.strictEqual(host.dbg.getState().status, 'draw_agreement');
  assert.strictEqual(guest.dbg.getState().status, 'draw_agreement');
  console.log('6. PASS: Replay (< / > & Arrow keys), Tactical Arrows, Copy PGN, and Mutual Draw Offer verified!');

  activeIntervals.forEach(clearInterval);
  console.log('\nALL V2 POLISH & MULTIPLAYER TESTS PASSED!');
})();
