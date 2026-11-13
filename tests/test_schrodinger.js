'use strict';

const assert = require('assert');
const { getAppSources, runAppInContext, loadAppExports } = require('./load-app');

const engine = loadAppExports();

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function makePos(pieces, turn = 'w', castling = { wK: false, wQ: false, bK: false, bQ: false }, extra = {}) {
  const b = emptyBoard();
  for (const [r, c, code] of pieces) {
    b[r][c] = code;
  }
  const s = engine.createCustomState({
    variant: 'schrodinger',
    board: b,
    turn,
    castling,
    enPassant: extra.enPassant || null
  });
  if (extra.captured) {
    s.captured = { w: [...(extra.captured.w || [])], b: [...(extra.captured.b || [])] };
  }
  if (extra.schrodinger) {
    s.schrodinger = JSON.parse(JSON.stringify(extra.schrodinger));
  }
  engine.resolveSchrodingerState(s);
  return s;
}

console.log("Running Exhaustive Schrödinger's Chess Verification Suite...\n");

// ---------------------------------------------------------------------------
// 1. Variant Definition, Initial Setup, SVGs & Promo Auto-Selection
// ---------------------------------------------------------------------------
{
  const v = engine.VARIANT_DEFS.schrodinger;
  assert(v, 'VARIANT_DEFS.schrodinger must exist');
  assert.strictEqual(v.schrodinger, true);
  assert.strictEqual(v.royalCaptureWins, true);

  const s = engine.createInitialState('schrodinger');
  assert.strictEqual(s.variant, 'schrodinger');
  assert.strictEqual(s.status, 'playing');
  assert.strictEqual(s.board[7][4], 'wk');
  assert.strictEqual(s.board[0][4], 'bk');
  for (let c = 0; c < 8; c++) {
    assert.strictEqual(s.board[6][c], 'wp', `White pawn on (6,${c})`);
    assert.strictEqual(s.board[1][c], 'bp', `Black pawn on (1,${c})`);
    if (c !== 4) {
      assert.strictEqual(s.board[7][c], 'wqm', `White ? on (7,${c})`);
      assert.strictEqual(s.board[0][c], 'bqm', `Black ? on (0,${c})`);
    }
  }
  assert.deepStrictEqual(s.castling, { wK: true, wQ: true, bK: true, bQ: true });
  assert.deepStrictEqual(s.schrodinger, {
    w: { promoL: 0, promoD: 0, capL: 0, capD: 0 },
    b: { promoL: 0, promoD: 0, capL: 0, capD: 0 }
  });
  console.log('1. PASS: Variant definition, initial ? setup, castling rights & Schrodinger meta verified!');
}

// ---------------------------------------------------------------------------
// 2. Quantum State Transitions (? -> N / R/Q / B/Q(L) / B/Q(D) -> Q)
// ---------------------------------------------------------------------------
{
  // Clear position: White King h1, Black King h8, White ? on d4 (4,3: (4+3)%2=1 -> D!) and White ? on e4 (4,4: (4+4)%2=0 -> L!)
  const base = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [6, 0, 'wp'],
    [1, 0, 'bp'],
    [4, 3, 'wqm'], // d4 (Dark)
    [4, 4, 'wqm'] // e4 (Light)
  ]);

  // A) L-shape from d4 -> f5 (3,5) permanently becomes Knight ('wn')
  const afterKnight = engine.tryMakeMove(base, { r: 4, c: 3 }, { r: 3, c: 5 });
  assert(afterKnight, 'L-shape move of ? must be legal');
  assert.strictEqual(afterKnight.board[3][5], 'wn', 'L-shape turns ? into permanent Knight');

  // B) Straight move from e4 (4,4) -> e6 (2,4) turns ? into R/Q ('wrq'), and stays R/Q on another straight move
  const afterStraight1 = engine.tryMakeMove(base, { r: 4, c: 4 }, { r: 2, c: 4 });
  assert(afterStraight1, 'Straight move of ? must be legal');
  assert.strictEqual(afterStraight1.board[2][4], 'wrq', 'Straight move turns ? into wrq');

  afterStraight1.turn = 'w';
  const afterStraight2 = engine.tryMakeMove(afterStraight1, { r: 2, c: 4 }, { r: 2, c: 1 });
  assert.strictEqual(afterStraight2.board[2][1], 'wrq', 'Further straight move keeps R/Q in wrq');

  // C) R/Q moving diagonally -> permanently becomes Queen ('wq')
  afterStraight2.turn = 'w';
  const rqToQueen = engine.tryMakeMove(afterStraight2, { r: 2, c: 1 }, { r: 3, c: 2 });
  assert(rqToQueen, 'R/Q diagonal move must be legal when Q slot open');
  assert.strictEqual(rqToQueen.board[3][2], 'wq', 'R/Q moving diagonally becomes permanent Queen');

  // D) Diagonal move of ? on Light e4 (4,4) -> c6 (2,2) turns into Light B/Q ('wbl'); on Dark d4 (4,3) -> b6 (2,1) turns into Dark B/Q ('wbd')
  const afterDiagL = engine.tryMakeMove(base, { r: 4, c: 4 }, { r: 2, c: 2 });
  assert.strictEqual(afterDiagL.board[2][2], 'wbl', 'Light-square diagonal move becomes wbl');
  afterDiagL.turn = 'w';
  const afterDiagL2 = engine.tryMakeMove(afterDiagL, { r: 2, c: 2 }, { r: 5, c: 5 });
  assert.strictEqual(afterDiagL2.board[5][5], 'wbl', 'Further diagonal move keeps wbl');
  afterDiagL2.turn = 'w';
  const blToQueen = engine.tryMakeMove(afterDiagL2, { r: 5, c: 5 }, { r: 5, c: 2 });
  assert.strictEqual(blToQueen.board[5][2], 'wq', 'B/Q moving straight becomes permanent Queen');

  const afterDiagD = engine.tryMakeMove(base, { r: 4, c: 3 }, { r: 2, c: 1 });
  assert.strictEqual(afterDiagD.board[2][1], 'wbd', 'Dark-square diagonal move becomes wbd');

  console.log('2. PASS: All ? -> N / R/Q / B/Q(L) / B/Q(D) -> Q transitions verified!');
}

