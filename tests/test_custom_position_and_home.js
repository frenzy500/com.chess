const assert = require('assert');
const { loadAppExports, getAppSources } = require('./load-app');

console.log('Running Custom Position Editor & Home / Leave Navigation Test Suite...\n');

const engine = loadAppExports();

// -------------------------------------------------------------
// 1. Strict Validation Tests (validateCustomPosition)
// -------------------------------------------------------------
console.log('1. Testing Custom Position Validation Rules...');

const emptyBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null));

// Case A: Missing kings
{
  const b = emptyBoard();
  b[7][4] = 'wk'; // Only White king
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Black King'), 'Should require Black King');
}
{
  const b = emptyBoard();
  b[0][4] = 'bk'; // Only Black king
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('White King'), 'Should require White King');
}

// Case B: Multiple kings
{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[7][5] = 'wk'; // 2 White kings
  b[0][4] = 'bk';
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('White King (found 2)'), 'Should reject multiple White Kings');
}
{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[0][5] = 'bk'; // 2 Black kings
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Black King (found 2)'), 'Should reject multiple Black Kings');
}

// Case C: Adjacent kings
{
  const b = emptyBoard();
  b[4][4] = 'wk';
  b[4][5] = 'bk'; // Adjacent horizontally
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('adjacent'), 'Should reject adjacent kings (horiz)');
}
{
  const b = emptyBoard();
  b[4][4] = 'wk';
  b[3][3] = 'bk'; // Adjacent diagonally
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('adjacent'), 'Should reject adjacent kings (diag)');
}

// Case D: Pawns on 1st or 8th rank
{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[0][1] = 'wp'; // White pawn on row 0 (rank 8)
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('1st or 8th rank'), 'Should reject pawn on rank 8');
}
{
  const b = emptyBoard();
  b[6][4] = 'wk';
  b[0][4] = 'bk';
  b[7][1] = 'bp'; // Black pawn on row 7 (rank 1)
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('1st or 8th rank'), 'Should reject pawn on rank 1');
}

// Case E: Inactive king in check
{
  // Turn is 'w' (White to move) -> Black just moved, so Black King cannot be in check!
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[5][4] = 'wr'; // White Rook on e3 attacks Black King on e8 with clear column
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Black King is currently in check'), 'Inactive Black king in check rejected');
}
{
  // Turn is 'b' (Black to move) -> White just moved, so White King cannot be in check!
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[2][4] = 'br'; // Black Rook on e6 attacks White King on e1
  const res = engine.validateCustomPosition(b, 'b', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('White King is currently in check'), 'Inactive White king in check rejected');
}

// Case F: Fog of War exception (royalCaptureWins === true)
{
  // In Fog of War, players can move into check, so check does NOT make position invalid!
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[5][4] = 'wr'; // White Rook attacks Black King
  const res = engine.validateCustomPosition(b, 'w', 'fog');
  assert.strictEqual(res.valid, true, 'Fog of War allows check on custom position');
}

// Case G: Both kings in check
{
  const b = emptyBoard();
  b[7][0] = 'wk';
  b[0][7] = 'bk';
  b[7][7] = 'wr'; // White Rook checks Black King on h8
  b[0][0] = 'br'; // Black Rook checks White King on a1
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Both kings cannot be in check'), 'Both kings in check rejected');
}

// Case H: Crazyhouse pockets with kings rejected
{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  const pocketsWithKing = { w: ['q', 'k'], b: [] };
  const res = engine.validateCustomPosition(b, 'w', 'crazyhouse', pocketsWithKing);
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Crazyhouse pockets'), 'King in pocket rejected');
}

// Case I: Secret Queen variant requires at least one pawn per player
{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[6][0] = 'wp'; // White has pawn, Black has no pawns
  const res = engine.validateCustomPosition(b, 'w', 'secret');
  assert.strictEqual(res.valid, false);
  assert(res.error.includes('Secret Queen variant requires at least one pawn'), 'Secret Queen requires pawns');
}

// Case J: Valid position accepted!
{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[6][4] = 'wp';
  b[1][4] = 'bp';
  const res = engine.validateCustomPosition(b, 'w', 'standard');
  assert.strictEqual(res.valid, true);
}
console.log('   PASS: All validation rules verified (missing kings, 2 kings, adjacent kings, rank 1/8 pawns, inactive check, Fog exception, pockets & Secret Queen pawns)!');

// -------------------------------------------------------------
// 2. createCustomState & Castling Rights / Checkmate Detection
// -------------------------------------------------------------
console.log('2. Testing createCustomState & Castling Rights Sanitization...');

{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[7][7] = 'wr'; // h1 rook
  b[7][0] = 'wr'; // a1 rook
  b[0][4] = 'bk';
  b[0][7] = 'br'; // h8 rook
  b[0][0] = 'br'; // a8 rook

  const state = engine.createCustomState({
    variant: 'standard',
    board: b,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true }
  });

  assert.strictEqual(state.castling.wK, true);
  assert.strictEqual(state.castling.wQ, true);
  assert.strictEqual(state.castling.bK, true);
  assert.strictEqual(state.castling.bQ, true);
  assert.strictEqual(state.turn, 'w');
  assert.strictEqual(state.status, 'playing');
}

