const assert = require('assert');
const {
  VARIANT_DEFS,
  getVariantDef,
  createInitialState,
  getLegalMovesForSquare,
  getDisplayedLegalMovesForSquare,
  getAllLegalMoves,
  applyMove,
  tryMakeMove,
  isInCheck,
  validateAndHydrateState,
  serializeAuthoritativeState,
  serializeStateForPeer,
  checkSecretQueenPinInteraction,
  revealSecretQueen,
  assignSecretQueen,
  isStandardPawnMove
} = require('./load-app').loadAppExports();

console.log('Running Exhaustive Secret Queen Chess Variant Test Suite...\n');

// 1. Variant Definition and Initial State
{
  assert(VARIANT_DEFS.secret, 'secret variant definition must exist');
  assert.strictEqual(VARIANT_DEFS.secret.secretQueen, true);
  assert.strictEqual(VARIANT_DEFS.secret.name, 'Secret Queen Chess');

  const s = createInitialState('secret');
  assert.strictEqual(s.status, 'secret_pick');
  assert(s.secretQueens, 'state.secretQueens must exist');
  assert.strictEqual(s.secretQueens.w.picked, false);
  assert.strictEqual(s.secretQueens.b.picked, false);
  assert.strictEqual(s.secretQueens.w.sq, null);
  assert.strictEqual(s.secretQueens.b.sq, null);

  assignSecretQueen(s, 'w', 4);
  assert.deepStrictEqual(s.secretQueens.w.sq, { r: 6, c: 4 });
  assert.strictEqual(s.secretQueens.w.picked, true);
  assert.strictEqual(s.secretQueens.w.revealed, false);

  const readyState = createInitialState('secret', { whiteCol: 4, blackCol: 3, ready: true });
  assert.strictEqual(readyState.status, 'playing');
  assert.deepStrictEqual(readyState.secretQueens.w.sq, { r: 6, c: 4 });
  assert.deepStrictEqual(readyState.secretQueens.b.sq, { r: 1, c: 3 });
  assert.strictEqual(readyState.secretQueens.w.revealed, false);
  assert.strictEqual(readyState.secretQueens.b.revealed, false);
  console.log('1. PASS: Variant definition, pick phase initialization & assignment verified!');
}

// 2. Standard Pawn Moves Keep Queen Disguised
{
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 4, ready: true });
  // White pawn on e2 (6, 4) is secret queen. Make 2-step push e2 -> e4 (6,4 -> 4,4)
  const next = tryMakeMove(s, { r: 6, c: 4 }, { r: 4, c: 4 });
  assert(next, 'e2-e4 must be legal');
  assert.strictEqual(next.board[4][4], 'wp', 'Piece must remain disguised as pawn wp');
  assert.strictEqual(next.secretQueens.w.revealed, false, 'Secret Queen must stay unrevealed');
  assert.deepStrictEqual(next.secretQueens.w.sq, { r: 4, c: 4 }, 'sq must track new coordinates');
  assert.strictEqual(next.moveHistory[0], 'e4', 'SAN must be standard pawn move e4');

  // Black makes move e7-e5
  const next2 = tryMakeMove(next, { r: 1, c: 4 }, { r: 3, c: 4 });
  assert(next2, 'e7-e5 must be legal');
  assert.strictEqual(next2.board[3][4], 'bp');
  assert.strictEqual(next2.secretQueens.b.revealed, false);
  assert.deepStrictEqual(next2.secretQueens.b.sq, { r: 3, c: 4 });
  assert.strictEqual(next2.moveHistory[1], 'e5');
  console.log('2. PASS: Standard pawn push keeps Secret Queen disguised as pawn (SAN e4/e5)!');
}

