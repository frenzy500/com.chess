'use strict';

const assert = require('assert');
const { loadAppExports, getAppSources, runAppInContext } = require('./load-app');

const engine = loadAppExports();
const { html, css, js } = getAppSources();

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function makeCustomState(variant, board, turn = 'w', extra = {}) {
  const s = engine.createInitialState(variant);
  s.board = board;
  s.turn = turn;
  s.castling = extra.castling || { wK: false, wQ: false, bK: false, bQ: false };
  s.enPassant = extra.enPassant || null;
  s.pockets = extra.pockets || { w: [], b: [] };
  s.promoted = extra.promoted || [];
  s.inCheck = engine.getVariantDef(s).royalCaptureWins ? false : engine.isInCheck(s, turn);
  s.positionCounts = {};
  s.historyFrames = [
    {
      board: board.map((r) => r.slice()),
      turn,
      inCheck: s.inCheck,
      lastMove: null,
      captured: { w: [], b: [] },
      pockets: { w: s.pockets.w.slice(), b: s.pockets.b.slice() },
      meta: null
    }
  ];
  return s;
}

/* ============================================================================
 * PART 1: PURE ENGINE TESTS — CANNIBAL CHESS
 * ============================================================================ */

console.log('Running Variant Engine, Multiplayer, Fog Security & Pocket Premove Suite...\n');

