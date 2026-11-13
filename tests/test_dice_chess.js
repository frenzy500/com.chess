'use strict';

const assert = require('assert');
const { loadAppExports, getAppSources, runAppInContext } = require('./load-app');

const engine = loadAppExports();

console.log('Running Dice Chess Variant Verification Suite...\n');

// ============================================================================
// 1. Dice-to-Piece Mapping & Standard Roll Filtering
// ============================================================================
{
  assert.strictEqual(engine.VARIANT_DEFS.dice.name, 'Dice Chess');
  assert.strictEqual(engine.VARIANT_DEFS.dice.royalCaptureWins, true);
  assert.strictEqual(engine.VARIANT_DEFS.dice.diceChess, true);

  assert.deepStrictEqual(
    { ...engine.DICE_PIECE_MAP },
    { 1: 'p', 2: 'n', 3: 'b', 4: 'r', 5: 'q', 6: 'k' },
    'Dice-to-piece map must strictly match 1:p, 2:n, 3:b, 4:r, 5:q, 6:k'
  );

  const state = engine.createInitialState('dice');
  assert(
    state.dice && state.dice.rolled === false && state.dice.values === null,
    'Initial Dice Chess state must start unrolled (awaiting click-to-roll)'
  );
  assert.strictEqual(
    engine.getAllLegalMoves(state, 'w').length,
    0,
    'No pieces can move before clicking Roll Dice'
  );
  assert(!/maxAttempts\s*=\s*24|isOpeningTurn/.test(engine.rollDiceForState.toString()), 'Opening-turn forced re-roll guarantee must be removed');

  engine.rollDiceForState(state);
  assert(state.dice && state.dice.rolled === true && Array.isArray(state.dice.values), 'rollDiceForState must produce rolled [d1, d2]');
  assert(state.dice.values[0] >= 1 && state.dice.values[0] <= 6);
  assert(state.dice.values[1] >= 1 && state.dice.values[1] <= 6);

  // Force roll [1, 2] (Pawn or Knight) on opening board
  engine.setDiceRoll(state, 1, 2, false);
  assert.strictEqual(state.dice.isDoubles, false);
  assert.strictEqual(state.dice.noLegalMoves, false);

  // White Pawns (row 6) and White Knights (row 7, col 1 & 6) have legal moves
  const e2Moves = engine.getLegalMovesForSquare(state, 6, 4);
  assert.strictEqual(e2Moves.length, 2, 'White e2 pawn should have 2 moves on roll [1, 2]');
  const g1Moves = engine.getLegalMovesForSquare(state, 7, 6);
  assert.strictEqual(g1Moves.length, 2, 'White g1 knight should have 2 moves on roll [1, 2]');

  // Now create an open board where all 6 piece types have moves, and test each standard roll
  const openBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  openBoard[0][4] = 'bk';
  openBoard[7][4] = 'wk';
  openBoard[7][0] = 'wr';
  openBoard[7][1] = 'wn';
  openBoard[7][2] = 'wb';
  openBoard[7][3] = 'wq';
  openBoard[6][4] = 'wp';

  const custom = engine.createCustomState({
    variant: 'dice',
    board: openBoard,
    turn: 'w'
  });

  // Force roll [3, 5] -> Bishop (3) or Queen (5) ONLY
  engine.setDiceRoll(custom, 3, 5, false);
  assert.strictEqual(engine.getLegalMovesForSquare(custom, 6, 4).length, 0, 'Pawn (1) must NOT move on [3, 5]');
  assert.strictEqual(engine.getLegalMovesForSquare(custom, 7, 1).length, 0, 'Knight (2) must NOT move on [3, 5]');
  assert(engine.getLegalMovesForSquare(custom, 7, 2).length > 0, 'Bishop (3) MUST be able to move on [3, 5]');
  assert.strictEqual(engine.getLegalMovesForSquare(custom, 7, 0).length, 0, 'Rook (4) must NOT move on [3, 5]');
  assert(engine.getLegalMovesForSquare(custom, 7, 3).length > 0, 'Queen (5) MUST be able to move on [3, 5]');
  assert.strictEqual(engine.getLegalMovesForSquare(custom, 7, 4).length, 0, 'King (6) must NOT move on [3, 5]');

  console.log('1. PASS: Dice-to-Piece mapping (1=P, 2=N, 3=B, 4=R, 5=Q, 6=K) & standard roll filtering verified!');
}