// ---------------------------------------------------------------------------
// 3. Pool Limits, Queen Claim Collapse, 3x R/Q & 2x Same-Color B/Q Deduction
// ---------------------------------------------------------------------------
{
  // 3A) Claiming Queen immediately collapses all other R/Q -> R and B/Q -> B on board AND in graveyard
  const s = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [5, 0, 'wrq'], // will move diagonally to become Q
    [5, 2, 'wrq'], // should collapse to 'wr'
    [4, 4, 'wbl'] // (4+4)%2=0 Light; should collapse to 'wb'
  ], 'w', undefined, {
    captured: { w: [], b: ['bd'] } // Dark B/Q in graveyard; only 4 ambiguous items total so Q is still open
  });

  // Check initial unresolved state
  assert.strictEqual(s.board[5][2], 'wrq');
  assert.strictEqual(s.board[4][4], 'wbl');
  assert.strictEqual(s.captured.b[0], 'bd');

  // White moves wrq (5,0) -> (3,2) diagonally => becomes Queen!
  const afterQ = engine.tryMakeMove(s, { r: 5, c: 0 }, { r: 3, c: 2 });
  assert(afterQ);
  assert.strictEqual(afterQ.board[3][2], 'wq');
  assert.strictEqual(afterQ.board[5][2], 'wr', 'Other board R/Q immediately collapses to Rook');
  assert.strictEqual(afterQ.board[4][4], 'wb', 'Other board B/Q(L) immediately collapses to Bishop');
  assert.strictEqual(afterQ.captured.b[0], 'b', 'Graveyard B/Q(D) collapses to Bishop when Q claimed');
  assert.strictEqual(afterQ.schrodinger.w.capD, 1, 'Graveyard B/Q(D) collapse records capD=1');

  // 3B) 3x R/Q claims Queen + both Rooks -> any B/Q collapses to Bishop, no extra R/Q possible, Q exhausted
  const s3rq = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [7, 0, 'wrq'],
    [7, 2, 'wrq'],
    [7, 3, 'wrq'],
    [6, 4, 'wbl'], // (6+4)%2=0 -> Light
    [6, 5, 'wqm'] // Dark square -> still has bD or N open!
  ]);
  // Resolve ran inside makePos: 3 wrq claims 1Q+2R! Therefore wbl collapses immediately to wb, and wqm on Dark f2 (6,5) can move diag (bD) or L-shape (N), NOT straight!
  assert.strictEqual(s3rq.board[6][4], 'wb', '3x R/Q forces B/Q on board to collapse to Bishop');
  const qm3Moves = engine.getLegalMovesForSquare(s3rq, 6, 5);
  assert(qm3Moves.some((m) => Math.abs(m.to.r - 6) === 2 && Math.abs(m.to.c - 5) === 1), 'Remaining ? can still jump as Knight');
  assert(qm3Moves.some((m) => Math.abs(m.to.r - 6) === Math.abs(m.to.c - 5) && m.to.r !== 6), 'Remaining ? on Dark can still move diagonally as bD');
  assert(!qm3Moves.some((m) => m.to.r === 6 || m.to.c === 5), 'Remaining ? CANNOT move straight because 2R + 1Q slots all used!');
  // Also none of the 3 wrq can move diagonally (because moving diagonally makes it Q, leaving only 2R for the other 2, WAIT — CAN one of 3 wrq move diagonally to become the Queen?! YES! That turns it into wq and the other 2 wrq into wr!)
  const rq0Moves = engine.getLegalMovesForSquare(s3rq, 7, 0);
  assert(rq0Moves.some((m) => m.to.r === 5 && m.to.c === 2), 'One of 3 R/Qs CAN still move diagonally to become the Queen');

  // 3C) 2x B/Q on same square color (2x Light wbl) claims Q + bL -> any R/Q collapses to R, and another Light ? cannot move diagonally!
  const s2bl = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [4, 4, 'wbl'],
    [2, 2, 'wbl'],
    [5, 1, 'wrq'],
    [6, 0, 'wqm'] // (6,0): (6+0)%2=0 -> Light square!
  ]);
  assert.strictEqual(s2bl.board[5][1], 'wr', '2x same-color B/Q claims Q and forces R/Q -> Rook');
  const qmLightMoves = engine.getLegalMovesForSquare(s2bl, 6, 0);
  assert(
    !qmLightMoves.some((m) => Math.abs(m.to.r - 6) === Math.abs(m.to.c - 0)),
    'Light-square ? CANNOT move diagonally when both bL and Q slots are claimed by 2x wbl'
  );
  assert(
    qmLightMoves.some((m) => m.to.r === 4 && m.to.c === 0),
    'Light-square ? CAN still move straight (Rook slot open)'
  );

  // 3D) Single remaining role auto-collapse: 1Q, 2R, 1bL, 1bD, 1N already used -> last ? MUST auto-collapse to Knight!
  const sOnlyN = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [7, 0, 'wq'],
    [7, 1, 'wr'],
    [7, 2, 'wr'],
    [6, 0, 'wb'], // Light (6+0=6)
    [6, 1, 'wb'], // Dark (6+1=7)
    [5, 0, 'wn'],
    [4, 4, 'wqm'] // Only remaining slot is 2nd Knight!
  ]);
  assert.strictEqual(sOnlyN.board[4][4], 'wn', 'When all pool slots except one type are used, remaining ? auto-collapses to that type');

  console.log('3. PASS: Cascading Q collapses, 3x R/Q & 2x same-color B/Q deductions, exhausted moves & single-role auto-collapse verified!');
}