{
  // 1A. King captures own blocking pawn to escape check!
  // White King on h1 (7,7), White pawns on g2 (6,6) and h2 (6,7), White Rook on g1 (7,6).
  // Black Knight on f2 (6,5) checking h1! (Classic smothered mate in Standard chess!)
  const bStd = emptyBoard();
  bStd[0][4] = 'bk';
  bStd[7][7] = 'wk';
  bStd[7][6] = 'wr';
  bStd[6][6] = 'wp';
  bStd[6][7] = 'wp';
  bStd[6][5] = 'bn';

  const stdState = makeCustomState('standard', bStd.map((r) => r.slice()), 'w');
  assert.strictEqual(engine.getAllLegalMoves(stdState, 'w').length, 0, 'Standard smothered mate has 0 moves');

  const canState = makeCustomState('cannibal', bStd.map((r) => r.slice()), 'w');
  const canMoves = engine.getAllLegalMoves(canState, 'w');
  // In Cannibal Chess:
  // - King on h1 can capture wr on g1 (7,6), wp on g2 (6,6), or wp on h2 (6,7) (none of those 3 are attacked by bn on f2 or bk on e8!)
  // Wait: bn on f2 (6,5) attacks h1(7,7), h3(5,7), g4(4,6), e4(4,4), d3(5,3), d1(7,3) -> none of g1, g2, h2!
  const kingTargets = engine
    .getLegalMovesForSquare(canState, 7, 7)
    .map((m) => `${m.to.r},${m.to.c}`)
    .sort();
  assert.deepStrictEqual(
    kingTargets,
    ['6,6', '6,7', '7,6'],
    'Cannibal King escapes smothered mate by capturing any adjacent friendly non-defended piece!'
  );

  // Execute Kxg2 (7,7 -> 6,6)
  const afterKxg2 = engine.tryMakeMove(canState, { r: 7, c: 7 }, { r: 6, c: 6 });
  assert(afterKxg2, 'Kxg2 must succeed in Cannibal Chess');
  assert.strictEqual(afterKxg2.board[6][6], 'wk');
  assert.strictEqual(afterKxg2.board[7][7], null);
  assert.strictEqual(afterKxg2.moveHistory[0], 'Kxg2');
  // Captured friendly white pawn goes into Black's captured tray so Black's bar displays the lost White pawn
  assert.deepStrictEqual([...afterKxg2.captured.b], ['p']);
  assert.deepStrictEqual([...afterKxg2.captured.w], []);

  // 1B. King CANNOT capture friendly piece if that friendly piece's square IS defended by enemy!
  const bDefended = emptyBoard();
  bDefended[0][6] = 'br'; // Black rook on g8 defends g2!
  bDefended[0][0] = 'bk';
  bDefended[7][7] = 'wk';
  bDefended[6][6] = 'wp'; // g2 defended by br on g8
  const defState = makeCustomState('cannibal', bDefended, 'w');
  const kMovesDef = engine.getLegalMovesForSquare(defState, 7, 7).map((m) => `${m.to.r},${m.to.c}`);
  assert(!kMovesDef.includes('6,6'), 'King must NOT capture own pawn on g2 when g2 is defended by enemy Rook');

  // 1C. Non-King pieces can NEVER capture their own King!
  const bNoRoyalEat = emptyBoard();
  bNoRoyalEat[0][0] = 'bk';
  bNoRoyalEat[7][4] = 'wk';
  bNoRoyalEat[7][0] = 'wr';
  bNoRoyalEat[6][3] = 'wp'; // Pawn on d2 — wk is diagonally forward? No, wk is on e1 (behind). Put wk on d3 (5,3)!
  bNoRoyalEat[7][4] = null;
  bNoRoyalEat[5][3] = 'wk'; // White King on d3, White pawn on c2 (6,2), White Rook on d1 (7,3)
  bNoRoyalEat[6][2] = 'wp';
  bNoRoyalEat[7][3] = 'wr';
  const royalTest = makeCustomState('cannibal', bNoRoyalEat, 'w');
  const pawnTargets = engine.getLegalMovesForSquare(royalTest, 6, 2).map((m) => `${m.to.r},${m.to.c}`);
  assert(!pawnTargets.includes('5,3'), 'White pawn on c2 must NEVER capture friendly King on d3');
  const rookTargets = engine.getLegalMovesForSquare(royalTest, 7, 3).map((m) => `${m.to.r},${m.to.c}`);
  assert(!rookTargets.includes('5,3'), 'White rook on d1 must NEVER capture friendly King on d3');
  assert(!rookTargets.includes('4,3'), 'White rook on d1 must NOT jump over friendly King on d3');

  // 1D. Sliding pieces capture friendly piece AND stop ray there; Pawns capture friendly diagonally ONLY (never straight ahead!)
  const bPawnSlide = emptyBoard();
  bPawnSlide[0][0] = 'bk';
  bPawnSlide[7][7] = 'wk';
  bPawnSlide[6][4] = 'wp'; // e2
  bPawnSlide[5][4] = 'wn'; // e3 (blocks straight push!)
  bPawnSlide[5][3] = 'wb'; // d3 (diagonal friendly piece — capturable!)
  bPawnSlide[5][5] = 'bp'; // f3 (diagonal enemy piece — capturable!)
  bPawnSlide[7][4] = 'wr'; // e1 rook behind e2 pawn
  const psState = makeCustomState('cannibal', bPawnSlide, 'w');

  const e2Moves = engine.getLegalMovesForSquare(psState, 6, 4).map((m) => `${m.to.r},${m.to.c}`).sort();
  assert.deepStrictEqual(
    e2Moves,
    ['5,3', '5,5'],
    'Cannibal pawn on e2 captures friendly d3 & enemy f3 diagonally, and CANNOT capture/push onto friendly e3 straight ahead!'
  );

  const e1RookMoves = engine.getLegalMovesForSquare(psState, 7, 4).map((m) => `${m.to.r},${m.to.c}`);
  assert(e1RookMoves.includes('6,4'), 'Rook on e1 can capture friendly pawn on e2');
  assert(!e1RookMoves.includes('5,4'), 'Rook on e1 stops on e2 and cannot jump to e3');

  // 1E. Pawn diagonal self-capture onto 8th rank triggers promotion!
  const bPromoSelf = emptyBoard();
  bPromoSelf[7][0] = 'bk';
  bPromoSelf[7][7] = 'wk';
  bPromoSelf[1][4] = 'wp'; // e7
  bPromoSelf[0][3] = 'wn'; // friendly Knight on d8!
  const promoSelfState = makeCustomState('cannibal', bPromoSelf, 'w');
  const afterSelfPromo = engine.tryMakeMove(promoSelfState, { r: 1, c: 4 }, { r: 0, c: 3 }, 'q');
  assert(afterSelfPromo, 'exd8=Q capturing own Knight must be legal in Cannibal Chess');
  assert.strictEqual(afterSelfPromo.board[0][3], 'wq');
  assert.strictEqual(afterSelfPromo.moveHistory[0], 'exd8=Q');

  // 1F. Check safety on self-capture:
  // - A pinned pawn on e2 (6,4) shielding King on e1 (7,4) from Black Rook on e8 (0,4) CANNOT self-capture friendly Knight on d3 (5,3)!
  // - Conversely, friendly Knight on d3? Wait: friendly Knight on c3 (5,2) CAN self-capture e2 because the Knight lands on e2 and keeps shielding e1!
  const bPinShield = emptyBoard();
  bPinShield[0][4] = 'br'; // Black Rook on e8 aiming down e-file
  bPinShield[0][0] = 'bk';
  bPinShield[7][4] = 'wk'; // White King on e1
  bPinShield[6][4] = 'wp'; // Pinned White pawn on e2 shielding King!
  bPinShield[5][3] = 'wn'; // Friendly White Knight on d3 (diagonal from e2!)
  bPinShield[5][2] = 'wb'; // Friendly White Bishop on c3
  const shieldState = makeCustomState('cannibal', bPinShield, 'w');
  const pinnedE2Moves = engine.getLegalMovesForSquare(shieldState, 6, 4).map((m) => `${m.to.r},${m.to.c}`);
  assert(
    !pinnedE2Moves.includes('5,3'),
    'Pinned pawn on e2 must NOT self-capture friendly Knight on d3 and expose King to e8 Rook!'
  );
  // Meanwhile d3 Knight (5,3) cannot capture e2 (not a knight jump), whereas a Knight on c3... let's verify Bishop on f1 (7,5) cannot capture e2? Wait: Bishop on d3 (5,3) CAN capture e2 and replace the shield!
  bPinShield[5][3] = 'wb';
  const shieldReplaceState = makeCustomState('cannibal', bPinShield, 'w');
  const d3BishopMoves = engine.getLegalMovesForSquare(shieldReplaceState, 5, 3).map((m) => `${m.to.r},${m.to.c}`);
  assert(
    d3BishopMoves.includes('6,4'),
    'Friendly Bishop on d3 CAN self-capture e2 because it lands on e2 and maintains the shield!'
  );

  console.log('1. PASS: Cannibal Chess rules (King escape, diagonal-only pawn self-capture, ray-stop, Royal & pin safety) verified!');
}

/* ============================================================================
 * PART 2: PURE ENGINE TESTS — CRAZYHOUSE (EXACT CHESS.COM RULES)
 * ============================================================================ */