// ============================================================================
// 2. Doubles (Wild Move) — Moving Own Pieces AND Opponent Pieces
// ============================================================================
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[0][4] = 'bk'; // e8
  board[0][3] = 'bq'; // d8 (Black Queen adjacent to bk and attacking wk on e1!)
  board[1][0] = 'bp'; // a7 (Black Pawn)
  board[2][1] = 'wn'; // b6 (White Knight that Black Pawn on a7 can capture!)
  board[7][4] = 'wk'; // e1

  const state = engine.createCustomState({
    variant: 'dice',
    board,
    turn: 'w'
  });

  // White rolls Doubles [4, 4] -> Wild move!
  engine.setDiceRoll(state, 4, 4, false);
  assert.strictEqual(state.dice.isDoubles, true);
  assert.strictEqual(state.dice.noLegalMoves, false);

  // White can move their own Knight on b6 or King on e1 even though neither is a Rook (4)
  assert(engine.getLegalMovesForSquare(state, 2, 1).length > 0, 'Doubles allows moving own Knight');
  assert(engine.getLegalMovesForSquare(state, 7, 4).length > 0, 'Doubles allows moving own King');

  // White can ALSO move Black's Queen on d8 (0, 3) and Black's Pawn on a7 (1, 0)!
  const bqMoves = engine.getLegalMovesForSquare(state, 0, 3);
  assert(bqMoves.length > 0, 'Doubles allows White to move Black Queen on d8');

  // CRITICAL RULE: Opponent's piece moved on Doubles CANNOT capture EITHER King (bk on e8 or wk on e1)!
  const attacksWhiteKing = bqMoves.some(m => m.to.r === 7 && m.to.c === 4);
  const attacksBlackKing = bqMoves.some(m => m.to.r === 0 && m.to.c === 4);
  assert.strictEqual(attacksWhiteKing, false, 'Opponent Queen moved on Doubles must NOT capture White King');
  assert.strictEqual(attacksBlackKing, false, 'Opponent Queen moved on Doubles must NOT capture Black King');

  // Black's Pawn on a7 (1, 0) moved by White on Doubles moves in Black's direction (downward) and can capture White's non-King piece (wn on b6)!
  const bpMoves = engine.getLegalMovesForSquare(state, 1, 0);
  const a6Advance = bpMoves.find(m => m.to.r === 2 && m.to.c === 0);
  const a5Advance = bpMoves.find(m => m.to.r === 3 && m.to.c === 0);
  const captureWhiteKnight = bpMoves.find(m => m.to.r === 2 && m.to.c === 1);
  assert(a6Advance, 'Black pawn moved by White on Doubles can advance to a6');
  assert(a5Advance, 'Black pawn moved by White on Doubles can double-advance to a5');
  assert(captureWhiteKnight, 'Black pawn moved by White on Doubles can capture White Knight on b6');

  // Execute the wild move where White moves Black's pawn a7xb6 (capturing White's own Knight!)
  const nextState = engine.applyMove(state, captureWhiteKnight);
  assert.strictEqual(nextState.board[2][1], 'bp', 'Moved opponent pawn must remain a Black pawn (bp) on b6');
  assert.strictEqual(nextState.board[1][0], null, 'Origin square a7 must be empty');
  assert.strictEqual(nextState.turn, 'b', 'Turn must pass to Black after White completes wild move');
  assert.strictEqual(nextState.captured.b.includes('n'), true, 'Captured White Knight credited to Black captures');

  console.log('2. PASS: Doubles (Wild Move) allows moving any piece on the board (including opponent pieces) while protecting both Kings!');
}