// ---------------------------------------------------------------------------
// 4. Captures: Unmoved ?, Concrete B(L/D), and Graveyard R/Q Collapse
// ---------------------------------------------------------------------------
{
  // 4A) Capturing an unmoved ? leaves 'qm' in graveyard & leaves full specific role flexibility for remaining pieces
  const sCapQm = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [4, 4, 'wr'], // White rook captures Black ? on e5
    [3, 4, 'bqm']
  ]);
  const afterCap = engine.tryMakeMove(sCapQm, { r: 4, c: 4 }, { r: 3, c: 4 });
  assert(afterCap);
  assert.deepStrictEqual(afterCap.captured.w, ['qm'], 'Capturing unmoved ? puts qm into White captures tray');
  const analysisB = engine.computeSchrodingerSideAnalysis(afterCap, 'b');
  assert.strictEqual(analysisB.feasible, true);
  assert.strictEqual(analysisB.counts.captured.qm, 1);

  // 4B) Capturing concrete Dark Bishop permanently uses bD slot via capD
  const sCapB = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [4, 4, 'wr'],
    [3, 4, 'bb'], // (3+4)%2 = 1 -> Dark Bishop!
    [4, 3, 'bqm'] // (4+3)%2 = 1 -> Dark ? (cannot become bD once bD is captured + say Q used)
  ]);
  const afterCapB = engine.tryMakeMove(sCapB, { r: 4, c: 4 }, { r: 3, c: 4 });
  assert.strictEqual(afterCapB.schrodinger.b.capD, 1, 'Capturing Dark Bishop increments black capD');
  assert.strictEqual(afterCapB.schrodinger.b.capL, 0);

  // 4C) Graveyard 'wrq' stays 'wrq' until White's other 'wbl' moves straight into Queen -> graveyard 'wrq' collapses to 'wr'
  const sGrave = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [4, 4, 'wbl'] // Light B/Q
  ], 'w', undefined, {
    captured: { w: [], b: ['rq'] }
  });
  assert.strictEqual(sGrave.captured.b[0], 'rq', 'Graveyard rq stays ambiguous before Q is claimed');
  const afterGraveQ = engine.tryMakeMove(sGrave, { r: 4, c: 4 }, { r: 4, c: 6 }); // straight -> Queen!
  assert.strictEqual(afterGraveQ.board[4][6], 'wq');
  assert.strictEqual(afterGraveQ.captured.b[0], 'r', 'Graveyard rq collapses to r once Queen is taken');

  console.log('4. PASS: Unmoved ? captures, color-locked bishop captures (capL/capD) & graveyard collapse verified!');
}