{
  // 2A. Capturing adds piece to pocket; dropping Knight & Pawn uses @ SAN; rank 1 & 8 pawn drop ban
  let zh = engine.createInitialState('crazyhouse');
  zh = engine.tryMakeMove(zh, { r: 6, c: 4 }, { r: 4, c: 4 }); // 1. e4
  zh = engine.tryMakeMove(zh, { r: 1, c: 3 }, { r: 3, c: 3 }); // 1... d5
  zh = engine.tryMakeMove(zh, { r: 4, c: 4 }, { r: 3, c: 3 }); // 2. exd5 -> White pockets 'p'!
  assert.deepStrictEqual([...zh.pockets.w], ['p'], 'Capturing Black pawn adds p to White pocket');

  zh = engine.tryMakeMove(zh, { r: 0, c: 3 }, { r: 3, c: 3 }); // 2... Qxd5 -> Black pockets 'p'!
  assert.deepStrictEqual([...zh.pockets.b], ['p'], 'Capturing White pawn adds p to Black pocket');

  // White has 'p' in pocket: verify pawn drop forbidden on rank 8 (r=0), rank 1 (r=7), and occupied squares!
  const pDrops = engine.getLegalDropMoves(zh, 'p', 'w');
  assert(pDrops.length > 0, 'White has legal pawn drops');
  assert(
    pDrops.every((m) => m.to.r >= 1 && m.to.r <= 6 && zh.board[m.to.r][m.to.c] === null),
    'Pawn drops never target rank 1 (r=7), rank 8 (r=0), or occupied squares'
  );
  assert.strictEqual(engine.tryMakeDrop(zh, 'p', { r: 0, c: 4 }), null, 'Pawn drop on 8th rank rejected');
  assert.strictEqual(engine.tryMakeDrop(zh, 'p', { r: 7, c: 4 }), null, 'Pawn drop on 1st rank rejected');
  assert.strictEqual(engine.tryMakeDrop(zh, 'p', { r: 3, c: 3 }), null, 'Drop on occupied square d5 rejected');
  assert.strictEqual(engine.tryMakeDrop(zh, 'n', { r: 5, c: 2 }), null, 'Drop of piece not in pocket rejected');

  // Drop pawn on e2 (r=6, c=4 — White's 2nd rank!) -> SAN '@e2', and verify 2-square advance works later!
  zh = engine.tryMakeDrop(zh, 'p', { r: 6, c: 4 });
  assert(zh, 'Dropping pawn on e2 succeeds');
  assert.strictEqual(zh.moveHistory[zh.moveHistory.length - 1], '@e2', 'Pawn drop SAN is @e2');
  assert.deepStrictEqual([...zh.pockets.w], [], 'White pocket emptied after drop');

  // Black plays Nf6
  zh = engine.tryMakeMove(zh, { r: 0, c: 6 }, { r: 2, c: 5 });
  // White's dropped pawn on e2 can push two squares to e4!
  const e2DroppedMoves = engine.getLegalMovesForSquare(zh, 6, 4).map((m) => `${m.to.r},${m.to.c}`);
  assert(e2DroppedMoves.includes('4,4'), 'Pawn dropped on 2nd rank retains 2-square advance!');

  // 2B. Promoted pawn tracking & demotion back to Pawn when captured!
  const bPromo = emptyBoard();
  bPromo[0][0] = 'bk';
  bPromo[7][7] = 'wk';
  bPromo[1][3] = 'wp'; // d7 pawn about to promote
  bPromo[7][3] = 'wq'; // Original White Queen on d1!
  bPromo[3][5] = 'bn'; // Black Knight on f5 (attacks d4 = 4,3!)
  bPromo[7][0] = 'br'; // Black Rook on a1 (blocked from h1 by wq on d1!)
  let pState = makeCustomState('crazyhouse', bPromo, 'w');

  // White promotes d7 -> d8=Q (0,3)
  pState = engine.tryMakeMove(pState, { r: 1, c: 3 }, { r: 0, c: 3 }, 'q');
  assert(pState);
  assert.deepStrictEqual([...pState.promoted], ['0,3'], 'Promoted Queen tracked at d8 (0,3)');

  // Black plays Kb7 (0,0 -> 1,1)
  pState = engine.tryMakeMove(pState, { r: 0, c: 0 }, { r: 1, c: 1 });
  assert(pState);
  // White moves promoted Queen d8 -> d4 (0,3 -> 4,3)
  pState = engine.tryMakeMove(pState, { r: 0, c: 3 }, { r: 4, c: 3 });
  assert(pState);
  assert.deepStrictEqual([...pState.promoted], ['4,3'], 'Promoted Queen coordinate follows piece to d4 (4,3)!');

  // Black captures the promoted Queen on d4 (4,3) with Knight from f5 (3,5 -> 4,3)!
  pState = engine.tryMakeMove(pState, { r: 3, c: 5 }, { r: 4, c: 3 });
  assert(pState);
  assert.deepStrictEqual(
    [...pState.pockets.b],
    ['p'],
    'Capturing a promoted Queen demotes it to a PAWN in Crazyhouse pocket!'
  );
  assert.deepStrictEqual([...pState.promoted], [], 'Promoted marker cleared once captured');

  // White plays Kh2 (7,7 -> 6,7), Black plays Rxa1xd1 (7,0 -> 7,3) capturing ORIGINAL Queen!
  pState = engine.tryMakeMove(pState, { r: 7, c: 7 }, { r: 6, c: 7 });
  assert(pState);
  pState = engine.tryMakeMove(pState, { r: 7, c: 0 }, { r: 7, c: 3 }); // Rxd1 (original Queen!)
  assert(pState);
  assert.deepStrictEqual(
    [...pState.pockets.b],
    ['p', 'q'],
    'Capturing an original Queen adds an actual Queen (q) to Crazyhouse pocket!'
  );

  // 2C. Drop to block check & Drop to deliver Checkmate (Q@g7#)
  const bCheckBlock = emptyBoard();
  bCheckBlock[0][4] = 'br'; // Black Rook on e8 checking White King on e1!
  bCheckBlock[0][0] = 'bk';
  bCheckBlock[7][4] = 'wk';
  const blockState = makeCustomState('crazyhouse', bCheckBlock, 'w', { pockets: { w: ['b'], b: [] } });
  assert.strictEqual(blockState.inCheck, true);
  const bDrops = engine.getLegalDropMoves(blockState, 'b', 'w').map((m) => `${m.to.r},${m.to.c}`);
  // Only squares strictly between e8 (0,4) and e1 (7,4) block the check: e7..e2!
  assert.deepStrictEqual(
    bDrops.sort(),
    ['1,4', '2,4', '3,4', '4,4', '5,4', '6,4'],
    'When in check, only interposing pocket drops on the checking ray are legal!'
  );

  // Drop delivering checkmate: Black King on h8 (0,7), White King on f6 (2,5), White pockets ['q'] -> Q@g7# (1,6)!
  const bMateDrop = emptyBoard();
  bMateDrop[0][7] = 'bk';
  bMateDrop[2][5] = 'wk';
  let mateState = makeCustomState('crazyhouse', bMateDrop, 'w', { pockets: { w: ['q'], b: [] } });
  mateState = engine.tryMakeDrop(mateState, 'q', { r: 1, c: 6 });
  assert(mateState, 'Q@g7# drop must succeed');
  assert.strictEqual(mateState.status, 'checkmate');
  assert.strictEqual(mateState.winner, 'w');
  assert.strictEqual(mateState.moveHistory[0], 'Q@g7#', 'Checkmating drop SAN is Q@g7#');

  // 2D. Dropped Rook on h1 cannot castle after original castling right was lost, and K vs K + pocket is NOT draw_material!
  const bKvsK = emptyBoard();
  bKvsK[0][4] = 'bk';
  bKvsK[7][4] = 'wk';
  bKvsK[6][0] = 'bp'; // Black pawn on a2 captured by White? Put bp adjacent to wk on d2 (6,3)
  bKvsK[6][0] = null;
  bKvsK[6][3] = 'bp';
  let kkState = makeCustomState('crazyhouse', bKvsK, 'w');
  kkState = engine.tryMakeMove(kkState, { r: 7, c: 4 }, { r: 6, c: 3 }); // Kxd2 -> pockets.w = ['p']!
  assert.strictEqual(
    kkState.status,
    'playing',
    'K vs K with a pawn in Crazyhouse pocket is NOT insufficient material!'
  );

  console.log('2. PASS: Crazyhouse rules (@ SAN, rank 1/8 pawn ban, 2nd-rank double push, promoted pawn demotion, check block & Q@g7#) verified!');
}