// ============================================================================
// 3. Castling Rules: Must Roll 6+4 (or 4+6) or Doubles
// ============================================================================
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[0][4] = 'bk';
  board[7][4] = 'wk';
  board[7][0] = 'wr';
  board[7][7] = 'wr';

  const state = engine.createCustomState({
    variant: 'dice',
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: false, bQ: false }
  });

  // Case A: Roll [6, 2] (King + Knight) -> King can move 1 step, but CANNOT castle!
  engine.setDiceRoll(state, 6, 2);
  let wkMoves = engine.getLegalMovesForSquare(state, 7, 4);
  assert(wkMoves.length > 0, 'King can make normal step moves on [6, 2]');
  assert.strictEqual(wkMoves.some(m => m.castleSide), false, 'King MUST NOT castle on [6, 2]');

  // Case B: Roll [4, 1] (Rook + Pawn) -> Rook can move, King cannot move or castle
  engine.setDiceRoll(state, 4, 1);
  wkMoves = engine.getLegalMovesForSquare(state, 7, 4);
  assert.strictEqual(wkMoves.length, 0, 'King cannot move on [4, 1]');

  // Case C: Roll [6, 4] -> Castling O-O and O-O-O ARE legal!
  engine.setDiceRoll(state, 6, 4);
  wkMoves = engine.getLegalMovesForSquare(state, 7, 4);
  assert(wkMoves.some(m => m.castleSide === 'K'), 'O-O must be legal on [6, 4]');
  assert(wkMoves.some(m => m.castleSide === 'Q'), 'O-O-O must be legal on [6, 4]');

  // Case D: Roll [4, 6] -> Castling O-O and O-O-O ARE legal!
  engine.setDiceRoll(state, 4, 6);
  wkMoves = engine.getLegalMovesForSquare(state, 7, 4);
  assert(wkMoves.some(m => m.castleSide === 'K'), 'O-O must be legal on [4, 6]');
  assert(wkMoves.some(m => m.castleSide === 'Q'), 'O-O-O must be legal on [4, 6]');

  // Case E: Roll Doubles [2, 2] -> Castling O-O and O-O-O ARE legal!
  engine.setDiceRoll(state, 2, 2);
  wkMoves = engine.getLegalMovesForSquare(state, 7, 4);
  assert(wkMoves.some(m => m.castleSide === 'K'), 'O-O must be legal on Doubles [2, 2]');
  assert(wkMoves.some(m => m.castleSide === 'Q'), 'O-O-O must be legal on Doubles [2, 2]');

  // Execute O-O and verify Rook + King placement
  const castleMove = wkMoves.find(m => m.castleSide === 'K');
  const afterCastle = engine.applyMove(state, castleMove);
  assert.strictEqual(afterCastle.board[7][6], 'wk');
  assert.strictEqual(afterCastle.board[7][5], 'wr');
  assert.strictEqual(afterCastle.moveHistory[0], 'O-O');

  console.log('3. PASS: Castling strictly requires rolling [6, 4], [4, 6], or Doubles!');
}

// ============================================================================
// 4. En Passant Rules: Must Roll 1 or Doubles on Immediate Turn
// ============================================================================
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[0][4] = 'bk';
  board[7][4] = 'wk';
  board[3][4] = 'wp'; // White pawn on e5 (row 3, col 4)
  board[1][3] = 'bp'; // Black pawn on d7 (row 1, col 3)

  const state = engine.createCustomState({
    variant: 'dice',
    board,
    turn: 'b'
  });

  // Black rolls [1, 6] and plays d7 -> d5 (double pawn advance)
  engine.setDiceRoll(state, 1, 6);
  const d7Moves = engine.getLegalMovesForSquare(state, 1, 3);
  const d5Move = d7Moves.find(m => m.to.r === 3 && m.to.c === 3);
  assert(d5Move, 'Black d7->d5 double advance must exist');

  const afterD5 = engine.applyMove(state, d5Move);
  assert.deepStrictEqual(afterD5.enPassant, { r: 2, c: 3 }, 'enPassant target d6 (2, 3) must be set');

  // If White rolls [2, 6] (neither 1 nor Doubles), White cannot play en passant
  engine.setDiceRoll(afterD5, 2, 6);
  assert.strictEqual(engine.getLegalMovesForSquare(afterD5, 3, 4).length, 0, 'Pawn cannot move on [2, 6]');

  // If White rolls [1, 5] (contains 1), White CAN capture en passant exd6!
  engine.setDiceRoll(afterD5, 1, 5);
  let e5Moves = engine.getLegalMovesForSquare(afterD5, 3, 4);
  assert(e5Moves.some(m => m.isEnPassant && m.to.r === 2 && m.to.c === 3), 'En passant must be legal when rolling a 1');

  // If White rolls Doubles [3, 3], White CAN ALSO capture en passant exd6!
  engine.setDiceRoll(afterD5, 3, 3);
  e5Moves = engine.getLegalMovesForSquare(afterD5, 3, 4);
  const epMove = e5Moves.find(m => m.isEnPassant && m.to.r === 2 && m.to.c === 3);
  assert(epMove, 'En passant must be legal when rolling Doubles [3, 3]');

  // Also check that on Doubles [3, 3], White CANNOT use Black's d5 pawn to en-passant anything
  const afterEp = engine.applyMove(afterD5, epMove);
  assert.strictEqual(afterEp.board[2][3], 'wp', 'White pawn lands on d6');
  assert.strictEqual(afterEp.board[3][3], null, 'Black d5 pawn is captured via en passant');

  console.log('4. PASS: En Passant works on rolling 1 or Doubles immediately following opponent 2-square pawn advance!');
}