// ---------------------------------------------------------------------------
// 5. Castling with Corner ? (Allowed when R slot open, blocked when R slots full)
// ---------------------------------------------------------------------------
{
  const sCastle = makePos([
    [7, 4, 'wk'],
    [7, 7, 'wqm'], // h1 corner ?
    [7, 0, 'wqm'], // a1 corner ?
    [0, 4, 'bk']
  ], 'w', { wK: true, wQ: true, bK: false, bQ: false });

  const kingMoves = engine.getLegalMovesForSquare(sCastle, 7, 4);
  const kSide = kingMoves.find((m) => m.castleSide === 'K');
  const qSide = kingMoves.find((m) => m.castleSide === 'Q');
  assert(kSide, 'Kingside castling with corner h1 ? must be legal');
  assert(qSide, 'Queenside castling with corner a1 ? must be legal');

  const afterCastle = engine.tryMakeMove(sCastle, { r: 7, c: 4 }, { r: 7, c: 6 });
  assert(afterCastle);
  assert.strictEqual(afterCastle.board[7][6], 'wk');
  assert.strictEqual(afterCastle.board[7][5], 'wr', 'Castling permanently converts corner ? into Rook on f1');
  assert.strictEqual(afterCastle.castling.wK, false);
  assert.strictEqual(afterCastle.castling.wQ, false);

  // If both Rook slots already used (2 wr on board), corner h1 ? CANNOT castle!
  const sNoRookSlot = makePos([
    [7, 4, 'wk'],
    [7, 7, 'wqm'],
    [5, 0, 'wr'],
    [5, 1, 'wr'],
    [0, 4, 'bk']
  ], 'w', { wK: true, wQ: false, bK: false, bQ: false });
  assert.strictEqual(
    engine.canCornerCastleInSchrodinger(sNoRookSlot, 'w', 7, 7),
    false,
    'Corner ? cannot castle when both Rook slots are already used'
  );
  const noCastleMoves = engine.getLegalMovesForSquare(sNoRookSlot, 7, 4);
  assert(!noCastleMoves.some((m) => m.castleSide), 'King cannot castle with corner ? when no Rook slot exists');

  console.log('5. PASS: Castling with corner ? -> Rook & Rook-slot-full blocking verified!');
}

// ---------------------------------------------------------------------------
// 6. Pawn Promotion to ? (+1 color-locked slot shared across entire side pool)
// ---------------------------------------------------------------------------
{
  const sPromo = makePos([
    [7, 7, 'wk'],
    [0, 7, 'bk'],
    [4, 4, 'wrq'],
    [4, 5, 'wrq'],
    [1, 0, 'wp'] // a7 -> promotes on a8 (0,0 -> Light!)
  ]);

  const promoMoves = engine.getLegalMovesForSquare(sPromo, 1, 0);
  const pMove = promoMoves.find((m) => m.to.r === 0 && m.to.c === 0);
  assert(pMove, 'Pawn promotion move a7->a8 must be legal');
  const afterPromo = engine.tryMakeMove(sPromo, { r: 1, c: 0 }, { r: 0, c: 0 });
  assert(afterPromo);
  assert.strictEqual(afterPromo.board[0][0], 'wqm', 'Promoted pawn enters board as ? (wqm)');
  assert.strictEqual(afterPromo.schrodinger.w.promoL, 1, 'Promoting on a8 increments promoL');
  assert.strictEqual(afterPromo.schrodinger.w.promoD, 0);

  // Because promoL=1 unlocks +1 {q, r, bL, n} shared slot, BOTH pre-existing wrq pieces can become Queens while promoted a8 stays ?
  afterPromo.turn = 'w';
  const firstQ = engine.tryMakeMove(afterPromo, { r: 4, c: 4 }, { r: 2, c: 2 });
  assert(firstQ);
  assert.strictEqual(firstQ.board[2][2], 'wq');
  assert.strictEqual(firstQ.board[4][5], 'wrq', 'Second wrq retains Queen potential thanks to +promoL slot!');

  firstQ.turn = 'w';
  const secondQ = engine.tryMakeMove(firstQ, { r: 4, c: 5 }, { r: 2, c: 3 });
  assert(secondQ, 'Existing wrq on board can claim +1 Queen slot unlocked by promotion!');
  assert.strictEqual(secondQ.board[2][3], 'wq', 'White now has a second Queen from shared +Promo slot');
  assert.strictEqual(secondQ.board[0][0], 'wqm', 'Promoted pawn on a8 stays ? (using R/bL/N from open pool)');

  console.log('6. PASS: Pawn promotion to ? (+1 color-locked shared slot) verified!');
}