/* ============================================================================
 * PART 3: PURE ENGINE TESTS — FOG OF WAR (EXACT CHESS.COM RULES)
 * ============================================================================ */

{
  // 3A. Initial position visibility: White sees all 32 squares on ranks 1-4 (r=4..7), 0 squares on ranks 5-8 (r=0..3)
  const fogInit = engine.createInitialState('fog');
  const visW = engine.computeVisibleSquares(fogInit, 'w');
  assert.strictEqual(visW.size, 32, 'Initial Fog of War visibility for White is exactly 32 squares (ranks 1-4)');
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r >= 4) assert(visW.has(`${r},${c}`), `Rank ${8 - r} col ${c} should be visible`);
      else assert(!visW.has(`${r},${c}`), `Rank ${8 - r} col ${c} should be hidden in fog`);
    }
  }

  // 3B. "The Pawn Test": White pawn on e4 (4,4), Black pawn on e5 (3,4) blocking it, Black piece on d5 (3,3) diagonally capturable!
  const bPawnTest = emptyBoard();
  bPawnTest[7][0] = 'wk';
  bPawnTest[0][0] = 'bk';
  bPawnTest[4][4] = 'wp'; // e4
  bPawnTest[3][4] = 'bp'; // e5 (directly ahead — MUST STAY IN FOG!)
  bPawnTest[3][3] = 'bn'; // d5 (diagonal — MUST BE REVEALED!)
  const pawnFog = makeCustomState('fog', bPawnTest, 'w');
  const visPawn = engine.computeVisibleSquares(pawnFog, 'w');

  assert(!visPawn.has('3,4'), 'Blocked square e5 directly ahead of White pawn MUST remain in fog!');
  assert(!visPawn.has('3,5'), 'Empty diagonal f5 of White pawn MUST remain in fog!');
  assert(visPawn.has('3,3'), 'Enemy piece on diagonal d5 of White pawn MUST be revealed!');
  const e4FogMoves = engine.getLegalMovesForSquare(pawnFog, 4, 4).map((m) => `${m.to.r},${m.to.c}`);
  assert.deepStrictEqual(e4FogMoves, ['3,3'], 'e4 pawn can only capture revealed d5 and has no forward dot to e5');

  // 3C. En Passant Visibility: White pawn on e5 (3,4), Black plays d7-d5 -> both d6 (2,3) AND d5 (3,3) are visible!
  const bEpFog = emptyBoard();
  bEpFog[7][0] = 'wk';
  bEpFog[0][7] = 'bk';
  bEpFog[3][4] = 'wp'; // e5
  bEpFog[1][3] = 'bp'; // d7
  let epFogState = makeCustomState('fog', bEpFog, 'b');
  epFogState = engine.tryMakeMove(epFogState, { r: 1, c: 3 }, { r: 3, c: 3 }); // ...d5
  const visEp = engine.computeVisibleSquares(epFogState, 'w');
  assert(visEp.has('2,3'), 'En passant landing square d6 is visible');
  assert(visEp.has('3,3'), 'En passant captured pawn square d5 is ALSO revealed in Fog of War!');

  // 3D. Castling while in check, through check, and into check are ALL legal in Fog of War!
  const bFogCastle = emptyBoard();
  bFogCastle[0][0] = 'bk';
  bFogCastle[7][4] = 'wk'; // e1
  bFogCastle[7][7] = 'wr'; // h1
  bFogCastle[0][4] = 'br'; // attacks e1 (currently in attack!)
  bFogCastle[0][5] = 'br'; // attacks f1 (castling through attack!)
  bFogCastle[0][6] = 'br'; // attacks g1 (castling into attack!)
  let fogCastleState = makeCustomState('fog', bFogCastle, 'w', {
    castling: { wK: true, wQ: false, bK: false, bQ: false }
  });
  const e1Moves = engine.getLegalMovesForSquare(fogCastleState, 7, 4).map((m) => `${m.to.r},${m.to.c}`);
  assert(
    e1Moves.includes('7,6'),
    'O-O while attacked, through f1 attack, and into g1 attack is LEGAL in Chess.com Fog of War!'
  );
  fogCastleState = engine.tryMakeMove(fogCastleState, { r: 7, c: 4 }, { r: 7, c: 6 });
  assert(fogCastleState, 'Executing O-O in Fog of War succeeds');
  assert.strictEqual(fogCastleState.moveHistory[0], 'O-O');

  // 3E. SAN omits '+' / '#' in Fog of War, and capturing the opponent's King immediately wins ('king_captured')!
  // Black Rook on g8 (0,6) captures White King on g1 (7,6)!
  fogCastleState = engine.tryMakeMove(fogCastleState, { r: 0, c: 6 }, { r: 7, c: 6 });
  assert(fogCastleState, 'Rxg1 capturing the King is legal in Fog of War');
  assert.strictEqual(fogCastleState.status, 'king_captured');
  assert.strictEqual(fogCastleState.winner, 'b');
  assert.strictEqual(fogCastleState.moveHistory[1], 'Rxg1', 'No + or # in Fog of War SAN');

  console.log('3. PASS: Fog of War engine rules (visibility, Pawn Test, En Passant reveal, castle through attack & King capture win) verified!');
}