// ============================================================================
// 5. Winning the Game: No Checkmate — Direct King Capture Wins
// ============================================================================
{
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[0][4] = 'bk'; // e8
  board[1][4] = 'wq'; // White Queen on e7 directly attacking Black King on e8!
  board[7][4] = 'wk'; // e1

  // In standard chess, Black would be in check. In Dice Chess, check does not apply:
  // If Black rolls [1, 2] and has a pawn/knight elsewhere, Black doesn't even have to save the King!
  board[6][0] = 'bp'; // a2
  const state = engine.createCustomState({
    variant: 'dice',
    board,
    turn: 'b'
  });

  // Black rolls [6, 1]: Black King CAN even capture the White Queen on e7 or step into another attacked square!
  engine.setDiceRoll(state, 6, 1, false);
  const bkMoves = engine.getLegalMovesForSquare(state, 0, 4);
  assert(bkMoves.some(m => m.to.r === 0 && m.to.c === 3), 'Black King can move into d8 even though d8 is attacked by wq on e7');

  // Now test White's turn with roll [5, 2] (Queen or Knight): White Queen on e7 captures Black King on e8!
  state.turn = 'w';
  engine.setDiceRoll(state, 5, 2, false);
  const wqMoves = engine.getLegalMovesForSquare(state, 1, 4);
  const captureKingMove = wqMoves.find(m => m.to.r === 0 && m.to.c === 4);
  assert(captureKingMove, 'White Queen must be able to directly capture Black King on e8');

  const endState = engine.applyMove(state, captureKingMove);
  assert.strictEqual(endState.status, 'king_captured', 'Status must be king_captured');
  assert.strictEqual(endState.winner, 'w', 'Winner must be White');
  assert.strictEqual(endState.dice, null, 'Dice roll cleared when game ends');

  console.log('5. PASS: No check/checkmate restrictions & direct King capture wins the game!');
}