// ---------------------------------------------------------------------------
// 7. No Check / Moving Into Danger / King Capture Win & Zero-Legal-Moves Win
// ---------------------------------------------------------------------------
{
  // 7A) Moving King into danger IS legal & capturing King wins ('king_captured')
  const sNoCheck = makePos([
    [7, 4, 'wk'],
    [0, 4, 'bk'],
    [6, 0, 'br'] // covers row 6!
  ], 'w');
  const intoDanger = engine.tryMakeMove(sNoCheck, { r: 7, c: 4 }, { r: 6, c: 4 });
  assert(intoDanger, 'Moving King into attack on row 6 must be legal in Schrodinger Chess');
  assert.strictEqual(intoDanger.inCheck, false, 'No check state in Schrodinger Chess');

  // Black Rook on a2 captures White King on e2 -> White/Black win
  const kingCap = engine.tryMakeMove(intoDanger, { r: 6, c: 0 }, { r: 6, c: 4 });
  assert.strictEqual(kingCap.status, 'king_captured');
  assert.strictEqual(kingCap.winner, 'b');

  // 7B) Zero-legal-moves win ('no_moves'):
  // White wk (7,0)->(7,1) leaves Black with: bk(0,7), bb(0,6), br(1,6), bp(1,7), bp(2,6), bp(1,5) blocked by wp(2,7), wp(3,6), wp(2,5)!
  const sNoMovesSetup = makePos([
    [7, 0, 'wk'],
    [0, 7, 'bk'],
    [0, 6, 'bb'], // (0+6)%2=0 -> Light Bishop
    [1, 6, 'br'],
    [1, 7, 'bp'],
    [2, 6, 'bp'],
    [1, 5, 'bp'],
    [2, 7, 'wp'],
    [3, 6, 'wp'],
    [2, 5, 'wp']
  ], 'w');
  const afterZeroMoves = engine.tryMakeMove(sNoMovesSetup, { r: 7, c: 0 }, { r: 7, c: 1 });
  assert(afterZeroMoves, 'White king move a1->b1 must succeed');
  assert.strictEqual(engine.getAllLegalMoves(afterZeroMoves, 'b').length, 0, 'Black has 0 legal moves');
  assert.strictEqual(afterZeroMoves.status, 'no_moves', 'Leaving opponent with 0 legal moves sets status no_moves');
  assert.strictEqual(afterZeroMoves.winner, 'w', 'Player leaving opponent with 0 legal moves wins!');

  console.log('7. PASS: No check, legal self-check, king capture win & 0-legal-moves win verified!');
}