// 3. Condition 1: Non-Pawn Moves Permanently Reveal Queen
{
  // Position where White SQ on e4 has empty squares backwards, sideways, and diagonal
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 0, ready: true });
  s.board[6][4] = null;
  s.board[4][4] = 'wp'; // White SQ on e4
  s.secretQueens.w.sq = { r: 4, c: 4 };

  // Clear path on 4th rank (sideways)
  s.board[4][0] = null;
  s.board[4][1] = null;
  s.board[4][2] = null;
  s.board[4][3] = null;

  // Clear path backwards e4 -> e3
  s.board[5][4] = null;

  // A) Test moving backwards e4 -> e3 (a standard pawn CANNOT move backwards!)
  const sBack = tryMakeMove(s, { r: 4, c: 4 }, { r: 5, c: 4 });
  assert(sBack, 'e4-e3 backward queen move must be legal for secret queen');
  assert.strictEqual(sBack.board[5][4], 'wq', 'Piece must permanently reveal as wq!');
  assert.strictEqual(sBack.secretQueens.w.revealed, true, 'revealed must be true');
  assert.strictEqual(sBack.moveHistory[0], 'Qe3', 'SAN must display Queen notation Qe3');

  // B) Test moving sideways e4 -> a4 (pawn cannot move sideways)
  const sSide = tryMakeMove(s, { r: 4, c: 4 }, { r: 4, c: 0 });
  assert(sSide, 'e4-a4 sideways queen move must be legal');
  assert.strictEqual(sSide.board[4][0], 'wq', 'Piece must reveal as wq');
  assert.strictEqual(sSide.secretQueens.w.revealed, true);
  assert.strictEqual(sSide.moveHistory[0], 'Qa4', 'SAN must display Qa4');

  // C) Test moving diagonally to empty square e4 -> c6 (pawn cannot diagonal without capture)
  s.board[2][2] = null; // c6 empty
  const sDiag = tryMakeMove(s, { r: 4, c: 4 }, { r: 2, c: 2 });
  assert(sDiag, 'e4-c6 diagonal non-capture must be legal');
  assert.strictEqual(sDiag.board[2][2], 'wq', 'Piece must reveal as wq');
  assert.strictEqual(sDiag.secretQueens.w.revealed, true);
  assert.strictEqual(sDiag.moveHistory[0], 'Qc6', 'SAN must display Qc6');
  console.log('3. PASS: Condition 1 non-pawn moves (backward, sideways, diagonal non-capture) permanently reveal Queen!');
}

// 4. Condition 2: Delivering Check Permanently Reveals Queen
{
  // A) Direct check via standard pawn push:
  // White SQ on e6 steps 1 square to e7, directly checking Black King on e8 with no piece in between!
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 0, ready: true });
  s.board[6][4] = null;
  s.board[2][4] = 'wp'; // e6
  s.secretQueens.w.sq = { r: 2, c: 4 };
  s.board[1][4] = null; // e7 empty
  // Black king is on e8 (0, 4)

  const sPushCheck = tryMakeMove(s, { r: 2, c: 4 }, { r: 1, c: 4 });
  assert(sPushCheck, 'e6-e7 must be legal');
  assert.strictEqual(sPushCheck.board[1][4], 'wq', 'Delivering check must permanently reveal Queen!');
  assert.strictEqual(sPushCheck.secretQueens.w.revealed, true);
  assert.strictEqual(sPushCheck.inCheck, true, 'inCheck must be true');
  assert(sPushCheck.moveHistory[0].includes('+') || sPushCheck.moveHistory[0].includes('#'), 'SAN must have check suffix');

  // B) Discovered check:
  // White SQ on e3 (5, 4) unrevealed. White Knight on e5 (3, 4). Black King on e8 (0, 4).
  // Clear e6 (2, 4) and e7 (1, 4).
  const sDisc = createInitialState('secret', { whiteCol: 4, blackCol: 0, ready: true });
  s.board[6][4] = null;
  s.board[5][4] = 'wp'; // e3
  s.secretQueens.w.sq = { r: 5, c: 4 };
  s.board[3][4] = 'wn'; // e5
  s.board[2][4] = null; // e6 empty
  s.board[1][4] = null; // e7 empty

  // White Knight moves e5 -> c6 (3, 4 -> 2, 2)
  s.board[2][2] = null; // c6 empty
  const sAfterDisc = tryMakeMove(s, { r: 3, c: 4 }, { r: 2, c: 2 });
  assert(sAfterDisc, 'Ne5-c6 discovered check move must be legal');
  assert.strictEqual(sAfterDisc.board[5][4], 'wq', 'Discovered check must reveal the hidden Queen!');
  assert.strictEqual(sAfterDisc.secretQueens.w.revealed, true);
  assert.strictEqual(sAfterDisc.inCheck, true, 'Black King must be in check from revealed Queen!');
  assert(sAfterDisc.moveHistory[0].endsWith('+'), 'SAN must end with + for discovered check');
  console.log('4. PASS: Condition 2 delivering check (direct & discovered) permanently reveals Queen!');
}