/* ============================================================================
 * PART 4: FULL MULTIPLAYER HOST/GUEST DOM + NETWORK SIMULATION
 * - Fog of War network packet anti-cheat masking & post-game full reveal
 * - Crazyhouse pocket UI, multi-premove pocket drop + chained move, & turn upgrade
 * - Local variant switcher bar & Setup panel variant selection
 * ============================================================================ */

let networkDelayMs = 5;
const broker = new Map();
const sentPacketsLog = [];
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
  constructor(targetId, fromId) {
    this.targetId = targetId;
    this.fromId = fromId;
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
    sentPacketsLog.push({ from: this.fromId, to: this.targetId, packet: cloned });
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
    const c1 = new MockConn(targetId, this.id);
    const hostPeer = broker.get(targetId);
    const c2 = new MockConn(this.id, targetId);
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

const htmlIds = new Set();
{
  const idRe = /\bid="([^"]+)"/g;
  let m;
  while ((m = idRe.exec(html)) !== null) htmlIds.add(m[1]);
}

function makeFakeElement(tag = 'div', id = '') {
  const classes = new Set();
  const listeners = {};
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
    setAttribute() {},
    removeAttribute() {},
    closest(sel) {
      if (sel.startsWith('.') && classes.has(sel.slice(1))) return el;
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
        if (sel.endsWith('.piece')) return sq.children.find((ch) => ch.classList?.contains('piece')) || null;
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
        clientX: 0,
        clientY: 0,
        preventDefault() {},
        stopPropagation() {},
        ...eventObj
      };
      for (const fn of listeners[ev] || []) fn(e);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 };
    },
    scrollIntoView() {}
  };
  return el;
}

function createClientInstance(urlSearch = '') {
  const elements = new Map();
  for (const id of htmlIds) elements.set(id, makeFakeElement('div', id));
  elements.get('setup-minutes-slider').value = '10';
  elements.get('setup-increment-slider').value = '0';

  // Populate variant buttons in setup-variant-grid & local-variant-bar
  for (const v of ['standard', 'cannibal', 'crazyhouse', 'fog']) {
    const vb = makeFakeElement('button');
    vb.className = 'variant-btn';
    vb.dataset.variant = v;
    elements.get('setup-variant-grid').appendChild(vb);

    const lb = makeFakeElement('button');
    lb.className = 'local-variant-btn';
    lb.dataset.variant = v;
    elements.get('local-variant-bar').appendChild(lb);
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

  const sandbox = {
    Peer: MockPeer,
    console,
    Math,
    Date,
    JSON,
    URL: class {
      constructor() {
        this.params = new Map();
      }
      toString() {
        return 'https://example.com/';
      }
      get searchParams() {
        return { set: (k, v) => this.params.set(k, v) };
      }
    },
    URLSearchParams,
    setTimeout: trackedTimeout,
    clearTimeout: (id) => {
      pendingTimers.delete(id);
      clearTimeout(id);
    },
    setInterval: (fn, ms) => {
      const id = setInterval(fn, ms);
      intervalIds.push(id);
      return id;
    },
    clearInterval,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { clipboard: { writeText: async () => {} } },
    window: null,
    document: null
  };

  sandbox.document = {
    readyState: 'complete',
    title: 'Chess',
    body: makeFakeElement('body'),
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => makeFakeElement(tag),
    createElementNS: (_, tag) => makeFakeElement(tag),
    createDocumentFragment: () => ({ isFrag: true, children: [], appendChild(c) { this.children.push(c); } }),
    querySelectorAll: () => []
  };

  sandbox.window = {
    location: { href: 'https://example.com/' + urlSearch, search: urlSearch, pathname: '/', hash: '' },
    history: { replaceState() {} },
    AudioContext: undefined,
    addEventListener(ev, fn) {
      (winListeners[ev] ||= []).push(fn);
    },
    dispatch(ev, obj = {}) {
      const e = { preventDefault() {}, ...obj };
      for (const fn of winListeners[ev] || []) fn(e);
    }
  };

  runAppInContext(
    sandbox,
    `globalThis.__test = {
      getState: () => gameState,
      getNet: () => net,
      getPremoves: () => premoveQueue,
      getSelectedPocket: () => selectedPocketType,
      getPremovePocket: () => premovePocketType,
      getBoardFlipped: () => boardFlipped,
      buildPGN: () => buildPGNString()
    };`
  );

  function squareCenter(r, c) {
    const flipped = sandbox.__test.getBoardFlipped();
    const visRow = flipped ? 7 - r : r;
    const visCol = flipped ? 7 - c : c;
    return { clientX: visCol * 100 + 50, clientY: visRow * 100 + 50 };
  }

  function clickSquare(r, c, button = 0) {
    const pt = squareCenter(r, c);
    elements.get('board').dispatch('pointerdown', { button, pointerId: 1, ...pt });
    sandbox.window.dispatch('pointerup', { button, pointerId: 1, ...pt });
  }

  function clickPocket(pocketId, pieceType) {
    const pocketEl = elements.get(pocketId);
    const slot = pocketEl.children.find((ch) => ch.dataset?.piece === pieceType);
    assert(slot, `Expected pocket slot ${pieceType} in #${pocketId}`);
    slot.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10, target: slot });
    sandbox.window.dispatch('pointerup', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  }

  return {
    elements,
    api: sandbox.__test,
    clickSquare,
    clickPocket,
    cleanup() {
      intervalIds.forEach(clearInterval);
    }
  };
}