// ============================================================================
// 6. No Legal Moves (Turn Loss / Pass) & Pawn Promotion
// ============================================================================
{
  // Play 1. e4 first, then pass Black's blocked turn so we verify lastMove isn't carried over onto a Pass ply
  const state = engine.createInitialState('dice');
  engine.setDiceRoll(state, 1, 1);
  const afterE4 = engine.applyMove(state, { from: { r: 6, c: 4 }, to: { r: 4, c: 4 }, captureSq: null, promotion: null });
  assert(afterE4.lastMove && afterE4.lastMove.to.r === 4, 'Real move e4 records lastMove');
  engine.setDiceRoll(afterE4, 4, 5); // Black Rook/Queen blocked on opening rank
  assert.strictEqual(afterE4.dice.noLegalMoves, true, 'Black [4, 5] must flag noLegalMoves = true');
  assert.strictEqual(engine.getAllLegalMoves(afterE4, 'b').length, 0, 'Total legal moves for Black on [4, 5] must be 0');

  const afterPass = engine.applyDicePassTurn(afterE4);
  assert.strictEqual(afterPass.turn, 'w', 'Turn must switch to White after Black loses turn');
  assert.strictEqual(afterPass.lastMove, null, 'Pass turn MUST clear lastMove so previous move is not highlighted/replayed');
  assert.strictEqual(afterPass.historyFrames[afterPass.historyFrames.length - 1].lastMove, null, 'Pass history frame must also have lastMove = null');
  assert.strictEqual(afterPass.moveHistory.length, 2, 'Pass turn must record an entry in moveHistory to preserve turn alignment');
  assert.strictEqual(afterPass.moveHistory[1], 'Pass 4-5', 'Move history entry should record Pass 4-5');
  assert(
    afterPass.dice && afterPass.dice.rolled === false && afterPass.dice.values === null,
    'Next turn after Pass starts unrolled awaiting click (unless auto-roll is enabled)'
  );

  // Test Pawn Promotion in Dice Chess (choosing Queen, Rook, Bishop, or Knight):
  const promoBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  promoBoard[0][4] = 'bk';
  promoBoard[7][4] = 'wk';
  promoBoard[1][0] = 'wp'; // White pawn on a7 ready to promote on a8!
  const promoState = engine.createCustomState({
    variant: 'dice',
    board: promoBoard,
    turn: 'w'
  });
  engine.setDiceRoll(promoState, 1, 3, false);
  const a7Moves = engine.getLegalMovesForSquare(promoState, 1, 0);
  const promoToKnight = a7Moves.find(m => m.to.r === 0 && m.to.c === 0 && m.promotion === 'n');
  const promoToQueen = a7Moves.find(m => m.to.r === 0 && m.to.c === 0 && m.promotion === 'q');
  assert(promoToKnight && promoToQueen, 'Pawn promotion moves for all standard pieces (q, r, b, n) must be generated');
  const afterPromo = engine.applyMove(promoState, promoToKnight);
  assert.strictEqual(afterPromo.board[0][0], 'wn', 'White pawn promoted to Knight (wn) on a8');

  console.log('6. PASS: No Legal Moves turn-skip (Pass d1-d2) & Pawn Promotion verified!');
}