// 5. Condition 2: Interacting with Line of Sight (Pin Break)
{
  // White SQ on e3 (5, 4) unrevealed. Black King on e8 (0, 4).
  // Black Bishop on e5 (3, 4). Clear e4 (4, 4), e6 (2, 4), e7 (1, 4).
  // Black's turn!
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 0, ready: true });
  s.turn = 'b';
  s.board[6][4] = null;
  s.board[5][4] = 'wp'; // White SQ on e3
  s.secretQueens.w.sq = { r: 5, c: 4 };
  s.board[4][4] = null; // e4 empty
  s.board[3][4] = 'bb'; // Black Bishop on e5
  s.board[2][4] = null; // e6 empty
  s.board[1][4] = null; // e7 empty
  s.board[2][3] = null; // d6 empty

  // Black tries to move Bishop off e-file: Be5 -> d6 (3,4 -> 2,3)
  const pinCheck = checkSecretQueenPinInteraction(s, { r: 3, c: 4 }, { r: 2, c: 3 });
  assert(pinCheck, 'checkSecretQueenPinInteraction must detect pin break!');
  assert.strictEqual(pinCheck.triggered, true);
  assert.strictEqual(pinCheck.secretColor, 'w');

  // tryMakeMove must reject the move because King cannot be left in check!
  const illegalMove = tryMakeMove(s, { r: 3, c: 4 }, { r: 2, c: 3 });
  assert.strictEqual(illegalMove, null, 'Moving pinned piece off pin must be illegal');

  // Trigger reveal
  revealSecretQueen(s, pinCheck.secretColor);
  assert.strictEqual(s.secretQueens.w.revealed, true);
  assert.strictEqual(s.board[5][4], 'wq', 'White piece on e3 must now be revealed as wq');
  console.log('5. PASS: Condition 2 trying to break pin to King reveals opponent hidden Queen and blocks illegal move!');
}

// 6. Condition 2: King Walk into Line of Sight
{
  // White SQ on d2 (6, 3) unrevealed.
  // Black King on e8 (0, 4). Clear d-file: d3..d7 empty. d8 (0, 3) empty.
  // Black attempts Ke8 -> d8 (stepping directly into line of sight of Queen on d2!)
  const s = createInitialState('secret', { whiteCol: 3, blackCol: 0, ready: true });
  s.turn = 'b';
  s.board[6][3] = 'wp'; // White SQ on d2
  s.secretQueens.w.sq = { r: 6, c: 3 };
  s.board[5][3] = null; // d3
  s.board[4][3] = null; // d4
  s.board[3][3] = null; // d5
  s.board[2][3] = null; // d6
  s.board[1][3] = null; // d7
  s.board[0][3] = null; // d8 (Queen d2 attacks d8!)

  // Black King tries e8 -> d8
  const kingWalkCheck = checkSecretQueenPinInteraction(s, { r: 0, c: 4 }, { r: 0, c: 3 });
  assert(kingWalkCheck, 'Stepping King into hidden Queen ray must trigger interaction!');
  assert.strictEqual(kingWalkCheck.triggered, true);
  assert.strictEqual(kingWalkCheck.secretColor, 'w');

  const illegalKingStep = tryMakeMove(s, { r: 0, c: 4 }, { r: 0, c: 3 });
  assert.strictEqual(illegalKingStep, null, 'Stepping into check must be illegal');

  revealSecretQueen(s, kingWalkCheck.secretColor);
  assert.strictEqual(s.board[6][3], 'wq', 'White pawn on d2 must reveal as wq');
  console.log('6. PASS: King stepping into hidden Queen line of sight reveals hidden Queen and rejects illegal move!');
}

// 7. Capturing Opponent Secret Queen
{
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 3, ready: true });
  // White pawn on e4 (4, 4), Black SQ on d5 (3, 3)
  s.board[6][4] = null;
  s.board[4][4] = 'wp';
  s.board[1][3] = null;
  s.board[3][3] = 'bp'; // Black SQ on d5
  s.secretQueens.b.sq = { r: 3, c: 3 };

  // White plays exd5 (4, 4 -> 3, 3)
  const next = tryMakeMove(s, { r: 4, c: 4 }, { r: 3, c: 3 });
  assert(next, 'exd5 capture must be legal');
  assert.strictEqual(next.secretQueens.b.sq, null, 'Captured SQ sq must become null');
  assert.strictEqual(next.secretQueens.b.revealed, true, 'Captured SQ must be marked revealed');
  assert(next.captured.w.includes('q'), 'White captured tray must be credited with Queen q');
  console.log('7. PASS: Capturing opponent Secret Queen credits Queen to captured tray & marks revealed!');
}