async function waitFor(pred, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Timed out waiting for condition');
}

(async () => {
  // 4A. CSS verification: flat Chess.com dark mode fog & pocket classes exist, zero AI-slop neon/backdrop-filter
  assert(css.includes('.square.light.fog') && css.includes('.square.dark.fog'), 'Fog CSS classes present');
  assert(css.includes('.pocket-slot') && css.includes('.pocket-bar'), 'Pocket CSS classes present');
  assert(!css.includes('backdrop-filter'), 'Zero glassmorphism backdrop-filter');

  // 4B. Local Variant Switcher Bar test
  const localApp = createClientInstance();
  assert.strictEqual(localApp.api.getState().variant, 'standard');
  const cannibalLocalBtn = localApp.elements
    .get('local-variant-bar')
    .children.find((b) => b.dataset.variant === 'cannibal');
  localApp.elements.get('local-variant-bar').dispatch('click', { target: cannibalLocalBtn });
  assert.strictEqual(localApp.api.getState().variant, 'cannibal', 'Local variant bar switches board to Cannibal Chess');
  // In Cannibal Chess local mode, White Queen on d1 (7,3) can immediately capture friendly pawn on d2 (6,3)!
  localApp.clickSquare(7, 3);
  localApp.clickSquare(6, 3);
  assert.strictEqual(localApp.api.getState().board[6][3], 'wq', 'Local Cannibal Chess Qxd2 self-capture works in UI!');
  // Reset button keeps Cannibal Chess active rather than reverting to standard!
  localApp.elements.get('reset-local-btn').dispatch('click');
  assert.strictEqual(localApp.api.getState().variant, 'cannibal', 'New Local Game keeps selected variant');
  localApp.cleanup();

  console.log('4. PASS: Local Variant Bar switching, Cannibal UI play & New Local Game preservation verified!');

  // 4C. Online FOG OF WAR Anti-Cheat Network Packet Masking + Post-Game Full Reveal!
  sentPacketsLog.length = 0;
  const fogHost = createClientInstance();
  const fogGuest = createClientInstance();

  // Host opens setup, picks 'fog', picks White, Unlimited time, and creates game
  fogHost.elements.get('open-setup-btn').dispatch('click');
  const fogBtn = fogHost.elements.get('setup-variant-grid').children.find((b) => b.dataset.variant === 'fog');
  fogHost.elements.get('setup-variant-grid').dispatch('click', { target: fogBtn });
  const unlimBtn = fogHost.elements.get('preset-row').children[0];
  fogHost.elements.get('preset-row').dispatch('click', { target: unlimBtn });
  fogHost.elements.get('create-game-btn').dispatch('click');

  await waitFor(() => fogHost.api.getNet().mode === 'waiting' && fogHost.api.getNet().roomCode.length === 5);
  assert(
    fogHost.elements.get('waiting-summary').textContent.includes('Fog of War'),
    'Waiting summary displays Fog of War'
  );

  const fogCode = fogHost.api.getNet().roomCode;
  fogGuest.elements.get('join-code-input').value = fogCode;
  fogGuest.elements.get('join-game-form').dispatch('submit');

  await waitFor(() => fogHost.api.getNet().mode === 'online' && fogGuest.api.getNet().mode === 'online');
  assert.strictEqual(fogGuest.api.getState().variant, 'fog');
  assert.strictEqual(fogGuest.elements.get('active-variant-tag').textContent, 'Fog of War');

  // Host (White) plays 1. e4 (6,4 -> 4,4)
  sentPacketsLog.length = 0;
  fogHost.clickSquare(6, 4);
  fogHost.clickSquare(4, 4);

  await waitFor(() => fogGuest.api.getState().moveHistory.length === 1);

  // Inspect raw network packet received by Guest!
  const syncPkt = sentPacketsLog.find((p) => p.packet.type === 'sync_state')?.packet;
  assert(syncPkt, 'Host sent sync_state packet to Guest');
  assert.strictEqual(syncPkt.state.fogMasked, true, 'Network packet has fogMasked: true');
  assert.strictEqual(
    syncPkt.state.historyFrames.length,
    2,
    'Fog-masked history frames (start + ply 1) are sent so < / > previous move works in Fog of War'
  );
  assert.strictEqual(syncPkt.state.historyFrames[0].board[6][4], null, 'Ply 0 frame in packet masks hidden White e2');
  assert.strictEqual(syncPkt.state.historyFrames[1].board[4][4], null, 'Ply 1 frame in packet masks hidden e4');
  assert.strictEqual(syncPkt.state.historyFrames[1].board[7][4], null, 'Ply 1 frame in packet masks hidden White King e1');
  assert.deepStrictEqual([...syncPkt.state.moveHistory], ['?'], 'White move 1. e4 is masked as ? over the network!');
  assert.strictEqual(syncPkt.state.castling.wK, false, 'Hidden White castling rights masked in packet');
  // Black at start + after 1. e4 only sees ranks 8-5 (r=0..3); White's e4 (r=4,c=4) and White's back rank (r=7) MUST BE NULL in packet!
  assert.strictEqual(syncPkt.state.board[4][4], null, 'White e4 pawn is NOT in Guest network packet!');
  assert.strictEqual(syncPkt.state.board[7][4], null, 'White King e1 is NOT in Guest network packet!');

  // Inspect Guest DOM: e4 square (4,4) has class 'fog' and zero '.piece' children, AND < / > previous move button IS enabled!
  const guestE4El = fogGuest.elements.get('board').querySelector('.square[data-r="4"][data-c="4"]');
  assert(guestE4El.classList.contains('fog'), 'Square e4 has .fog class on Guest board');
  assert(
    !guestE4El.children.some((ch) => ch.classList?.contains('piece')),
    'No piece DOM element rendered on fogged square e4'
  );
  assert.strictEqual(fogGuest.elements.get('nav-prev-btn').disabled, false, 'Previous move (<) enabled during live Fog of War!');
  // Step back to ply 0 on Guest: fog stays intact on e2/e4, then step forward back to live ply 1!
  fogGuest.elements.get('nav-prev-btn').dispatch('click');
  const guestE4Past = fogGuest.elements.get('board').querySelector('.square[data-r="4"][data-c="4"]');
  assert(guestE4Past.classList.contains('fog'), 'Viewing previous turn keeps fog on e4 intact');
  assert(!guestE4Past.children.some((ch) => ch.classList?.contains('piece')), 'No piece revealed when stepping back');
  fogGuest.elements.get('nav-next-btn').dispatch('click');
  assert(fogGuest.api.buildPGN().includes('1. ?'), 'PGN mid-game masks opponent moves as ?');

  // Play quick Fool's-style King capture in Fog of War:
  // 1... f5 (1,5 -> 3,5) by Guest (Black)
  fogGuest.clickSquare(1, 5);
  fogGuest.clickSquare(3, 5);
  await waitFor(() => fogHost.api.getState().moveHistory.length === 2);

  // Guest steps back to White's hidden move 1. e4 -> status banner keeps move masked as (?)!
  fogGuest.elements.get('nav-prev-btn').dispatch('click');
  assert(
    fogGuest.elements.get('status-banner').textContent.includes('Viewing move 1/2 (?)'),
    'Viewing opponent move in live Fog keeps SAN masked as ?'
  );
  fogGuest.elements.get('nav-next-btn').dispatch('click');

  // 2. Qh5 (7,3 -> 3,7) by Host (White) — in Standard this would be Qh5+, in Fog of War no check warning!
  fogHost.clickSquare(7, 3);
  fogHost.clickSquare(3, 7);
  await waitFor(() => fogGuest.api.getState().moveHistory.length === 3);
  assert(
    !fogGuest.elements.get('status-banner').textContent.includes('Check'),
    'Guest receives zero Check warning when King is attacked from the fog!'
  );

  // 2... g6?? No, leave e8 open so Qh5xe8 captures Black's King! Black plays a6 (1,0 -> 2,0)!
  fogGuest.clickSquare(1, 0);
  fogGuest.clickSquare(2, 0);
  await waitFor(() => fogHost.api.getState().moveHistory.length === 4);

  // 3. Qxe8! (3,7 -> 0,4) — Host captures Black's King!
  fogHost.clickSquare(3, 7);
  fogHost.clickSquare(0, 4);
  await waitFor(() => fogGuest.api.getState().status === 'king_captured');

  // Verify FULL UNMASKED REVEAL on Guest once game ends!
  assert.strictEqual(fogGuest.api.getState().fogMasked, false, 'Game over packet unmasks full board!');
  assert.strictEqual(fogGuest.api.getState().board[7][4], 'wk', 'Guest now sees White King on e1');
  assert.deepStrictEqual(
    [...fogGuest.api.getState().moveHistory],
    ['e4', 'f5', 'Qh5', 'a6', 'Qxe8'],
    'Full real SAN move history revealed at game end!'
  );
  assert(
    fogGuest.elements.get('status-banner').textContent.includes('King captured — White wins!'),
    'Status banner announces King captured — White wins!'
  );
  assert.strictEqual(
    fogGuest.elements.get('nav-prev-btn').disabled,
    false,
    'Post-game < / > replay unlocks immediately once Fog of War game ends!'
  );

  fogHost.cleanup();
  fogGuest.cleanup();

  console.log('5. PASS: Online Fog of War network packet anti-cheat masking, zero check leaks & post-game full reveal verified!');

  // 4D. Online CRAZYHOUSE: Pocket UI, Multi-Premove Pocket Drop (N@f3 -> Ne5), & Pocket Selection Turn Upgrade!
  const zhHost = createClientInstance();
  const zhGuest = createClientInstance();

  zhHost.elements.get('open-setup-btn').dispatch('click');
  const zhBtn = zhHost.elements.get('setup-variant-grid').children.find((b) => b.dataset.variant === 'crazyhouse');
  zhHost.elements.get('setup-variant-grid').dispatch('click', { target: zhBtn });
  zhHost.elements.get('preset-row').dispatch('click', {
    target: zhHost.elements.get('preset-row').children[0]
  });
  zhHost.elements.get('create-game-btn').dispatch('click');

  await waitFor(() => zhHost.api.getNet().mode === 'waiting' && zhHost.api.getNet().roomCode.length === 5);
  zhGuest.elements.get('join-code-input').value = zhHost.api.getNet().roomCode;
  zhGuest.elements.get('join-game-form').dispatch('submit');
  await waitFor(() => zhHost.api.getNet().mode === 'online' && zhGuest.api.getNet().mode === 'online');

  assert(!zhGuest.elements.get('bottom-pocket').classList.contains('hidden'), 'Crazyhouse pocket bar is visible');

  // Play:
  // 1. Nf3 (7,6 -> 5,5) by Host (White)
  zhHost.clickSquare(7, 6);
  zhHost.clickSquare(5, 5);
  await waitFor(() => zhGuest.api.getState().turn === 'b');

  // 1... d5 (1,3 -> 3,3) by Guest (Black)
  zhGuest.clickSquare(1, 3);
  zhGuest.clickSquare(3, 3);
  await waitFor(() => zhHost.api.getState().turn === 'w');

  // 2. Ne5 (5,5 -> 3,4) by Host (White)
  zhHost.clickSquare(5, 5);
  zhHost.clickSquare(3, 4);
  await waitFor(() => zhGuest.api.getState().turn === 'b');

  // 2... fxe6? Let's capture Ne5 with f7-f6? Wait: Nd7 (0,1 -> 1,3), then White Nxd7 or Black Nxe5!
  // Guest plays Nd7 (0,1 -> 1,3)
  zhGuest.clickSquare(0, 1);
  zhGuest.clickSquare(1, 3);
  await waitFor(() => zhHost.api.getState().turn === 'w');

  // Host plays a3 (6,0 -> 5,0)
  zhHost.clickSquare(6, 0);
  zhHost.clickSquare(5, 0);
  await waitFor(() => zhGuest.api.getState().turn === 'b');

  // Guest plays Nxe5! (1,3 -> 3,4) -> Guest (Black) captures White's Knight and gets 'n' in Black's pocket!
  zhGuest.clickSquare(1, 3);
  zhGuest.clickSquare(3, 4);
  await waitFor(() => zhHost.api.getState().turn === 'w' && zhGuest.api.getState().pockets.b.includes('n'));

  // Now it is Host's (White's) turn!
  // Test 1: Guest clicks 'n' in #bottom-pocket during Host's turn -> enters premovePocketType = 'n'!
  // Then Guest queues premove drop N@c4 (4,2), AND chains a 2nd premove moving that dropped Knight Nc4->d2? Wait: let's move Nc4->b6 (2,1) so it's empty!
  zhGuest.clickPocket('bottom-pocket', 'n');
  assert.strictEqual(zhGuest.api.getPremovePocket(), 'n', 'Pocket Knight selected in premove mode');
  zhGuest.clickSquare(4, 2); // Queue Premove #1: N@c4!
  assert.strictEqual(zhGuest.api.getPremoves().length, 1, 'Premove pocket drop N@c4 queued');
  assert.strictEqual(zhGuest.api.getPremoves()[0].isDrop, true);

  // While queued, Guest's projected pocket count for 'n' should drop to 0 (.empty class on slot)!
  const nSlotWhileQueued = zhGuest.elements
    .get('bottom-pocket')
    .children.find((ch) => ch.dataset.piece === 'n');
  assert(nSlotWhileQueued.classList.contains('empty'), 'Projected pocket badge decrements while premove drop is queued');

  // Chain Premove #2 from the projected dropped Knight on c4 (4,2) -> a3 (5,0) capturing White's pawn!
  zhGuest.clickSquare(4, 2);
  zhGuest.clickSquare(5, 0);
  assert.strictEqual(zhGuest.api.getPremoves().length, 2, 'Chained board premove from projected dropped Knight queued!');

  // Host plays h3 (6,7 -> 5,7) -> Guest's Premove #1 (N@c4) fires automatically!
  zhHost.clickSquare(6, 7);
  zhHost.clickSquare(5, 7);
  await waitFor(() => zhHost.api.getState().board[4][2] === 'bn' && zhHost.api.getState().turn === 'w');
  assert.strictEqual(
    zhHost.api.getState().moveHistory[zhHost.api.getState().moveHistory.length - 1],
    'N@c4',
    'Premove drop N@c4 executed over network!'
  );

  // Host plays h4 (5,7 -> 4,7) -> Guest's Premove #2 (Nxa3) fires automatically AND gives Guest a 'p' in pocket!
  zhHost.clickSquare(5, 7);
  zhHost.clickSquare(4, 7);
  await waitFor(() => zhHost.api.getState().board[5][0] === 'bn' && zhGuest.api.getState().pockets.b.includes('p'));

  // Test 2: During Host's turn, Guest selects pocket pawn ('p') without dropping yet; Host moves -> pocket selection seamlessly upgrades to live selectedPocketType!
  zhGuest.clickPocket('bottom-pocket', 'p');
  assert.strictEqual(zhGuest.api.getPremovePocket(), 'p');
  zhHost.clickSquare(6, 1); // b2 -> b3 (6,1 -> 5,1)
  zhHost.clickSquare(5, 1);
  await waitFor(() => zhGuest.api.getState().turn === 'b');
  assert.strictEqual(
    zhGuest.api.getSelectedPocket(),
    'p',
    'Selected pocket piece seamlessly upgrades from premovePocketType to live selectedPocketType on turn change!'
  );
  // Single click on c5 (3,2) drops '@c5' immediately without re-selecting!
  zhGuest.clickSquare(3, 2);
  await waitFor(() => zhHost.api.getState().board[3][2] === 'bp');

  zhHost.cleanup();
  zhGuest.cleanup();

  console.log('6. PASS: Online Crazyhouse pocket UI, multi-premove N@c4 -> Nxa3 chain, & seamless pocket turn-upgrade verified!');
  console.log('\nALL VARIANT ENGINE, UI, POCKET PREMOVE & FOG SECURITY TESTS PASSED!');
})();