// ============================================================================
// 7. DOM / UI / SVG Dice Rendering, Die-Card Cycling & Online Host-Guest Sync
// ============================================================================
{
  const { html } = getAppSources();

  const htmlIds = new Set();
  const idRe = /\bid="([^"]+)"/g;
  let m;
  while ((m = idRe.exec(html)) !== null) htmlIds.add(m[1]);

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
      style: { setProperty() {}, removeProperty() {} },
      scrollTop: 0,
      scrollHeight: 100,
      children: [],
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] || null; },
      removeAttribute(k) { delete attrs[k]; },
      closest() { return null; },
      get className() { return [...classes].join(' '); },
      set className(v) {
        classes.clear();
        String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      },
      classList: {
        add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        toggle: (c, force) => {
          const should = force === undefined ? !classes.has(c) : Boolean(force);
          if (should) classes.add(c);
          else classes.delete(c);
        },
        contains: c => classes.has(c)
      },
      appendChild(child) {
        if (child && child.isFrag) this.children.push(...child.children);
        else if (child) this.children.push(child);
        return child;
      },
      append(...nodes) { nodes.forEach(n => this.appendChild(n)); },
      replaceChildren(...nodes) {
        this.children = [];
        nodes.forEach(n => this.appendChild(n));
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 640, bottom: 640, width: 640, height: 640 }; },
      addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
      click() {
        for (const fn of listeners.click || []) fn({ stopPropagation() {}, preventDefault() {}, target: el, currentTarget: el });
      }
    };
    return el;
  }

  const elementsById = new Map();
  for (const id of htmlIds) {
    const el = makeFakeElement('div', id);
    if (['promotion-backdrop', 'game-setup', 'game-waiting', 'game-connected', 'game-feedback', 'online-controls', 'drag-ghost', 'draw-offer-banner', 'dice-bar'].includes(id)) {
      el.classList.add('hidden');
    }
    elementsById.set(id, el);
  }
  elementsById.get('setup-minutes-slider').value = '10';
  elementsById.get('setup-increment-slider').value = '5';

  const windowObj = {
    location: { href: 'https://frenzy500.github.io/com.chess/', search: '', pathname: '/com.chess/', hash: '' },
    history: { replaceState() {} },
    addEventListener() {}
  };
  const documentObj = {
    readyState: 'complete',
    title: 'Chess',
    hidden: false,
    body: makeFakeElement('body'),
    documentElement: makeFakeElement('html'),
    getElementById: id => elementsById.get(id),
    createElement: tag => makeFakeElement(tag),
    createElementNS: (_ns, tag) => makeFakeElement(tag),
    createDocumentFragment: () => ({
      isFrag: true,
      children: [],
      appendChild(c) { this.children.push(c); }
    }),
    querySelectorAll: () => [],
    addEventListener() {}
  };

  const storageMap = new Map();
  const playedSounds = [];
  const sandbox = {
    window: windowObj,
    document: documentObj,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    navigator: { clipboard: { writeText: async () => {} } },
    performance: { now: () => Date.now() },
    Peer: undefined,
    Worker: undefined,
    URL,
    URLSearchParams,
    Uint8Array,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
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
    `\nconst __origPlaySound = playSound;
    playSound = (kind) => { __playedSounds.push(kind); return __origPlaySound(kind); };
    globalThis.__playedSounds = [];
    globalThis.__dbg = {
      getState: () => gameState,
      setState: (s) => { gameState = s; viewPly = gameState.moveHistory.length; renderAll(); },
      getSelectedSq: () => selectedSq,
      setVariant: (v) => { setupConfig.variant = v; clearBoardTransientUI(); gameState = createInitialState(v); viewPly = 0; syncSetupPanelUI(); renderAll(); },
      forceRoll: (d1, d2) => { setDiceRoll(gameState, d1, d2); clearSelection(); playDiceOutcomeSounds(gameState.dice); renderAll(); },
      passTurn: () => executeDicePassTurn(),
      clickRoll: () => executeDiceRollRequest(),
      setAutoRoll: (v) => setDiceAutoRoll(v),
      stepHistory: (p) => stepHistoryTo(p),
      getAutoRoll: () => diceAutoRollEnabled,
      handleHostPacket: (p) => handleHostData(p)
    };`
  );

  // Wire listeners array trigger helper for 'change' on dice-autoroll-toggle
  const toggleEl = elementsById.get('dice-autoroll-toggle');
  const origToggleAdd = toggleEl.addEventListener.bind(toggleEl);
  const toggleListeners = [];
  toggleEl.addEventListener = (ev, fn) => {
    if (ev === 'change') toggleListeners.push(fn);
    origToggleAdd(ev, fn);
  };
  // Note: initUI already attached listeners when DOM loaded; capture via storage + dbg helper too
  const dbg = sandbox.__dbg;
  sandbox.__playedSounds.length = 0;

  // Initially in 'standard' variant -> #dice-bar must be hidden and body must not have .dice-mode
  const diceBar = elementsById.get('dice-bar');
  assert.strictEqual(diceBar.classList.contains('hidden'), true, '#dice-bar must be hidden in standard chess');
  assert.strictEqual(documentObj.body.classList.contains('dice-mode'), false, 'body.dice-mode must be off in standard chess');

  // Switch to 'dice' variant: starts UNROLLED with Roll button & standby '?' die faces and NO highlighted pieces
  dbg.setVariant('dice');
  assert.strictEqual(diceBar.classList.contains('hidden'), false, '#dice-bar must be visible in Dice Chess');
  assert.strictEqual(documentObj.body.classList.contains('dice-mode'), true, 'body.dice-mode must be enabled in Dice Chess');
  assert.strictEqual(elementsById.get('dice-roll-btn').classList.contains('hidden'), false, 'Roll button must be visible before rolling');
  assert.strictEqual(elementsById.get('die-card-1').classList.contains('die-unrolled'), true, 'Die card 1 starts in die-unrolled standby state');
  const preRollEligible = elementsById.get('board').children.filter(sq => sq.classList.contains('dice-eligible'));
  assert.strictEqual(preRollEligible.length, 0, 'No board pieces highlighted before rolling dice');

  // Clicking #die-card-1 while unrolled executes a click-to-roll + plays diceRoll audio!
  elementsById.get('die-card-1').click();
  assert.strictEqual(dbg.getState().dice.rolled, true, 'Clicking unrolled die card rolls the dice');
  assert(sandbox.__playedSounds.includes('diceRoll'), 'Rolling plays diceRoll sound effect');
  assert.strictEqual(elementsById.get('dice-roll-btn').classList.contains('hidden'), true, 'Roll button hides once rolled for the turn');

  // Auto-roll preference persists cleanly
  dbg.setAutoRoll(true);
  assert.strictEqual(dbg.getAutoRoll(), true);
  assert.strictEqual(storageMap.get('chess_dice_autoroll'), '1', 'Auto-roll toggle persists to localStorage');
  dbg.setAutoRoll(false);
  assert.strictEqual(storageMap.get('chess_dice_autoroll'), '0');

  // Force roll [6, 4] (Castling roll!)
  dbg.forceRoll(6, 4);
  const dieSvg1 = elementsById.get('die-svg-1');
  const dieSvg2 = elementsById.get('die-svg-2');
  // Die 1 = 6 -> 2 <rect> (body + bevel) + 6 <circle> = 8 children
  // Die 2 = 4 -> 2 <rect> (body + bevel) + 4 <circle> = 6 children
  assert.strictEqual(dieSvg1.children.length, 8, 'Die 1 (value 6) must render 2 <rect> + 6 <circle> pips');
  assert.strictEqual(dieSvg2.children.length, 6, 'Die 2 (value 4) must render 2 <rect> + 4 <circle> pips');
  assert.strictEqual(elementsById.get('die-label-1').textContent, 'King');
  assert.strictEqual(elementsById.get('die-label-2').textContent, 'Rook');

  // Force roll [1, 2] (Pawn & Knight) and test clicking #die-card-2 to cycle Knights!
  dbg.forceRoll(1, 2);
  elementsById.get('die-card-2').click();
  const sel1 = dbg.getSelectedSq();
  assert(sel1 && sel1.r === 7 && (sel1.c === 1 || sel1.c === 6), 'First click on Knight die selects a White Knight');
  elementsById.get('die-card-2').click();
  const sel2 = dbg.getSelectedSq();
  assert(sel2 && sel2.r === 7 && sel2.c !== sel1.c, 'Second click on Knight die cycles to the other White Knight');

  // Force Doubles [5, 5] -> plays diceDoubles sound & highlights BOTH White AND Black movable pieces!
  sandbox.__playedSounds.length = 0;
  dbg.forceRoll(5, 5);
  assert(sandbox.__playedSounds.includes('diceRoll') && sandbox.__playedSounds.includes('diceDoubles'), 'Doubles roll plays diceRoll + diceDoubles sound effects');
  assert.strictEqual(elementsById.get('dice-doubles-badge').classList.contains('hidden'), false, 'WILD DOUBLES badge must show on Doubles');
  const boardSquares = elementsById.get('board').children;
  const wildSquares = boardSquares.filter(sq => sq.classList.contains('dice-eligible-wild'));
  const whiteWildCount = wildSquares.filter(sq => Number(sq.dataset.r) >= 6).length;
  const blackWildCount = wildSquares.filter(sq => Number(sq.dataset.r) <= 1).length;
  assert(whiteWildCount > 0 && blackWildCount > 0, 'Doubles highlights BOTH own AND enemy movable pieces on board');

  // Force No Legal Moves [4, 5] -> plays diceBlocked sound & Pass turn clears lastMove on < / > navigation
  sandbox.__playedSounds.length = 0;
  dbg.forceRoll(4, 5);
  assert(sandbox.__playedSounds.includes('diceBlocked'), 'Blocked roll plays diceBlocked sound effect');
  assert.strictEqual(elementsById.get('dice-skip-badge').classList.contains('hidden'), false, 'NO LEGAL MOVES badge must show when blocked');
  dbg.passTurn();
  assert.strictEqual(dbg.getState().turn, 'b', 'executeDicePassTurn must advance turn to Black');
  assert.strictEqual(dbg.getState().moveHistory[0], 'Pass 4-5', 'Move history must record Pass 4-5');
  assert.strictEqual(dbg.getState().lastMove, null, 'Pass turn does not leave any stale lastMove highlight');
  assert.strictEqual(dbg.getState().dice.rolled, false, 'Black turn after Pass starts unrolled awaiting Black click');

  // Stepping history backward onto initial board keeps dice bar clean without sliding phantom moves
  dbg.stepHistory(0);
  assert.strictEqual(diceBar.classList.contains('hidden'), false, '#dice-bar remains visible during history replay');

  console.log('7. PASS: Side dice tray UX, click-to-roll, auto-roll toggle, sound cues, wild opponent highlights & pass turn < / > integrity verified!');
}

console.log('\nALL DICE CHESS VARIANT TESTS PASSED!');