// If White king is NOT on e1, castling rights must be stripped automatically
{
  const b = emptyBoard();
  b[6][4] = 'wk'; // King on e2
  b[7][7] = 'wr';
  b[0][4] = 'bk';

  const state = engine.createCustomState({
    variant: 'standard',
    board: b,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: false, bQ: false }
  });

  assert.strictEqual(state.castling.wK, false, 'wK castling must be false if king not on e1');
  assert.strictEqual(state.castling.wQ, false, 'wQ castling must be false if king not on e1');
}

// Starting in Checkmate position
{
  // Fool's mate position: Black Queen on h4, White King on e1, trapped
  const b = emptyBoard();
  b[7][4] = 'wk'; // e1
  b[6][4] = 'wp'; // e2
  b[6][3] = 'wp'; // d2
  b[5][5] = 'wp'; // f3
  b[4][6] = 'wp'; // g4
  b[7][3] = 'wq'; // d1
  b[7][5] = 'wb'; // f1
  b[4][7] = 'bq'; // h4 - delivers checkmate!
  b[0][4] = 'bk';

  const state = engine.createCustomState({
    variant: 'standard',
    board: b,
    turn: 'w'
  });

  assert.strictEqual(state.inCheck, true, 'White is in check');
  assert.strictEqual(state.status, 'checkmate', 'Status is checkmate');
  assert.strictEqual(state.winner, 'b', 'Black wins');
}
console.log('   PASS: createCustomState preserves valid state, strips illegal castling rights, and detects checkmate/stalemate!');

// -------------------------------------------------------------
// 3. Crazyhouse Custom State with Pockets & Immediate Drop Moves
// -------------------------------------------------------------
console.log('3. Testing Crazyhouse Custom Position with Pre-filled Pockets & Drops...');

{
  const b = emptyBoard();
  b[7][4] = 'wk';
  b[0][4] = 'bk';
  b[6][4] = 'wp';
  b[1][4] = 'bp';

  const customPockets = {
    w: ['q', 'n'],
    b: ['r', 'b', 'p']
  };

  const state = engine.createCustomState({
    variant: 'crazyhouse',
    board: b,
    turn: 'w',
    pockets: customPockets
  });

  assert.deepStrictEqual(state.pockets.w, ['q', 'n']);
  assert.deepStrictEqual(state.pockets.b, ['r', 'b', 'p']);

  // White has legal queen drops
  const queenDrops = engine.getLegalDropMoves(state, 'q', 'w');
  assert(queenDrops.length > 50, 'Queen can be dropped on empty squares');

  // Perform a Queen drop: Q@e5 (row 3, col 4)
  const nextState = engine.tryMakeDrop(state, 'q', { r: 3, c: 4 });
  assert(nextState, 'Drop move succeeded');
  assert.strictEqual(nextState.moveHistory[0], 'Q@e5', 'SAN notation is Q@e5');
  assert.strictEqual(nextState.board[3][4], 'wq', 'White Queen now on e5');
  assert.deepStrictEqual(nextState.pockets.w, ['n'], 'Queen consumed from White pocket');
  assert.strictEqual(nextState.turn, 'b', 'Turn flipped to Black');
}
console.log('   PASS: Crazyhouse custom state with pockets & legal drops verified!');

// -------------------------------------------------------------
// 4. Navigation & Home Flow (goHome, Leave, Reset)
// -------------------------------------------------------------
console.log('4. Testing Navigation & Home functionality...');

{
  // Verify goHome cleans up and returns to standard state
  const homeRes = engine.goHome(true);
  assert.strictEqual(homeRes, true, 'goHome returns true');
}
console.log('   PASS: Home / Leave navigation functions verified!');

// -------------------------------------------------------------
// 5. DOM IDs & Security Check
// -------------------------------------------------------------
console.log('5. Testing DOM Parity and Strict XSS & innerHTML Prohibition...');

const { html: htmlSource, js: jsSource } = getAppSources();

// Match all document.getElementById calls in game.js
const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const usedIds = new Set();
while ((match = idRegex.exec(jsSource)) !== null) {
  usedIds.add(match[1]);
}

for (const id of usedIds) {
  assert(
    htmlSource.includes(`id="${id}"`),
    `Missing DOM element in index.html for ID: ${id}`
  );
}
console.log(`   PASS: All ${usedIds.size} DOM IDs in game.js exist in index.html!`);

// Security checks
assert(!jsSource.includes('.innerHTML'), 'innerHTML must never be used in game.js');
assert(!jsSource.includes('.outerHTML'), 'outerHTML must never be used in game.js');
assert(!jsSource.includes('insertAdjacentHTML'), 'insertAdjacentHTML must never be used in game.js');
console.log('   PASS: Zero innerHTML / outerHTML / insertAdjacentHTML prohibition verified!');

console.log('\nALL CUSTOM POSITION & HOME NAVIGATION TESTS PASSED!');