// 8. Network Anti-Cheat Masking
{
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 3, ready: true });
  // Serialize for Guest (peerColor 'b')
  const peerPayload = serializeStateForPeer(s, 'b');

  // Guest's own secret queen must be present
  assert.deepStrictEqual(peerPayload.secretQueens.b.sq, { r: 1, c: 3 });
  assert.strictEqual(peerPayload.secretQueens.b.revealed, false);

  // Host's (White) secret queen MUST BE MASKED: sq === null!
  assert.strictEqual(peerPayload.secretQueens.w.sq, null, 'Host secret queen sq must be masked to null for Guest!');
  assert.strictEqual(peerPayload.secretQueens.w.revealed, false);
  assert.strictEqual(peerPayload.board[6][4], 'wp', 'Board must show normal pawn wp');

  // Once revealed, sq is unmasked
  revealSecretQueen(s, 'w');
  const revealedPayload = serializeStateForPeer(s, 'b');
  assert.deepStrictEqual(revealedPayload.secretQueens.w.sq, { r: 6, c: 4 }, 'Revealed SQ must be sent with coordinates');
  assert.strictEqual(revealedPayload.secretQueens.w.revealed, true);
  console.log('8. PASS: Anti-cheat network packet masking strictly masks sq: null until revealed!');
}

// 9. Hydration & Pick Status Validation
{
  const rawPickState = {
    variant: 'secret',
    board: createInitialState('secret').board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    status: 'secret_pick',
    winner: null,
    inCheck: false,
    lastMove: null,
    moveHistory: [],
    captured: { w: [], b: [] },
    pockets: { w: [], b: [] },
    promoted: [],
    secretQueens: {
      w: { sq: { r: 6, c: 4 }, revealed: false, picked: true },
      b: { sq: null, revealed: false, picked: false }
    },
    historyFrames: []
  };

  const hydrated = validateAndHydrateState(rawPickState);
  assert(hydrated, 'validateAndHydrateState must accept status secret_pick');
  assert.strictEqual(hydrated.status, 'secret_pick');
  assert(hydrated.secretQueens, 'hydrated must have secretQueens');
  assert.deepStrictEqual(hydrated.secretQueens.w.sq, { r: 6, c: 4 });
  assert.strictEqual(hydrated.secretQueens.w.picked, true);
  assert.strictEqual(hydrated.secretQueens.b.sq, null);
  assert.strictEqual(hydrated.secretQueens.b.picked, false);
  console.log('9. PASS: validateAndHydrateState cleanly round-trips status secret_pick & secretQueens data!');
}

// 10. Local Secret Queen Privacy: Hides .secret-badge & Queen-only move dots while keeping all Queen moves legal
{
  const s = createInitialState('secret', { whiteCol: 4, blackCol: 3, ready: true });
  // Move White SQ from e2 (6, 4) to e4 (4, 4)
  s.board[6][4] = null;
  s.board[4][4] = 'wp';
  s.secretQueens.w.sq = { r: 4, c: 4 };

  // Actual legal moves for White SQ on e4 include Queen moves (diagonal/sideways/backward) AND pawn push e5 (3, 4)
  const actualMoves = getLegalMovesForSquare(s, 4, 4);
  assert(actualMoves.length > 1, 'Actual legal moves for unrevealed Secret Queen on e4 must include Queen moves');
  assert(actualMoves.some(m => m.to.r === 5 && m.to.c === 4), 'Queen backward move e4->e3 must be legal');
  assert(actualMoves.some(m => m.to.r === 2 && m.to.c === 2), 'Queen diagonal move e4->c6 must be legal');

  // Displayed legal moves in local mode MUST only show standard pawn moves (e4->e5) so Queen identity/moves are not spoiled!
  const displayedMoves = getDisplayedLegalMovesForSquare(s, 4, 4);
  assert.strictEqual(displayedMoves.length, 1, 'Displayed legal moves for unrevealed SQ on e4 in local mode must only show standard pawn push (e5)');
  assert.deepStrictEqual(displayedMoves[0].to, { r: 3, c: 4 });

  // Yet executing a Queen move (e4->c6) still works and permanently reveals the Queen!
  const afterQueenMove = tryMakeMove(s, { r: 4, c: 4 }, { r: 2, c: 2 });
  assert(afterQueenMove, 'Queen move e4->c6 must still execute in local mode');
  assert.strictEqual(afterQueenMove.secretQueens.w.revealed, true);
  assert.strictEqual(afterQueenMove.board[2][2], 'wq');

  // Once revealed, displayed legal moves show all Queen moves!
  afterQueenMove.turn = 'w';
  const displayedAfterReveal = getDisplayedLegalMovesForSquare(afterQueenMove, 2, 2);
  assert(displayedAfterReveal.length > 5, 'Once revealed, displayed legal moves show full Queen rays');
  console.log('10. PASS: Local Secret Queen hides Queen location & Queen-only move dots while keeping all Queen moves active!');
}

console.log('\nALL 10 SECRET QUEEN CHESS ENGINE, RULES, PIN INTERACTION, LOCAL PRIVACY & ANTI-CHEAT TESTS PASSED!');