// ---------------------------------------------------------------------------
// 8. Network Serialization / Hydration & Auto-Promo Premoves (No Modal)
// ---------------------------------------------------------------------------
{
  const s = makePos([
    [7, 4, 'wk'],
    [0, 4, 'bk'],
    [1, 0, 'wp'],
    [6, 1, 'wqm']
  ], 'w');
  const afterPromo = engine.tryMakeMove(s, { r: 1, c: 0 }, { r: 0, c: 0 }); // promoL becomes 1 in frame 1!
  afterPromo.turn = 'w';
  const afterMove = engine.tryMakeMove(afterPromo, { r: 6, c: 1 }, { r: 4, c: 1 }); // straight -> wrq in frame 2
  const wire = engine.serializeAuthoritativeState(afterMove);
  const hydrated = engine.validateAndHydrateState(wire);
  assert(hydrated, 'validateAndHydrateState accepts Schrodinger wire state');
  assert.deepStrictEqual(hydrated.schrodinger, afterMove.schrodinger, 'Round-trips schrodinger metadata');
  assert.strictEqual(hydrated.board[4][1], 'wrq', 'Preserves wrq on board');
  assert.strictEqual(hydrated.historyFrames[0].schrodinger.w.promoL, 0, 'Frame 0 preserves pre-promo promoL=0');
  assert.strictEqual(hydrated.historyFrames[1].schrodinger.w.promoL, 1, 'Frame 1 preserves post-promo promoL=1');
  assert.strictEqual(hydrated.historyFrames[2].board[4][1], 'wrq', 'Frame 2 preserves board wrq state');

  // Premove pawn to promotion rank in Schrodinger detects promotion & applies single-option 'qm' cleanly without modal
  const sPremove = engine.createInitialState('schrodinger');
  sPremove.board[1][0] = 'wp';
  sPremove.board[0][0] = null;
  assert.strictEqual(
    engine.doesPremoveRequirePromotion(sPremove, { r: 1, c: 0 }, { r: 0, c: 0 }, 'w'),
    true,
    'doesPremoveRequirePromotion detects promotion rank for Schrodinger pawn'
  );
  const premoveStep = engine.applyPremoveStepToState(
    sPremove,
    { from: { r: 1, c: 0 }, to: { r: 0, c: 0 }, promotion: 'qm' },
    'w'
  );
  assert(premoveStep, 'applyPremoveStepToState succeeds for Schrodinger promo premove');
  assert.strictEqual(premoveStep.board[0][0], 'wqm');
  assert.strictEqual(premoveStep.schrodinger.w.promoL, 1);

  console.log('8. PASS: Network codec round-trip & auto-promotion premove verified!');
}

// ---------------------------------------------------------------------------
// 9. End-to-End Dual-Peer Online Sync + Live Quantum Pool HUD & Square Hints
// ---------------------------------------------------------------------------
async function runOnlineAndUiTests() {
  const { html } = getAppSources();
  const htmlIds = new Set();
  const idRe = /\bid="([^"]+)"/g;
  let m;
  while ((m = idRe.exec(html)) !== null) htmlIds.add(m[1]);

  const broker = new Map();
  const timers = new Set();
  const trackedTimeout = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  class MockConn {
    constructor(targetId) {
      this.targetId = targetId;
      this.open = false;
      this.peerConn = null;
      this.handlers = {};
    }
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
    emit(ev, arg) { for (const fn of this.handlers[ev] || []) fn(arg); }
    send(data) {
      const cloned = JSON.parse(JSON.stringify(data));
      trackedTimeout(() => {
        if (this.peerConn && this.open) this.peerConn.emit('data', cloned);
      }, 4);
    }
    close() {
      this.open = false;
      if (this.peerConn && this.peerConn.open) {
        this.peerConn.open = false;
        trackedTimeout(() => this.peerConn.emit('close'), 2);
      }
    }
    removeAllListeners() { this.handlers = {}; }
  }

  class MockPeer {
    constructor(idOrOpts) {
      this.id = typeof idOrOpts === 'string' ? idOrOpts : 'guest-' + Math.random().toString(36).slice(2, 8);
      this.handlers = {};
      broker.set(this.id, this);
      trackedTimeout(() => this.emit('open', this.id), 2);
    }
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
    emit(ev, arg) { for (const fn of this.handlers[ev] || []) fn(arg); }
    connect(targetId) {
      const target = broker.get(targetId);
      const out = new MockConn(targetId);
      const inc = new MockConn(this.id);
      out.peerConn = inc;
      inc.peerConn = out;
      trackedTimeout(() => {
        if (!target) return this.emit('error', { type: 'peer-unavailable' });
        out.open = true;
        inc.open = true;
        target.emit('connection', inc);
        trackedTimeout(() => out.emit('open'), 2);
      }, 4);
      return out;
    }
    removeAllListeners() { this.handlers = {}; }
    destroy() { broker.delete(this.id); }
  }

  function makeFakeEl(tagName = 'div', id = null) {
    const classes = new Set();
    const listeners = new Map();
    const attrs = {};
    const el = {
      tagName: String(tagName).toUpperCase(),
      id,
      dataset: {},
      style: {},
      children: [],
      childNodes: [],
      parentElement: null,
      textContent: '',
      value: '',
      src: '',
      disabled: false,
      checked: false,
      get className() { return Array.from(classes).join(' '); },
      set className(v) {
        classes.clear();
        String(v || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      },
      classList: {
        add: (...cs) => cs.forEach((c) => classes.add(c)),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
        toggle: (c, f) => {
          if (f === undefined) {
            if (classes.has(c)) { classes.delete(c); return false; }
            classes.add(c); return true;
          }
          if (f) classes.add(c); else classes.delete(c);
          return Boolean(f);
        },
        contains: (c) => classes.has(c)
      },
      setAttribute(k, v) {
        attrs[k] = String(v);
        if (k === 'id') el.id = String(v);
        else if (k === 'class') el.className = String(v);
      },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      appendChild(c) {
        if (!c) return c;
        if (c.isFrag) {
          for (const fc of c.children) el.appendChild(fc);
          return c;
        }
        c.parentElement = el;
        el.children.push(c);
        el.childNodes = el.children;
        return c;
      },
      append(...ns) { ns.forEach((n) => el.appendChild(n)); },
      replaceChildren(...ns) {
        el.children = [];
        el.childNodes = el.children;
        ns.forEach((n) => el.appendChild(n));
      },
      contains: (target) => {
        if (target === el) return true;
        return el.children.some((ch) => (ch.contains ? ch.contains(target) : ch === target));
      },
      closest: (sel) => {
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
      querySelector(sel) {
        const sqMatch = sel.match(/\.square\[data-r="(\d+)"\]\[data-c="(\d+)"\]/);
        const walk = (node) => {
          for (const ch of node.children || []) {
            if (sqMatch && ch.classList?.contains('square') && ch.dataset?.r === sqMatch[1] && ch.dataset?.c === sqMatch[2]) return ch;
            const d = walk(ch);
            if (d) return d;
          }
          return null;
        };
        return walk(el);
      },
      querySelectorAll(sel) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          return el.children.filter((ch) => ch.classList?.contains(cls));
        }
        return [];
      },
      addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
      dispatch(ev, obj = {}) {
        const e = { target: obj.target || el, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}, ...obj };
        for (const fn of listeners[ev] || []) fn(e);
      },
      getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 }; },
      scrollIntoView() {}
    };
    return el;
  }

  function createPeerApp() {
    const els = new Map();
    for (const id of htmlIds) els.set(id, makeFakeEl('div', id));
    els.get('setup-minutes-slider').value = '10';
    els.get('setup-increment-slider').value = '0';

    for (const v of ['standard', 'cannibal', 'crazyhouse', 'fog', 'secret', 'dice', 'schrodinger']) {
      const vb = makeFakeEl('button');
      vb.className = 'variant-btn';
      vb.dataset.variant = v;
      els.get('setup-variant-grid').appendChild(vb);

      const lb = makeFakeEl('button');
      lb.className = 'local-variant-btn';
      lb.dataset.variant = v;
      els.get('local-variant-bar').appendChild(lb);
    }
    for (const s of ['w', 'random', 'b']) {
      const sb = makeFakeEl('button');
      sb.className = 'side-btn';
      sb.dataset.side = s;
      els.get('side-buttons').appendChild(sb);
    }
    const unlimChip = makeFakeEl('button');
    unlimChip.className = 'preset-chip';
    unlimChip.dataset.unlimited = '1';
    els.get('preset-row').appendChild(unlimChip);

    const winListeners = {};
    const intervalIds = [];
    const sandbox = {
      Peer: MockPeer,
      console,
      Math,
      Date,
      JSON,
      URL,
      URLSearchParams,
      setTimeout: trackedTimeout,
      clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
      setInterval: (fn, ms) => { const id = setInterval(fn, ms); intervalIds.push(id); return id; },
      clearInterval,
      localStorage: { getItem: () => null, setItem: () => {} },
      navigator: { clipboard: { writeText: async () => {} } },
      window: null,
      document: null
    };
    sandbox.document = {
      readyState: 'complete',
      title: 'Chess',
      body: makeFakeEl('body'),
      getElementById: (id) => els.get(id) || null,
      createElement: (tag) => makeFakeEl(tag),
      createElementNS: (_, tag) => makeFakeEl(tag),
      createDocumentFragment: () => ({ isFrag: true, children: [], appendChild(c) { this.children.push(c); } }),
      querySelectorAll: () => []
    };
    sandbox.window = {
      location: { href: 'https://example.com/', search: '', pathname: '/', hash: '' },
      history: { replaceState() {} },
      AudioContext: undefined,
      addEventListener: (ev, fn) => { (winListeners[ev] ||= []).push(fn); },
      dispatch: (ev, obj = {}) => {
        const e = { preventDefault() {}, ...obj };
        for (const fn of winListeners[ev] || []) fn(e);
      }
    };

    runAppInContext(
      sandbox,
      `globalThis.__test = {
        getState: () => gameState,
        getNet: () => net,
        getFlipped: () => boardFlipped,
        buildInviteUrl: (c, v) => buildInviteUrl(c, v),
        getPromotionTypes: (st) => getPromotionTypes(st),
        getPieceSvgDataUri: (code) => getPieceSvgDataUri(code)
      };`
    );

    const clickSq = (r, c) => {
      const flipped = sandbox.__test.getFlipped();
      const visRow = flipped ? 7 - r : r;
      const visCol = flipped ? 7 - c : c;
      const pt = { clientX: visCol * 100 + 50, clientY: visRow * 100 + 50 };
      els.get('board').dispatch('pointerdown', { button: 0, pointerId: 1, ...pt });
      sandbox.window.dispatch('pointerup', { button: 0, pointerId: 1, ...pt });
    };

    return {
      els,
      api: sandbox.__test,
      docBody: sandbox.document.body,
      clickSq,
      cleanup: () => intervalIds.forEach(clearInterval)
    };
  }

  const waitFor = async (pred, ms = 3000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (pred()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error('Timeout waiting for condition');
  };

  const host = createPeerApp();
  const guest = createPeerApp();

  // Host sets up Schrodinger game as White + Unlimited
  host.els.get('open-setup-btn').dispatch('click');
  const schBtn = host.els.get('setup-variant-grid').children.find((b) => b.dataset.variant === 'schrodinger');
  host.els.get('setup-variant-grid').dispatch('click', { target: schBtn });
  host.els.get('preset-row').children[0].dispatch('click', { target: host.els.get('preset-row').children[0] });
  host.els.get('create-game-btn').dispatch('click');

  await waitFor(() => host.api.getNet().mode === 'waiting' && host.api.getNet().roomCode.length === 5);
  assert(host.els.get('waiting-summary').textContent.includes("Schr"), 'Waiting summary shows Schrodinger');
  assert(
    host.api.buildInviteUrl(host.api.getNet().roomCode, 'schrodinger').includes('/invite/schrodinger.html?game='),
    'Invite link points to invite/schrodinger.html'
  );

  // Guest joins
  guest.els.get('join-code-input').value = host.api.getNet().roomCode;
  guest.els.get('join-game-form').dispatch('submit');
  await waitFor(() => host.api.getNet().mode === 'online' && guest.api.getNet().mode === 'online');

  assert.strictEqual(guest.api.getState().variant, 'schrodinger');
  assert.deepStrictEqual([...host.api.getPromotionTypes(host.api.getState())], ['qm'], 'Schrodinger promotes strictly to ? (qm)');
  for (const code of ['wqm', 'bqm', 'wrq', 'brq', 'wbl', 'bbl', 'wbd', 'bbd']) {
    const uri = host.api.getPieceSvgDataUri(code);
    assert(typeof uri === 'string' && uri.startsWith('data:image/svg+xml'), `SVG data URI exists for ${code}`);
  }
  assert.strictEqual(host.docBody.classList.contains('schrodinger-mode'), true, 'body gets schrodinger-mode class');
  assert.strictEqual(host.els.get('schrodinger-bar').classList.contains('hidden'), false, '#schrodinger-bar is visible');
  assert.strictEqual(host.els.get('schrodinger-sides').children.length, 2, 'Pool HUD renders both Top and Bottom side cards');

  // Host clicks knight-square b1 ? (7,1) -> checks hint text, then plays Nb1-c3 (7,1 -> 5,2) -> permanently becomes wn!
  host.clickSq(7, 1);
  assert(host.els.get('schrodinger-hint').textContent.includes('? on b1'), 'Clicking b1 ? updates live Schrodinger hint');
  assert(host.els.get('schrodinger-hint').textContent.includes('L-shape = N'), 'Hint shows L-shape = N option');
  host.clickSq(5, 2);

  await waitFor(() => guest.api.getState().moveHistory.length === 1);
  assert.strictEqual(guest.api.getState().board[5][2], 'wn', 'Guest receives Nb1-c3 collapse to Knight over P2P sync');

  host.cleanup();
  guest.cleanup();
  for (const t of timers) clearTimeout(t);
  console.log('9. PASS: End-to-end P2P Host/Guest sync, invite URL, Pool HUD & live square hint verified!');
}

runOnlineAndUiTests()
  .then(() => {
    console.log("\nALL 9 SCHRÖDINGER'S CHESS ENGINE, POOL, CASTLING, PROMO, WIN & P2P TESTS PASSED!");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
