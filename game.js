/* ============================================================================
 * CHESS — Multiplayer Chess + Clocks + Premoves + Replay + Tactical Arrows
 *
 * File Organization:
 *   SECTION 1: PIECE DEFINITIONS & MOVEMENT RULES  <-- Edit here for Variants!
 *   SECTION 2: CHESS ENGINE (Pure Rules, History Snapshots & Variant Premoves)
 *   SECTION 3: SOUND ENGINE (Chess.com-style Wooden Audio via Web Audio API)
 *   SECTION 4: MULTIPLAYER NETWORKING & AUTHORITATIVE CLOCKS (PeerJS WebRTC)
 *   SECTION 5: USER INTERFACE (Board, Animations, Premoves, Arrows, Replay, PGN)
 *   SECTION 6: VECTOR PIECE ARTWORK (Crisp Staunton SVGs + Custom Piece Fallback)
 * ============================================================================ */

'use strict';

/* ============================================================================
 * SECTION 1: PIECE DEFINITIONS & MOVEMENT RULES (Edit here for Custom Variants!)
 * ============================================================================
 * HOW TO CREATE CUSTOM PIECES OR VARIANTS IN VERSION 2+:
 *
 * 1. Add a new piece key (for example, 'a' for Archbishop) to PIECE_DEFS below:
 *    - name:         Human-readable name ('Archbishop')
 *    - symbol:       Letter shown in move history ('A'; Pawns use '')
 *    - value:        Material point value (used for the +material counter)
 *    - isRoyal:      If true, this piece cannot be left in check (like the King)
 *    - canPromoteTo: If true, promoting pawns can turn into this piece
 *    - leapOffsets:  Single-jump [rowDelta, colDelta] offsets (like Knight/King)
 *    - slideDirs:    Repeating ray [rowDelta, colDelta] directions (like Rook/Bishop)
 *    - customMoves:  Optional function(state, r, c, color, helpers) for special
 *                    rules or abilities (like Pawn double-step, En Passant, Castling)
 *    - afterMove:    Optional function(nextState, move) hook to trigger custom
 *                    board effects right after a piece moves!
 *
 * 2. Place your new piece on INITIAL_BOARD below using 'w' + key or 'b' + key.
 *    NOTE: Premoves and < / > Move History Replay automatically work with ANY
 *    custom piece or board ability you add here—zero extra code required!
 * ============================================================================ */

const BOARD_SIZE = 8;

const PIECE_DEFS = {
  // --- PAWN ---
  p: {
    name: 'Pawn',
    symbol: '',
    value: 1,
    isRoyal: false,
    canPromoteTo: false,
    leapOffsets: [],
    slideDirs: [],
    customMoves(state, r, c, color, helpers) {
      const moves = [];
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;

      if (helpers.attacksOnly) {
        for (const dc of [-1, 1]) {
          if (helpers.inBounds(r + dir, c + dc)) {
            moves.push({ from: { r, c }, to: { r: r + dir, c: c + dc } });
          }
        }
        return moves;
      }

      const addPawnMove = (tr, tc, extra = {}) => {
        if (tr === promoRow) {
          for (const promoType of helpers.getPromotionTypes()) {
            moves.push({ from: { r, c }, to: { r: tr, c: tc }, promotion: promoType, ...extra });
          }
        } else {
          moves.push({ from: { r, c }, to: { r: tr, c: tc }, promotion: null, ...extra });
        }
      };

      const oneAhead = r + dir;
      if (helpers.inBounds(oneAhead, c) && helpers.isEmpty(oneAhead, c)) {
        addPawnMove(oneAhead, c);

        const twoAhead = r + dir * 2;
        if (r === startRow && helpers.inBounds(twoAhead, c) && helpers.isEmpty(twoAhead, c)) {
          moves.push({
            from: { r, c },
            to: { r: twoAhead, c },
            promotion: null,
            enPassantTarget: { r: oneAhead, c }
          });
        }
      }

      for (const dc of [-1, 1]) {
        const tr = r + dir;
        const tc = c + dc;
        if (!helpers.inBounds(tr, tc)) continue;

        if (helpers.isEnemy(tr, tc, color)) {
          addPawnMove(tr, tc, { captureSq: { r: tr, c: tc } });
        } else if (
          state.enPassant &&
          state.enPassant.r === tr &&
          state.enPassant.c === tc &&
          helpers.isEnemy(r, tc, color)
        ) {
          moves.push({
            from: { r, c },
            to: { r: tr, c: tc },
            promotion: null,
            captureSq: { r, c: tc },
            isEnPassant: true
          });
        }
      }

      return moves;
    }
  },

  // --- KNIGHT ---
  n: {
    name: 'Knight',
    symbol: 'N',
    value: 3,
    isRoyal: false,
    canPromoteTo: true,
    leapOffsets: [
      [-2, -1], [-2, 1],
      [-1, -2], [-1, 2],
      [1, -2],  [1, 2],
      [2, -1],  [2, 1]
    ],
    slideDirs: []
  },

  // --- BISHOP ---
  b: {
    name: 'Bishop',
    symbol: 'B',
    value: 3,
    isRoyal: false,
    canPromoteTo: true,
    leapOffsets: [],
    slideDirs: [
      [-1, -1], [-1, 1],
      [1, -1],  [1, 1]
    ]
  },

  // --- ROOK ---
  r: {
    name: 'Rook',
    symbol: 'R',
    value: 5,
    isRoyal: false,
    canPromoteTo: true,
    leapOffsets: [],
    slideDirs: [
      [-1, 0], [1, 0],
      [0, -1], [0, 1]
    ]
  },

  // --- QUEEN ---
  q: {
    name: 'Queen',
    symbol: 'Q',
    value: 9,
    isRoyal: false,
    canPromoteTo: true,
    leapOffsets: [],
    slideDirs: [
      [-1, 0],  [1, 0],  [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ]
  },

  // --- KING ---
  k: {
    name: 'King',
    symbol: 'K',
    value: 0,
    isRoyal: true,
    canPromoteTo: false,
    leapOffsets: [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ],
    slideDirs: [],
    customMoves(state, r, c, color, helpers) {
      if (helpers.attacksOnly) return [];

      const moves = [];
      const homeRow = color === 'w' ? 7 : 0;
      const enemy = color === 'w' ? 'b' : 'w';

      if (r !== homeRow || c !== 4) return moves;
      if (helpers.isInCheck(state, color)) return moves;

      const rights = state.castling;
      const canKingside = color === 'w' ? rights.wK : rights.bK;
      const canQueenside = color === 'w' ? rights.wQ : rights.bQ;

      if (
        canKingside &&
        helpers.pieceAt(homeRow, 7) === color + 'r' &&
        helpers.isEmpty(homeRow, 5) &&
        helpers.isEmpty(homeRow, 6) &&
        !helpers.isSquareAttacked(state, homeRow, 5, enemy) &&
        !helpers.isSquareAttacked(state, homeRow, 6, enemy)
      ) {
        moves.push({
          from: { r, c },
          to: { r: homeRow, c: 6 },
          castleSide: 'K',
          rookMove: { from: { r: homeRow, c: 7 }, to: { r: homeRow, c: 5 } }
        });
      }

      if (
        canQueenside &&
        helpers.pieceAt(homeRow, 0) === color + 'r' &&
        helpers.isEmpty(homeRow, 1) &&
        helpers.isEmpty(homeRow, 2) &&
        helpers.isEmpty(homeRow, 3) &&
        !helpers.isSquareAttacked(state, homeRow, 3, enemy) &&
        !helpers.isSquareAttacked(state, homeRow, 2, enemy)
      ) {
        moves.push({
          from: { r, c },
          to: { r: homeRow, c: 2 },
          castleSide: 'Q',
          rookMove: { from: { r: homeRow, c: 0 }, to: { r: homeRow, c: 3 } }
        });
      }

      return moves;
    }
  }
};

const PROMOTION_ORDER = ['q', 'r', 'b', 'n'];

const INITIAL_BOARD = [
  ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
  ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
  ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']
];

/* ============================================================================
 * SECTION 2: CHESS ENGINE (Pure Rules, History Snapshots & Variant Premoves)
 * ============================================================================ */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function getPieceColor(code) {
  return code ? code[0] : null;
}

function getPieceType(code) {
  return code ? code.slice(1) : null;
}

function getPromotionTypes() {
  const ordered = PROMOTION_ORDER.filter((k) => PIECE_DEFS[k] && PIECE_DEFS[k].canPromoteTo);
  for (const key of Object.keys(PIECE_DEFS)) {
    if (PIECE_DEFS[key].canPromoteTo && !ordered.includes(key)) {
      ordered.push(key);
    }
  }
  return ordered;
}

function coordToAlgebraic(r, c) {
  return FILES[c] + String(BOARD_SIZE - r);
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

// Immutable frame snapshot so < / > move replay works with ANY future variant rules
function makeHistoryFrame(state, meta = null) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    inCheck: Boolean(state.inCheck),
    lastMove: state.lastMove
      ? { from: { ...state.lastMove.from }, to: { ...state.lastMove.to } }
      : null,
    captured: { w: state.captured.w.slice(), b: state.captured.b.slice() },
    meta: meta ? { ...meta } : null
  };
}

function createInitialState() {
  const state = {
    board: cloneBoard(INITIAL_BOARD),
    turn: 'w',
    castling: {
      wK: INITIAL_BOARD[7][4] === 'wk' && INITIAL_BOARD[7][7] === 'wr',
      wQ: INITIAL_BOARD[7][4] === 'wk' && INITIAL_BOARD[7][0] === 'wr',
      bK: INITIAL_BOARD[0][4] === 'bk' && INITIAL_BOARD[0][7] === 'br',
      bQ: INITIAL_BOARD[0][4] === 'bk' && INITIAL_BOARD[0][0] === 'br'
    },
    enPassant: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    status: 'playing', // 'playing' | 'checkmate' | 'stalemate' | 'draw_50' | 'draw_repetition' | 'draw_material' | 'draw_agreement' | 'resigned' | 'timeout'
    winner: null,
    inCheck: false,
    lastMove: null,
    moveHistory: [],
    captured: { w: [], b: [] },
    positionCounts: {},
    historyFrames: []
  };
  const key = computePositionKey(state);
  state.positionCounts[key] = 1;
  state.historyFrames.push(makeHistoryFrame(state, null));
  return state;
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    status: state.status,
    winner: state.winner,
    inCheck: state.inCheck,
    lastMove: state.lastMove
      ? { from: { ...state.lastMove.from }, to: { ...state.lastMove.to } }
      : null,
    moveHistory: state.moveHistory.slice(),
    captured: { w: state.captured.w.slice(), b: state.captured.b.slice() },
    positionCounts: { ...state.positionCounts },
    historyFrames: (state.historyFrames || []).map((f) => ({
      board: cloneBoard(f.board),
      turn: f.turn,
      inCheck: f.inCheck,
      lastMove: f.lastMove ? { from: { ...f.lastMove.from }, to: { ...f.lastMove.to } } : null,
      captured: { w: f.captured.w.slice(), b: f.captured.b.slice() },
      meta: f.meta ? { ...f.meta } : null
    }))
  };
}

function computePositionKey(state) {
  const rows = state.board.map((row) => row.map((cell) => cell || '.').join(',')).join('/');
  const cr =
    (state.castling.wK ? 'K' : '') +
    (state.castling.wQ ? 'Q' : '') +
    (state.castling.bK ? 'k' : '') +
    (state.castling.bQ ? 'q' : '') || '-';

  let ep = '-';
  if (state.enPassant) {
    const pawnRow = state.turn === 'w' ? state.enPassant.r + 1 : state.enPassant.r - 1;
    const epCol = state.enPassant.c;
    const moverPawn = state.turn + 'p';
    if (
      (inBounds(pawnRow, epCol - 1) && state.board[pawnRow][epCol - 1] === moverPawn) ||
      (inBounds(pawnRow, epCol + 1) && state.board[pawnRow][epCol + 1] === moverPawn)
    ) {
      ep = `${state.enPassant.r},${state.enPassant.c}`;
    }
  }
  return `${rows} ${state.turn} ${cr} ${ep}`;
}

function generatePseudoMoves(state, r, c, attacksOnly = false) {
  const code = state.board[r][c];
  if (!code) return [];

  const color = getPieceColor(code);
  const type = getPieceType(code);
  const def = PIECE_DEFS[type];
  if (!def) return [];

  const moves = [];

  if (def.leapOffsets) {
    for (const [dr, dc] of def.leapOffsets) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const occupant = state.board[tr][tc];
      if (!occupant) {
        moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: null, promotion: null });
      } else if (getPieceColor(occupant) !== color) {
        moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: { r: tr, c: tc }, promotion: null });
      }
    }
  }

  if (def.slideDirs) {
    for (const [dr, dc] of def.slideDirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const occupant = state.board[tr][tc];
        if (!occupant) {
          moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: null, promotion: null });
        } else {
          if (getPieceColor(occupant) !== color) {
            moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: { r: tr, c: tc }, promotion: null });
          }
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
  }

  if (typeof def.customMoves === 'function') {
    const helpers = {
      attacksOnly,
      inBounds,
      pieceAt: (rr, cc) => (inBounds(rr, cc) ? state.board[rr][cc] : null),
      colorAt: (rr, cc) => (inBounds(rr, cc) ? getPieceColor(state.board[rr][cc]) : null),
      isEmpty: (rr, cc) => inBounds(rr, cc) && state.board[rr][cc] === null,
      isEnemy: (rr, cc, col) => {
        if (!inBounds(rr, cc) || !state.board[rr][cc]) return false;
        return getPieceColor(state.board[rr][cc]) !== col;
      },
      getPromotionTypes,
      isInCheck,
      isSquareAttacked
    };

    const extra = def.customMoves(state, r, c, color, helpers);
    if (Array.isArray(extra)) {
      for (const m of extra) {
        moves.push({
          from: m.from || { r, c },
          to: m.to,
          captureSq: m.captureSq || null,
          promotion: m.promotion || null,
          castleSide: m.castleSide || null,
          rookMove: m.rookMove || null,
          enPassantTarget: m.enPassantTarget || null,
          isEnPassant: Boolean(m.isEnPassant)
        });
      }
    }
  }

  return moves;
}

// Variant-safe Premove target finder: works automatically with ANY piece in PIECE_DEFS!
// Allows premoving along currently-blocked rays, recapturing onto friendly squares,
// pawn diagonal pre-captures, and castling, then validates strictly when your turn arrives.
function getPremoveTargetsForSquare(state, r, c, color) {
  const code = state.board[r][c];
  if (!code || getPieceColor(code) !== color) return [];

  const seen = new Set();
  const targets = [];
  const addTarget = (tr, tc) => {
    if (!inBounds(tr, tc) || (tr === r && tc === c)) return;
    const key = `${tr},${tc}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({ r: tr, c: tc });
    }
  };

  // 1. Current board pseudo-moves + attack-threat squares (covers Pawn diagonal pre-captures)
  const myTurnState = { ...state, turn: color };
  for (const m of generatePseudoMoves(myTurnState, r, c, false)) addTarget(m.to.r, m.to.c);
  for (const m of generatePseudoMoves(myTurnState, r, c, true)) addTarget(m.to.r, m.to.c);

  // 2. Unblocked board probe (allows sliding through pieces that might move & recapturing on friendly squares)
  const soloBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  soloBoard[r][c] = code;
  const homeRow = color === 'w' ? 7 : 0;
  if (state.board[homeRow][0] === color + 'r' && !(r === homeRow && c === 0)) soloBoard[homeRow][0] = color + 'r';
  if (state.board[homeRow][7] === color + 'r' && !(r === homeRow && c === 7)) soloBoard[homeRow][7] = color + 'r';

  const soloState = {
    board: soloBoard,
    turn: color,
    castling: state.castling,
    enPassant: null
  };
  for (const m of generatePseudoMoves(soloState, r, c, false)) addTarget(m.to.r, m.to.c);
  for (const m of generatePseudoMoves(soloState, r, c, true)) addTarget(m.to.r, m.to.c);

  return targets;
}

function isSquareAttacked(state, targetR, targetC, byColor) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const code = state.board[r][c];
      if (!code || getPieceColor(code) !== byColor) continue;
      const attacks = generatePseudoMoves(state, r, c, true);
      for (const m of attacks) {
        if (m.to.r === targetR && m.to.c === targetC) return true;
      }
    }
  }
  return false;
}

function isInCheck(state, color) {
  const enemy = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const code = state.board[r][c];
      if (!code || getPieceColor(code) !== color) continue;
      const def = PIECE_DEFS[getPieceType(code)];
      if (def && def.isRoyal) {
        if (isSquareAttacked(state, r, c, enemy)) return true;
      }
    }
  }
  return false;
}

function executeMoveOnBoard(state, move) {
  const nextBoard = cloneBoard(state.board);
  const movingPiece = nextBoard[move.from.r][move.from.c];
  const moverColor = getPieceColor(movingPiece);
  const moverType = getPieceType(movingPiece);

  nextBoard[move.from.r][move.from.c] = null;

  if (move.captureSq) {
    nextBoard[move.captureSq.r][move.captureSq.c] = null;
  }

  if (move.rookMove) {
    const rook = nextBoard[move.rookMove.from.r][move.rookMove.from.c];
    nextBoard[move.rookMove.from.r][move.rookMove.from.c] = null;
    nextBoard[move.rookMove.to.r][move.rookMove.to.c] = rook;
  }

  const finalType = move.promotion || moverType;
  nextBoard[move.to.r][move.to.c] = moverColor + finalType;

  return nextBoard;
}

function getLegalMovesForSquare(state, r, c) {
  if (state.status !== 'playing') return [];
  const code = state.board[r][c];
  if (!code || getPieceColor(code) !== state.turn) return [];

  const color = state.turn;
  const pseudo = generatePseudoMoves(state, r, c, false);
  const legal = [];

  for (const move of pseudo) {
    const nextBoard = executeMoveOnBoard(state, move);
    const probeState = { board: nextBoard, castling: state.castling, enPassant: null };

    const def = PIECE_DEFS[getPieceType(code)];
    if (def && typeof def.afterMove === 'function') {
      def.afterMove(probeState, move);
    }

    if (!isInCheck(probeState, color)) {
      legal.push(move);
    }
  }

  return legal;
}

function getAllLegalMoves(state, color = state.turn) {
  const savedTurn = state.turn;
  const savedStatus = state.status;
  const tempState =
    savedTurn === color && savedStatus === 'playing'
      ? state
      : { ...state, turn: color, status: 'playing' };

  const all = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getPieceColor(tempState.board[r][c]) === color) {
        all.push(...getLegalMovesForSquare(tempState, r, c));
      }
    }
  }
  return all;
}

function hasInsufficientMaterial(board) {
  const pieces = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const code = board[r][c];
      if (!code) continue;
      const type = getPieceType(code);
      if (PIECE_DEFS[type] && PIECE_DEFS[type].isRoyal) continue;
      pieces.push({ color: getPieceColor(code), type, squareColor: (r + c) % 2 });
    }
  }

  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return true;
  if (
    pieces.length === 2 &&
    pieces[0].type === 'b' &&
    pieces[1].type === 'b' &&
    pieces[0].color !== pieces[1].color &&
    pieces[0].squareColor === pieces[1].squareColor
  ) {
    return true;
  }

  return false;
}

function formatMoveSAN(prevState, move, nextState) {
  if (move.castleSide === 'K') {
    const suffix = nextState.status === 'checkmate' ? '#' : nextState.inCheck ? '+' : '';
    return 'O-O' + suffix;
  }
  if (move.castleSide === 'Q') {
    const suffix = nextState.status === 'checkmate' ? '#' : nextState.inCheck ? '+' : '';
    return 'O-O-O' + suffix;
  }

  const movingCode = prevState.board[move.from.r][move.from.c];
  const type = getPieceType(movingCode);
  const def = PIECE_DEFS[type];
  const isCapture = Boolean(move.captureSq);
  const dest = coordToAlgebraic(move.to.r, move.to.c);

  let san = '';

  if (type === 'p') {
    if (isCapture) san += FILES[move.from.c] + 'x';
    san += dest;
    if (move.promotion) {
      const promoSym = PIECE_DEFS[move.promotion]?.symbol || move.promotion.toUpperCase();
      san += '=' + promoSym;
    }
  } else {
    const symbol = def.symbol || type.toUpperCase();
    san += symbol;

    const peers = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r !== move.from.r || c !== move.from.c) && prevState.board[r][c] === movingCode) {
          const peerMoves = getLegalMovesForSquare(prevState, r, c);
          if (peerMoves.some((pm) => pm.to.r === move.to.r && pm.to.c === move.to.c)) {
            peers.push({ r, c });
          }
        }
      }
    }

    if (peers.length > 0) {
      const sameFile = peers.some((p) => p.c === move.from.c);
      const sameRank = peers.some((p) => p.r === move.from.r);
      if (!sameFile) {
        san += FILES[move.from.c];
      } else if (!sameRank) {
        san += String(BOARD_SIZE - move.from.r);
      } else {
        san += coordToAlgebraic(move.from.r, move.from.c);
      }
    }

    if (isCapture) san += 'x';
    san += dest;
  }

  if (nextState.status === 'checkmate') {
    san += '#';
  } else if (nextState.inCheck) {
    san += '+';
  }

  return san;
}

function applyMove(state, move) {
  const next = cloneState(state);
  const movingCode = state.board[move.from.r][move.from.c];
  const moverColor = getPieceColor(movingCode);
  const moverType = getPieceType(movingCode);
  const enemyColor = moverColor === 'w' ? 'b' : 'w';

  let capturedType = null;
  if (move.captureSq) {
    const capCode = next.board[move.captureSq.r][move.captureSq.c];
    if (capCode) {
      capturedType = getPieceType(capCode);
      next.captured[moverColor].push(capturedType);
    }
    next.board[move.captureSq.r][move.captureSq.c] = null;
  }

  next.board[move.from.r][move.from.c] = null;
  if (move.rookMove) {
    const rookCode = next.board[move.rookMove.from.r][move.rookMove.from.c];
    next.board[move.rookMove.from.r][move.rookMove.from.c] = null;
    next.board[move.rookMove.to.r][move.rookMove.to.c] = rookCode;
  }

  const finalType = move.promotion || moverType;
  next.board[move.to.r][move.to.c] = moverColor + finalType;

  const def = PIECE_DEFS[moverType];
  if (def && typeof def.afterMove === 'function') {
    def.afterMove(next, move);
  }

  if (moverColor === 'w' && moverType === 'k') {
    next.castling.wK = false;
    next.castling.wQ = false;
  }
  if (moverColor === 'b' && moverType === 'k') {
    next.castling.bK = false;
    next.castling.bQ = false;
  }
  const touches = (r, c) =>
    (move.from.r === r && move.from.c === c) ||
    (move.to.r === r && move.to.c === c) ||
    Boolean(move.captureSq && move.captureSq.r === r && move.captureSq.c === c);

  if (touches(7, 7)) next.castling.wK = false;
  if (touches(7, 0)) next.castling.wQ = false;
  if (touches(0, 7)) next.castling.bK = false;
  if (touches(0, 0)) next.castling.bQ = false;

  next.enPassant = move.enPassantTarget ? { ...move.enPassantTarget } : null;

  if (moverType === 'p' || capturedType !== null) {
    next.halfMoveClock = 0;
  } else {
    next.halfMoveClock += 1;
  }
  if (moverColor === 'b') {
    next.fullMoveNumber += 1;
  }

  next.turn = enemyColor;
  next.lastMove = { from: { ...move.from }, to: { ...move.to } };

  const posKey = computePositionKey(next);
  next.positionCounts[posKey] = (next.positionCounts[posKey] || 0) + 1;

  next.inCheck = isInCheck(next, enemyColor);
  const opponentMoves = getAllLegalMoves(next, enemyColor);

  if (opponentMoves.length === 0) {
    if (next.inCheck) {
      next.status = 'checkmate';
      next.winner = moverColor;
    } else {
      next.status = 'stalemate';
      next.winner = null;
    }
  } else if (next.positionCounts[posKey] >= 3) {
    next.status = 'draw_repetition';
  } else if (next.halfMoveClock >= 100) {
    next.status = 'draw_50';
  } else if (hasInsufficientMaterial(next.board)) {
    next.status = 'draw_material';
  }

  const san = formatMoveSAN(state, move, next);
  next.moveHistory.push(san);

  next.historyFrames.push(
    makeHistoryFrame(next, {
      moverColor,
      isCapture: capturedType !== null,
      castleSide: move.castleSide || null,
      rookMove: move.rookMove
        ? { from: { ...move.rookMove.from }, to: { ...move.rookMove.to } }
        : null,
      promotion: move.promotion || null
    })
  );

  return next;
}

function tryMakeMove(state, from, to, promotion = null) {
  if (!from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) {
    return null;
  }
  const legalMoves = getLegalMovesForSquare(state, from.r, from.c);
  const matching = legalMoves.filter((m) => m.to.r === to.r && m.to.c === to.c);
  if (matching.length === 0) return null;

  let chosen = null;
  if (matching[0].promotion !== null) {
    const validPromos = getPromotionTypes();
    const wantedPromo = promotion && validPromos.includes(promotion) ? promotion : null;
    if (!wantedPromo) return null;
    chosen = matching.find((m) => m.promotion === wantedPromo) || null;
  } else {
    chosen = matching[0];
  }

  return chosen ? applyMove(state, chosen) : null;
}

/* ============================================================================
 * SECTION 3: SOUND ENGINE (Chess.com-style Wooden Audio via Web Audio API)
 * ============================================================================ */

let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
  if (!soundEnabled || typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Synthesizes a realistic damped wooden chess-piece tap (filtered impulse + wood body)
function playWoodTap(ctx, startTime, bodyFreq, clickFreq, gainLevel = 0.28, duration = 0.065) {
  // 1. Short filtered noise click (wood contact transient)
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * 0.028));
  const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.22));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(clickFreq, startTime);
  filter.Q.setValueAtTime(2.4, startTime);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(gainLevel * 0.9, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.028);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(startTime);

  // 2. Resonant low-mid wood body thump
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(bodyFreq * 1.35, startTime);
  osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.68, startTime + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(gainLevel, startTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function playToneNote(ctx, startTime, freq, gainLevel = 0.12, duration = 0.16, type = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function playSound(kind) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t = ctx.currentTime;
  switch (kind) {
    case 'moveSelf':
      playWoodTap(ctx, t, 155, 680, 0.3, 0.062);
      break;
    case 'moveOpponent':
      playWoodTap(ctx, t, 182, 820, 0.28, 0.058);
      break;
    case 'capture':
      playWoodTap(ctx, t, 122, 1150, 0.38, 0.082);
      playWoodTap(ctx, t + 0.012, 210, 1650, 0.22, 0.045);
      break;
    case 'castle':
      playWoodTap(ctx, t, 155, 680, 0.28, 0.058);
      playWoodTap(ctx, t + 0.075, 178, 790, 0.25, 0.055);
      break;
    case 'promote':
      playWoodTap(ctx, t, 160, 760, 0.28, 0.06);
      playToneNote(ctx, t + 0.02, 523.25, 0.11, 0.14, 'triangle');
      playToneNote(ctx, t + 0.09, 659.25, 0.12, 0.18, 'triangle');
      break;
    case 'check':
      playWoodTap(ctx, t, 150, 950, 0.32, 0.065);
      playToneNote(ctx, t + 0.005, 880, 0.13, 0.13, 'triangle');
      break;
    case 'premove':
      playWoodTap(ctx, t, 240, 1200, 0.14, 0.032);
      break;
    case 'gameStart':
      playWoodTap(ctx, t, 175, 760, 0.2, 0.05);
      playToneNote(ctx, t, 392.0, 0.1, 0.14, 'triangle');
      playToneNote(ctx, t + 0.085, 523.25, 0.12, 0.2, 'triangle');
      break;
    case 'gameEnd':
      playWoodTap(ctx, t, 135, 620, 0.28, 0.07);
      playToneNote(ctx, t + 0.01, 440, 0.1, 0.26, 'triangle');
      playToneNote(ctx, t + 0.07, 554.37, 0.1, 0.28, 'triangle');
      playToneNote(ctx, t + 0.13, 659.25, 0.11, 0.34, 'triangle');
      break;
    case 'lowTime':
      playToneNote(ctx, t, 784, 0.11, 0.07, 'sine');
      playToneNote(ctx, t + 0.09, 784, 0.11, 0.07, 'sine');
      break;
    default:
      break;
  }
}

function playMoveFeedbackSound(prevState, nextState, isMyMove) {
  if (nextState.status !== 'playing') {
    playSound('gameEnd');
    return;
  }
  const lastFrame = nextState.historyFrames[nextState.historyFrames.length - 1];
  const meta = lastFrame?.meta;
  if (nextState.inCheck) {
    playSound('check');
  } else if (meta?.promotion) {
    playSound('promote');
  } else if (meta?.castleSide) {
    playSound('castle');
  } else if (meta?.isCapture) {
    playSound('capture');
  } else {
    playSound(isMyMove ? 'moveSelf' : 'moveOpponent');
  }
}

/* ============================================================================
 * SECTION 4: MULTIPLAYER NETWORKING & AUTHORITATIVE CLOCKS (PeerJS WebRTC)
 * ============================================================================ */

const PEER_ID_PREFIX = 'chessgame-v2-room-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function getNowPerf() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function sanitizePlayerName(raw) {
  if (typeof raw !== 'string') return 'Guest';
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 18);
  return cleaned || 'Guest';
}

// Fun Elo rule: everyone shows 0 Elo unless their name contains "67" anywhere -> -67 Elo!
function computeDisplayElo(name) {
  return String(name || '').includes('67') ? -67 : 0;
}

const setupConfig = {
  timed: true,
  minutes: 10,       // 1..60 minutes
  incrementSec: 5,   // 0..60 seconds gained per turn
  sidePref: 'w'      // 'w' | 'random' | 'b'
};

const clockState = {
  timed: false,
  minutes: 10,
  incrementSec: 5,
  whiteMs: 600000,
  blackMs: 600000,
  running: false,
  lastSyncPerf: 0,
  lowTimeWarned: false,
  intervalId: null
};

const net = {
  mode: 'local',          // 'local' | 'setup' | 'waiting' | 'joining' | 'online'
  role: null,             // 'host' | 'guest' | null
  roomCode: null,
  myColor: 'w',
  myName: 'Guest',
  peerName: 'Opponent',
  roomLocked: false,
  peer: null,
  conn: null,
  joinTimer: null,
  myRematchWanted: false,
  peerRematchWanted: false,
  drawOfferedBy: null,    // 'w' | 'b' | null
  pendingOptimisticPly: null,
  msgTimestamps: []
};

// Shared Match & UI Session State
let gameState = createInitialState();
let viewPly = 0;               // Current move index viewed on board (0..moveHistory.length)
let boardFlipped = false;
let selectedSq = null;
let selectedLegalMoves = [];
let premoveOriginSq = null;    // Selected origin square while choosing a premove
let premoveTargets = [];       // Candidate target squares for premoveOriginSq
let premoveQueue = [];         // Array of { from: {r, c}, to: {r, c}, promotion: string | null }
let pendingPromotion = null;   // { from, to, color, viaDrag, isPremove }
let pendingSlideAnim = null;   // { moves: [{ from, to }] }
let drawnArrows = [];          // Array of { from: {r, c}, to: {r, c} }
let markedSquares = [];        // Array of { r, c } right-click square highlights
let previewArrow = null;       // Live arrow while right-click dragging
let resignConfirmTimer = null;
let opponentDisconnected = false;

function generateGameCode() {
  const bytes = new Uint8Array(5);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 5; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function extractCleanGameCode(rawInput) {
  if (typeof rawInput !== 'string') return '';
  const trimmed = rawInput.trim();
  const urlMatch = trimmed.match(/[?&](?:game|code)=([A-Za-z0-9]{5})\b/);
  if (urlMatch) {
    return urlMatch[1].toUpperCase();
  }
  return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5);
}

function allowIncomingPacket() {
  const now = Date.now();
  net.msgTimestamps = net.msgTimestamps.filter((t) => now - t < 1000);
  if (net.msgTimestamps.length >= 20) return false;
  net.msgTimestamps.push(now);
  return true;
}

function isValidCoordObj(obj) {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    Number.isInteger(obj.r) &&
    Number.isInteger(obj.c) &&
    inBounds(obj.r, obj.c)
  );
}

function sanitizeSAN(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[^A-Za-z0-9+#=\-O ]/g, '').slice(0, 12);
}

function validateCleanBoard(boardArr) {
  if (!Array.isArray(boardArr) || boardArr.length !== BOARD_SIZE) return null;
  const clean = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = boardArr[r];
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return null;
    const cleanRow = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = row[c];
      if (cell === null) {
        cleanRow.push(null);
      } else if (
        typeof cell === 'string' &&
        cell.length >= 2 &&
        cell.length <= 5 &&
        (cell[0] === 'w' || cell[0] === 'b') &&
        Object.prototype.hasOwnProperty.call(PIECE_DEFS, cell.slice(1))
      ) {
        cleanRow.push(cell);
      } else {
        return null;
      }
    }
    clean.push(cleanRow);
  }
  return clean;
}

function serializeClockPayload() {
  return {
    timed: Boolean(clockState.timed),
    minutes: clockState.minutes,
    incrementSec: clockState.incrementSec,
    whiteMs: Math.max(0, Math.round(getLiveClockMs('w'))),
    blackMs: Math.max(0, Math.round(getLiveClockMs('b'))),
    running: Boolean(clockState.running)
  };
}

function applyClockPayload(rawClock) {
  if (!rawClock || typeof rawClock !== 'object') return;
  clockState.timed = Boolean(rawClock.timed);
  clockState.minutes = Number.isInteger(rawClock.minutes)
    ? Math.min(60, Math.max(1, rawClock.minutes))
    : 10;
  clockState.incrementSec = Number.isInteger(rawClock.incrementSec)
    ? Math.min(60, Math.max(0, rawClock.incrementSec))
    : 0;
  clockState.whiteMs =
    typeof rawClock.whiteMs === 'number' && Number.isFinite(rawClock.whiteMs)
      ? Math.max(0, Math.min(36000000, rawClock.whiteMs))
      : clockState.minutes * 60000;
  clockState.blackMs =
    typeof rawClock.blackMs === 'number' && Number.isFinite(rawClock.blackMs)
      ? Math.max(0, Math.min(36000000, rawClock.blackMs))
      : clockState.minutes * 60000;
  clockState.running = Boolean(rawClock.running);
  clockState.lastSyncPerf = getNowPerf();
}

function getLiveClockMs(color) {
  const base = color === 'w' ? clockState.whiteMs : clockState.blackMs;
  if (!clockState.timed || !clockState.running || gameState.status !== 'playing') {
    return base;
  }
  if (gameState.turn !== color) {
    return base;
  }
  const elapsed = Math.max(0, getNowPerf() - clockState.lastSyncPerf);
  return Math.max(0, base - elapsed);
}

function serializeAuthoritativeState(state) {
  return {
    board: state.board,
    turn: state.turn,
    castling: state.castling,
    enPassant: state.enPassant,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    status: state.status,
    winner: state.winner,
    inCheck: state.inCheck,
    lastMove: state.lastMove,
    moveHistory: state.moveHistory,
    captured: state.captured,
    historyFrames: state.historyFrames
  };
}

function validateAndHydrateState(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const cleanBoard = validateCleanBoard(raw.board);
  if (!cleanBoard) return null;

  const allowedStatuses = [
    'playing',
    'checkmate',
    'stalemate',
    'draw_50',
    'draw_repetition',
    'draw_material',
    'draw_agreement',
    'resigned',
    'timeout'
  ];
  if (raw.turn !== 'w' && raw.turn !== 'b') return null;
  if (!allowedStatuses.includes(raw.status)) return null;
  if (raw.winner !== null && raw.winner !== 'w' && raw.winner !== 'b') return null;

  const cleanHistory = Array.isArray(raw.moveHistory)
    ? raw.moveHistory.slice(0, 600).map(sanitizeSAN)
    : [];

  const cleanCapturedSide = (arr) =>
    Array.isArray(arr)
      ? arr
          .slice(0, 64)
          .filter((t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(PIECE_DEFS, t))
      : [];

  const cleanFrames = [];
  if (Array.isArray(raw.historyFrames)) {
    for (const f of raw.historyFrames.slice(0, 601)) {
      if (!f || typeof f !== 'object') continue;
      const fb = validateCleanBoard(f.board);
      if (!fb) continue;
      cleanFrames.push({
        board: fb,
        turn: f.turn === 'b' ? 'b' : 'w',
        inCheck: Boolean(f.inCheck),
        lastMove:
          f.lastMove && isValidCoordObj(f.lastMove.from) && isValidCoordObj(f.lastMove.to)
            ? {
                from: { r: f.lastMove.from.r, c: f.lastMove.from.c },
                to: { r: f.lastMove.to.r, c: f.lastMove.to.c }
              }
            : null,
        captured: {
          w: cleanCapturedSide(f.captured?.w),
          b: cleanCapturedSide(f.captured?.b)
        },
        meta:
          f.meta && typeof f.meta === 'object'
            ? {
                isCapture: Boolean(f.meta.isCapture),
                castleSide: f.meta.castleSide === 'K' || f.meta.castleSide === 'Q' ? f.meta.castleSide : null,
                rookMove:
                  f.meta.rookMove &&
                  isValidCoordObj(f.meta.rookMove.from) &&
                  isValidCoordObj(f.meta.rookMove.to)
                    ? {
                        from: { r: f.meta.rookMove.from.r, c: f.meta.rookMove.from.c },
                        to: { r: f.meta.rookMove.to.r, c: f.meta.rookMove.to.c }
                      }
                    : null,
                promotion:
                  typeof f.meta.promotion === 'string' && PIECE_DEFS[f.meta.promotion]
                    ? f.meta.promotion
                    : null
              }
            : null
      });
    }
  }

  const hydrated = {
    board: cleanBoard,
    turn: raw.turn,
    castling: {
      wK: Boolean(raw.castling?.wK),
      wQ: Boolean(raw.castling?.wQ),
      bK: Boolean(raw.castling?.bK),
      bQ: Boolean(raw.castling?.bQ)
    },
    enPassant: isValidCoordObj(raw.enPassant) ? { r: raw.enPassant.r, c: raw.enPassant.c } : null,
    halfMoveClock: Number.isInteger(raw.halfMoveClock) ? Math.max(0, raw.halfMoveClock) : 0,
    fullMoveNumber: Number.isInteger(raw.fullMoveNumber) ? Math.max(1, raw.fullMoveNumber) : 1,
    status: raw.status,
    winner: raw.winner,
    inCheck: Boolean(raw.inCheck),
    lastMove:
      raw.lastMove && isValidCoordObj(raw.lastMove.from) && isValidCoordObj(raw.lastMove.to)
        ? {
            from: { r: raw.lastMove.from.r, c: raw.lastMove.from.c },
            to: { r: raw.lastMove.to.r, c: raw.lastMove.to.c }
          }
        : null,
    moveHistory: cleanHistory,
    captured: {
      w: cleanCapturedSide(raw.captured?.w),
      b: cleanCapturedSide(raw.captured?.b)
    },
    positionCounts: {},
    historyFrames: cleanFrames
  };

  if (hydrated.historyFrames.length === 0) {
    hydrated.historyFrames.push(makeHistoryFrame(hydrated, null));
  }

  return hydrated;
}

function sendPacket(conn, payload) {
  if (conn && conn.open) {
    conn.send(payload);
  }
}

function initClockForNewMatch() {
  clockState.timed = Boolean(setupConfig.timed);
  clockState.minutes = setupConfig.minutes;
  clockState.incrementSec = setupConfig.incrementSec;
  const startMs = setupConfig.minutes * 60 * 1000;
  clockState.whiteMs = startMs;
  clockState.blackMs = startMs;
  clockState.running = false;
  clockState.lastSyncPerf = getNowPerf();
  clockState.lowTimeWarned = false;
}

// Deducts elapsed turn time and adds Fischer increment on the Authoritative Host
function commitHostClockTurn(moverColor) {
  if (!clockState.timed) return true;

  const now = getNowPerf();
  if (clockState.running) {
    const elapsed = Math.max(0, now - clockState.lastSyncPerf);
    const key = moverColor === 'w' ? 'whiteMs' : 'blackMs';
    clockState[key] = Math.max(0, clockState[key] - elapsed);

    if (clockState[key] <= 0) {
      clockState.running = false;
      clockState.lastSyncPerf = now;
      gameState.status = 'timeout';
      gameState.winner = moverColor === 'w' ? 'b' : 'w';
      return false;
    }

    clockState[key] += clockState.incrementSec * 1000;
  }

  clockState.running = true;
  clockState.lastSyncPerf = now;
  return true;
}

function tickClocksUIAndAuthority() {
  if (typeof document === 'undefined') return;
  if (!clockState.timed) return;

  // Host monitors active turn flag-fall
  if (net.mode === 'online' && net.role === 'host' && clockState.running && gameState.status === 'playing') {
    const activeColor = gameState.turn;
    const rem = getLiveClockMs(activeColor);
    if (rem <= 0) {
      if (activeColor === 'w') clockState.whiteMs = 0;
      else clockState.blackMs = 0;
      clockState.running = false;
      clockState.lastSyncPerf = getNowPerf();
      gameState.status = 'timeout';
      gameState.winner = activeColor === 'w' ? 'b' : 'w';
      net.drawOfferedBy = null;
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
      broadcastHostState();
      renderAll();
      return;
    }
  }

  // Low-time warning chime once when player's own clock drops below 10.0s
  if (net.mode === 'online' && clockState.running && gameState.status === 'playing') {
    const myRem = getLiveClockMs(net.myColor);
    if (myRem > 0 && myRem <= 10000 && !clockState.lowTimeWarned) {
      clockState.lowTimeWarned = true;
      playSound('lowTime');
    }
  }

  renderClockBoxesOnly();
}

function broadcastHostState() {
  if (net.role !== 'host' || !net.conn) return;
  sendPacket(net.conn, {
    type: 'sync_state',
    state: serializeAuthoritativeState(gameState),
    clock: serializeClockPayload(),
    drawOfferedBy: net.drawOfferedBy,
    hostName: net.myName,
    guestName: net.peerName
  });
}

function startNewMatchAsHost(isRematch = false) {
  if (isRematch) {
    net.myColor = net.myColor === 'w' ? 'b' : 'w';
  } else {
    if (setupConfig.sidePref === 'random') {
      net.myColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      net.myColor = setupConfig.sidePref === 'b' ? 'b' : 'w';
    }
  }

  const guestColor = net.myColor === 'w' ? 'b' : 'w';
  net.myRematchWanted = false;
  net.peerRematchWanted = false;
  net.drawOfferedBy = null;
  net.pendingOptimisticPly = null;
  boardFlipped = net.myColor === 'b';

  premoveQueue = [];
  clearBoardTransientUI();
  initClockForNewMatch();

  gameState = createInitialState();
  viewPly = 0;

  sendPacket(net.conn, {
    type: 'match_start',
    yourColor: guestColor,
    hostName: net.myName,
    guestName: net.peerName,
    state: serializeAuthoritativeState(gameState),
    clock: serializeClockPayload()
  });

  playSound('gameStart');
  renderAll();
}

function handleHostIncomingData(data) {
  if (!allowIncomingPacket()) return;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return;

  const guestColor = net.myColor === 'w' ? 'b' : 'w';

  if (data.type === 'hello' || data.type === 'name_update') {
    net.peerName = sanitizePlayerName(data.name);
    broadcastHostState();
    renderAll();
    return;
  }

  if (data.type === 'move_request') {
    if (gameState.status !== 'playing') return;
    if (gameState.turn !== guestColor) {
      broadcastHostState();
      return;
    }
    if (!isValidCoordObj(data.from) || !isValidCoordObj(data.to)) return;

    const promo = typeof data.promotion === 'string' ? data.promotion.slice(0, 4) : null;
    const prevState = gameState;
    const candidate = tryMakeMove(gameState, data.from, data.to, promo);
    if (!candidate) {
      broadcastHostState();
      return;
    }

    if (!commitHostClockTurn(guestColor)) {
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
      broadcastHostState();
      renderAll();
      return;
    }

    const wasAtLive = viewPly === prevState.moveHistory.length;
    gameState = candidate;
    if (gameState.status !== 'playing') {
      clockState.running = false;
    }
    net.drawOfferedBy = null;

    if (wasAtLive) {
      viewPly = gameState.moveHistory.length;
      queueSlideAnimationFromFrame(gameState.historyFrames[gameState.historyFrames.length - 1]);
    }

    playMoveFeedbackSound(prevState, gameState, false);
    broadcastHostState();
    reconcileInteractionAfterTurnChange();
    renderAll();
  } else if (data.type === 'draw_offer') {
    if (gameState.status !== 'playing') return;
    if (net.drawOfferedBy === net.myColor) {
      // Both players offered a draw -> mutual agreement
      gameState.status = 'draw_agreement';
      gameState.winner = null;
      clockState.running = false;
      net.drawOfferedBy = null;
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
    } else {
      net.drawOfferedBy = guestColor;
    }
    broadcastHostState();
    renderAll();
  } else if (data.type === 'draw_accept') {
    if (gameState.status !== 'playing' || net.drawOfferedBy !== net.myColor) return;
    gameState.status = 'draw_agreement';
    gameState.winner = null;
    clockState.running = false;
    net.drawOfferedBy = null;
    reconcileInteractionAfterTurnChange();
    playSound('gameEnd');
    broadcastHostState();
    renderAll();
  } else if (data.type === 'draw_decline') {
    if (net.drawOfferedBy === net.myColor) {
      net.drawOfferedBy = null;
      broadcastHostState();
      renderAll();
    }
  } else if (data.type === 'resign') {
    if (gameState.status !== 'playing') return;
    gameState.status = 'resigned';
    gameState.winner = net.myColor;
    clockState.running = false;
    net.drawOfferedBy = null;
    reconcileInteractionAfterTurnChange();
    playSound('gameEnd');
    broadcastHostState();
    renderAll();
  } else if (data.type === 'rematch_request') {
    if (gameState.status === 'playing') return;
    net.peerRematchWanted = true;
    if (net.myRematchWanted) {
      startNewMatchAsHost(true);
    } else {
      renderAll();
    }
  }
}

function handleGuestIncomingData(data) {
  if (!allowIncomingPacket()) return;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return;

  if (data.type === 'room_locked') {
    cleanupNetworkSession();
    setGameFeedback('That game is already full (2/2 players).');
    renderAll();
    return;
  }

  if (data.type === 'match_start') {
    if (data.yourColor !== 'w' && data.yourColor !== 'b') return;
    const hydrated = validateAndHydrateState(data.state);
    if (!hydrated) return;

    if (net.joinTimer) {
      clearTimeout(net.joinTimer);
      net.joinTimer = null;
    }

    net.mode = 'online';
    net.myColor = data.yourColor;
    net.peerName = sanitizePlayerName(data.hostName || 'Host');
    net.roomLocked = true;
    net.myRematchWanted = false;
    net.peerRematchWanted = false;
    net.drawOfferedBy = null;
    net.pendingOptimisticPly = null;
    opponentDisconnected = false;
    boardFlipped = net.myColor === 'b';

    applyClockPayload(data.clock);
    clockState.lowTimeWarned = false;

    premoveQueue = [];
    clearBoardTransientUI();
    gameState = hydrated;
    viewPly = gameState.moveHistory.length;

    setGameFeedback('');
    playSound('gameStart');
    renderAll();
  } else if (data.type === 'sync_state') {
    const hydrated = validateAndHydrateState(data.state);
    if (!hydrated) return;

    const prevMoveCount = gameState.moveHistory.length;
    const prevStatus = gameState.status;
    const wasAtLive = viewPly === prevMoveCount;

    if (typeof data.hostName === 'string') {
      net.peerName = sanitizePlayerName(data.hostName);
    }
    net.drawOfferedBy =
      data.drawOfferedBy === 'w' || data.drawOfferedBy === 'b' ? data.drawOfferedBy : null;

    applyClockPayload(data.clock);

    const prevState = gameState;
    const newMoveCount = hydrated.moveHistory.length;

    // 1. Authoritative echo of Guest's own optimistic move -> preserve Guest's active premoves/drag!
    if (
      net.pendingOptimisticPly !== null &&
      newMoveCount === net.pendingOptimisticPly &&
      hydrated.turn === prevState.turn &&
      hydrated.status === prevState.status
    ) {
      net.pendingOptimisticPly = null;
      drag.justDroppedMove = false;
      gameState = hydrated;
      if (wasAtLive) viewPly = newMoveCount;
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }

    // 2. Host rejected Guest's optimistic move (e.g. flag-fall timeout on Host just before packet arrived)
    if (net.pendingOptimisticPly !== null && newMoveCount < prevMoveCount) {
      net.pendingOptimisticPly = null;
      drag.justDroppedMove = false;
      gameState = hydrated;
      viewPly = wasAtLive ? newMoveCount : Math.min(viewPly, newMoveCount);
      if (prevStatus === 'playing' && gameState.status !== 'playing') {
        playSound('gameEnd');
      }
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }

    net.pendingOptimisticPly = null;
    gameState = hydrated;

    // 3. New move(s) played on board (Opponent's move -> upgrade selection or fire next premove!)
    if (newMoveCount > prevMoveCount) {
      const latestFrame = gameState.historyFrames[gameState.historyFrames.length - 1];
      const moverWasMe = gameState.turn !== net.myColor;
      if (wasAtLive) {
        viewPly = newMoveCount;
        if (!moverWasMe || !drag.justDroppedMove) {
          queueSlideAnimationFromFrame(latestFrame);
        }
      }
      drag.justDroppedMove = false;
      playMoveFeedbackSound(prevState, gameState, moverWasMe);
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }

    // 4. Same move count (name update, draw offer/decline, resignation, or timeout)
    if (prevStatus === 'playing' && gameState.status !== 'playing') {
      playSound('gameEnd');
      reconcileInteractionAfterTurnChange();
    } else if (gameState.status !== 'playing') {
      reconcileInteractionAfterTurnChange();
    }
    renderAll();
  } else if (data.type === 'rematch_request') {
    if (gameState.status === 'playing') return;
    net.peerRematchWanted = true;
    renderAll();
  }
}

function cleanupNetworkSession() {
  if (net.joinTimer) {
    clearTimeout(net.joinTimer);
    net.joinTimer = null;
  }
  if (net.conn) {
    try {
      net.conn.removeAllListeners?.();
      net.conn.close();
    } catch (_) {}
    net.conn = null;
  }
  if (net.peer) {
    try {
      net.peer.destroy();
    } catch (_) {}
    net.peer = null;
  }
  net.mode = 'local';
  net.role = null;
  net.roomCode = null;
  net.roomLocked = false;
  net.myRematchWanted = false;
  net.peerRematchWanted = false;
  net.drawOfferedBy = null;
  net.pendingOptimisticPly = null;
  net.msgTimestamps = [];
  opponentDisconnected = false;
  clockState.timed = false;
  clockState.running = false;
  premoveQueue = [];
  clearBoardTransientUI();
}

function createGameRoom(retryCount = 0) {
  if (typeof Peer === 'undefined') {
    setGameFeedback('Networking library failed to load. Check your internet connection.');
    return;
  }

  syncMyNameFromInput();
  const savedName = net.myName;
  cleanupNetworkSession();
  net.myName = savedName;
  setGameFeedback('');

  const code = generateGameCode();
  net.mode = 'waiting';
  net.role = 'host';
  net.roomCode = code;
  net.myColor = setupConfig.sidePref === 'b' ? 'b' : 'w';
  boardFlipped = net.myColor === 'b';
  initClockForNewMatch();
  gameState = createInitialState();
  viewPly = 0;
  renderAll();

  const peer = new Peer(PEER_ID_PREFIX + code, { config: PEER_ICE_CONFIG });
  net.peer = peer;

  peer.on('connection', (incomingConn) => {
    // ROOM LOCKING: Once 2 players are in the game, reject any 3rd connection immediately
    if (net.conn !== null || net.roomLocked) {
      const rejectIntruder = () => {
        sendPacket(incomingConn, { type: 'room_locked' });
        setTimeout(() => {
          try {
            incomingConn.close();
          } catch (_) {}
        }, 120);
      };
      if (incomingConn.open) rejectIntruder();
      else incomingConn.on('open', rejectIntruder);
      return;
    }

    net.conn = incomingConn;
    net.roomLocked = true;

    const activateGuest = () => {
      if (net.conn !== incomingConn) return;
      net.mode = 'online';
      opponentDisconnected = false;
      setGameFeedback('');
      startNewMatchAsHost(false);
    };

    if (incomingConn.open) activateGuest();
    else incomingConn.on('open', activateGuest);

    incomingConn.on('data', (data) => {
      if (net.conn === incomingConn) {
        handleHostIncomingData(data);
      }
    });

    incomingConn.on('close', () => {
      if (net.conn === incomingConn) {
        opponentDisconnected = true;
        clockState.running = false;
        premoveQueue = [];
        clearBoardTransientUI();
        renderAll();
      }
    });

    incomingConn.on('error', () => {
      if (net.conn === incomingConn) {
        opponentDisconnected = true;
        clockState.running = false;
        premoveQueue = [];
        clearBoardTransientUI();
        renderAll();
      }
    });
  });

  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id' && retryCount < 4) {
      createGameRoom(retryCount + 1);
      return;
    }
    if (net.mode !== 'online') {
      cleanupNetworkSession();
      setGameFeedback('Could not create game room. Please check your connection and try again.');
      renderAll();
    }
  });
}

function joinGameRoom(rawCode) {
  const code = extractCleanGameCode(rawCode);
  if (code.length !== 5) {
    setGameFeedback('Please enter a valid 5-character game code.');
    return;
  }
  if (typeof Peer === 'undefined') {
    setGameFeedback('Networking library failed to load. Check your internet connection.');
    return;
  }

  syncMyNameFromInput();
  const savedName = net.myName;
  cleanupNetworkSession();
  net.myName = savedName;
  setGameFeedback('');

  net.mode = 'joining';
  net.role = 'guest';
  net.roomCode = code;
  if (dom.joinInput) dom.joinInput.value = code;
  renderAll();

  const peer = new Peer({ config: PEER_ICE_CONFIG });
  net.peer = peer;

  net.joinTimer = setTimeout(() => {
    if (net.mode === 'joining') {
      cleanupNetworkSession();
      setGameFeedback(`Could not connect to game ${code}. Check the code and try again.`);
      renderAll();
    }
  }, 10000);

  peer.on('open', () => {
    if (net.peer !== peer) return;
    const conn = peer.connect(PEER_ID_PREFIX + code, { reliable: true });
    net.conn = conn;

    const sendHello = () => {
      sendPacket(conn, { type: 'hello', name: net.myName });
    };

    if (conn.open) sendHello();
    else conn.on('open', sendHello);

    conn.on('data', (data) => {
      if (net.conn === conn) {
        handleGuestIncomingData(data);
      }
    });

    conn.on('close', () => {
      if (net.conn === conn) {
        if (net.mode === 'joining') {
          cleanupNetworkSession();
          setGameFeedback(`Connection to game ${code} closed.`);
        } else {
          opponentDisconnected = true;
          clockState.running = false;
          premoveQueue = [];
          net.pendingOptimisticPly = null;
          clearBoardTransientUI();
        }
        renderAll();
      }
    });

    conn.on('error', () => {
      if (net.conn === conn && net.mode === 'joining') {
        cleanupNetworkSession();
        setGameFeedback(`Failed to connect to game ${code}.`);
        renderAll();
      }
    });
  });

  peer.on('error', (err) => {
    if (net.peer !== peer) return;
    const notFound = err && err.type === 'peer-unavailable';
    cleanupNetworkSession();
    setGameFeedback(
      notFound
        ? `Game ${code} was not found. Make sure the host still has the room open.`
        : 'Network error while joining game. Please try again.'
    );
    renderAll();
  });
}

/* ============================================================================
 * SECTION 5: USER INTERFACE (Board, Animations, Premoves, Arrows, Replay, PGN)
 * ============================================================================ */

const drag = {
  active: false,
  moved: false,
  isPremoveDrag: false,
  wasAlreadySelected: false,
  justDroppedMove: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originSq: null,
  hoverSq: null
};

const rcDrag = {
  active: false,
  pointerId: null,
  originSq: null
};

const dom = {};

function cacheDom() {
  dom.boardShell = document.getElementById('board-shell');
  dom.board = document.getElementById('board');
  dom.boardArrows = document.getElementById('board-arrows');
  dom.dragGhost = document.getElementById('drag-ghost');
  dom.promoBackdrop = document.getElementById('promotion-backdrop');
  dom.promoMenu = document.getElementById('promotion-menu');

  dom.topSwatch = document.getElementById('top-color-swatch');
  dom.topName = document.getElementById('top-player-name');
  dom.topElo = document.getElementById('top-player-elo');
  dom.topTurn = document.getElementById('top-turn-pill');
  dom.topCaptured = document.getElementById('top-captured');
  dom.topMaterial = document.getElementById('top-material');
  dom.topClock = document.getElementById('top-clock');

  dom.bottomSwatch = document.getElementById('bottom-color-swatch');
  dom.bottomName = document.getElementById('bottom-player-name');
  dom.bottomElo = document.getElementById('bottom-player-elo');
  dom.bottomTurn = document.getElementById('bottom-turn-pill');
  dom.bottomCaptured = document.getElementById('bottom-captured');
  dom.bottomMaterial = document.getElementById('bottom-material');
  dom.bottomClock = document.getElementById('bottom-clock');

  dom.soundToggleBtn = document.getElementById('sound-toggle-btn');
  dom.soundOnIcon = document.getElementById('sound-on-icon');
  dom.soundOffIcon = document.getElementById('sound-off-icon');
  dom.modeBadge = document.getElementById('mode-badge');

  dom.nameInput = document.getElementById('player-name-input');
  dom.eloPreview = document.getElementById('elo-preview');

  dom.gameIdle = document.getElementById('game-idle');
  dom.gameSetup = document.getElementById('game-setup');
  dom.gameWaiting = document.getElementById('game-waiting');
  dom.gameConnected = document.getElementById('game-connected');
  dom.gameFeedback = document.getElementById('game-feedback');

  dom.openSetupBtn = document.getElementById('open-setup-btn');
  dom.setupBackBtn = document.getElementById('setup-back-btn');
  dom.presetRow = document.getElementById('preset-row');
  dom.slidersGroup = document.getElementById('sliders-group');
  dom.minutesLabel = document.getElementById('setup-minutes-label');
  dom.minutesSlider = document.getElementById('setup-minutes-slider');
  dom.incrementLabel = document.getElementById('setup-increment-label');
  dom.incrementSlider = document.getElementById('setup-increment-slider');
  dom.sideButtons = document.getElementById('side-buttons');
  dom.createGameBtn = document.getElementById('create-game-btn');

  dom.joinForm = document.getElementById('join-game-form');
  dom.joinInput = document.getElementById('join-code-input');
  dom.joinBtn = document.getElementById('join-game-btn');

  dom.waitingSummary = document.getElementById('waiting-summary');
  dom.codeDisplay = document.getElementById('game-code-display');
  dom.copyCodeBtn = document.getElementById('copy-code-btn');
  dom.copyLinkBtn = document.getElementById('copy-link-btn');
  dom.cancelGameBtn = document.getElementById('cancel-game-btn');

  dom.activeGameCode = document.getElementById('active-game-code');
  dom.activeTimeTag = document.getElementById('active-time-tag');
  dom.leaveGameBtn = document.getElementById('leave-game-btn');

  dom.statusBanner = document.getElementById('status-banner');
  dom.drawOfferBanner = document.getElementById('draw-offer-banner');
  dom.acceptDrawBtn = document.getElementById('accept-draw-btn');
  dom.declineDrawBtn = document.getElementById('decline-draw-btn');

  dom.copyPgnBtn = document.getElementById('copy-pgn-btn');
  dom.moveList = document.getElementById('move-list');
  dom.navFirstBtn = document.getElementById('nav-first-btn');
  dom.navPrevBtn = document.getElementById('nav-prev-btn');
  dom.navNextBtn = document.getElementById('nav-next-btn');
  dom.navLastBtn = document.getElementById('nav-last-btn');

  dom.localControls = document.getElementById('local-controls');
  dom.onlineControls = document.getElementById('online-controls');
  dom.resetLocalBtn = document.getElementById('reset-local-btn');
  dom.flipBoardBtn = document.getElementById('flip-board-btn');
  dom.drawBtn = document.getElementById('draw-btn');
  dom.resignBtn = document.getElementById('resign-btn');
  dom.rematchBtn = document.getElementById('rematch-btn');
}

function isViewingLive() {
  return viewPly === gameState.moveHistory.length;
}

function getDisplayedFrame() {
  const frames = gameState.historyFrames;
  if (!frames || frames.length === 0) {
    return makeHistoryFrame(gameState, null);
  }
  const idx = Math.max(0, Math.min(frames.length - 1, viewPly));
  return frames[idx];
}

function canPlayerMovePiece(color) {
  if (!isViewingLive()) return false;
  if (gameState.status !== 'playing' || opponentDisconnected) return false;
  if (net.mode === 'waiting' || net.mode === 'joining' || net.mode === 'setup') return false;
  if (net.mode === 'online') {
    return color === net.myColor && gameState.turn === net.myColor;
  }
  return color === gameState.turn;
}

function canUsePremoveMode() {
  return (
    isViewingLive() &&
    net.mode === 'online' &&
    gameState.status === 'playing' &&
    !opponentDisconnected &&
    gameState.turn !== net.myColor
  );
}

function canPlayerPremovePiece(color) {
  return canUsePremoveMode() && color === net.myColor;
}

function clearSelection() {
  selectedSq = null;
  selectedLegalMoves = [];
  premoveOriginSq = null;
  premoveTargets = [];
}

function clearAnnotations() {
  drawnArrows = [];
  markedSquares = [];
  previewArrow = null;
}

function cancelActiveDrag() {
  if (drag.active || drag.moved) {
    drag.active = false;
    drag.moved = false;
    drag.isPremoveDrag = false;
    drag.pointerId = null;
    drag.originSq = null;
    endDragVisuals();
  }
}

function clearBoardTransientUI() {
  cancelActiveDrag();
  clearSelection();
  clearAnnotations();
  closePromotionPicker();
  resetResignConfirm();
  pendingSlideAnim = null;
}

function selectSquare(r, c) {
  premoveOriginSq = null;
  premoveTargets = [];
  selectedSq = { r, c };
  selectedLegalMoves = getLegalMovesForSquare(gameState, r, c);
}

function selectPremoveOrigin(r, c) {
  selectedSq = null;
  selectedLegalMoves = [];
  premoveOriginSq = { r, c };
  const projState = getProjectedPremoveState();
  premoveTargets = getPremoveTargetsForSquare(projState, r, c, net.myColor);
}

// --- Smooth Piece Slide Animation (FLIP transition) ---

function queueSlideAnimationFromFrame(frame, reverse = false) {
  if (!frame || !frame.lastMove) return;
  const moves = [];
  if (reverse) {
    moves.push({ from: frame.lastMove.to, to: frame.lastMove.from });
    if (frame.meta?.rookMove) {
      moves.push({ from: frame.meta.rookMove.to, to: frame.meta.rookMove.from });
    }
    pendingSlideAnim = { moves };
    return;
  }

  moves.push({ from: frame.lastMove.from, to: frame.lastMove.to });
  if (frame.meta?.rookMove) {
    moves.push({ from: frame.meta.rookMove.from, to: frame.meta.rookMove.to });
  }

  // Merge non-conflicting slide animations when opponent's move + instant premove happen together
  if (pendingSlideAnim && Array.isArray(pendingSlideAnim.moves) && pendingSlideAnim.moves.length > 0) {
    const kept = pendingSlideAnim.moves.filter(
      (prev) =>
        !moves.some(
          (cur) =>
            (cur.from.r === prev.to.r && cur.from.c === prev.to.c) ||
            (cur.to.r === prev.to.r && cur.to.c === prev.to.c)
        )
    );
    pendingSlideAnim = { moves: [...kept, ...moves] };
  } else {
    pendingSlideAnim = { moves };
  }
}

function applyPendingSlideAnimations() {
  if (!pendingSlideAnim || !dom.board) return;
  const animMoves = pendingSlideAnim.moves;
  pendingSlideAnim = null;

  const rect = dom.board.getBoundingClientRect();
  if (!rect || rect.width <= 0) return;
  const sqSize = rect.width / 8;

  for (const m of animMoves) {
    const destImg = dom.board.querySelector(
      `.square[data-r="${m.to.r}"][data-c="${m.to.c}"] .piece`
    );
    if (!destImg) continue;

    const fromVisCol = boardFlipped ? 7 - m.from.c : m.from.c;
    const fromVisRow = boardFlipped ? 7 - m.from.r : m.from.r;
    const toVisCol = boardFlipped ? 7 - m.to.c : m.to.c;
    const toVisRow = boardFlipped ? 7 - m.to.r : m.to.r;

    const dx = (fromVisCol - toVisCol) * sqSize;
    const dy = (fromVisRow - toVisRow) * sqSize;
    if (dx === 0 && dy === 0) continue;

    destImg.style.transition = 'none';
    destImg.style.transform = `translate(${dx}px, ${dy}px)`;
    // Force reflow so browser registers starting offset before animating to (0, 0)
    destImg.getBoundingClientRect();
    destImg.style.transition = 'transform 135ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    destImg.style.transform = 'translate(0px, 0px)';
  }
}

// --- Promotion Chooser (Supports Both Live Moves & Multi-Premoves!) ---

function closePromotionPicker() {
  pendingPromotion = null;
  if (dom.promoBackdrop) dom.promoBackdrop.classList.add('hidden');
  if (dom.promoMenu) dom.promoMenu.replaceChildren();
}

function positionPromotionMenu() {
  if (!pendingPromotion || !dom.promoMenu) return;
  const to = pendingPromotion.to;
  const visCol = boardFlipped ? 7 - to.c : to.c;
  const visRow = boardFlipped ? 7 - to.r : to.r;
  dom.promoMenu.style.left = `${visCol * 12.5}%`;
  if (visRow === 0) {
    dom.promoMenu.style.top = '0';
    dom.promoMenu.style.bottom = 'auto';
  } else {
    dom.promoMenu.style.bottom = '0';
    dom.promoMenu.style.top = 'auto';
  }
}

function openPromotionPicker(from, to, color, viaDrag, isPremove = false) {
  pendingPromotion = {
    from: { r: from.r, c: from.c },
    to: { r: to.r, c: to.c },
    color,
    viaDrag: Boolean(viaDrag),
    isPremove: Boolean(isPremove)
  };
  dom.promoMenu.replaceChildren();

  for (const type of getPromotionTypes()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'promotion-option';
    btn.dataset.promo = type;
    btn.title = PIECE_DEFS[type].name;

    const img = document.createElement('img');
    img.src = getPieceSvgDataUri(color + type);
    img.alt = PIECE_DEFS[type].name;
    img.draggable = false;

    btn.appendChild(img);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pending = pendingPromotion;
      closePromotionPicker();
      if (!pending) return;
      if (pending.isPremove) {
        enqueuePremove(pending.from, pending.to, type);
      } else {
        submitPlayerMove(pending.from, pending.to, type, pending.viaDrag, false);
      }
    });
    dom.promoMenu.appendChild(btn);
  }

  positionPromotionMenu();
  dom.promoBackdrop.classList.remove('hidden');
}

function requestOrOpenPromotion(from, to, viaDrag = false) {
  const legal = getLegalMovesForSquare(gameState, from.r, from.c).filter(
    (m) => m.to.r === to.r && m.to.c === to.c
  );
  if (legal.length === 0) return false;

  if (legal[0].promotion !== null) {
    const moverColor = getPieceColor(gameState.board[from.r][from.c]);
    clearSelection();
    openPromotionPicker(from, to, moverColor, viaDrag, false);
    renderBoard();
    return true;
  }

  submitPlayerMove(from, to, null, viaDrag, false);
  return true;
}

function submitPlayerMove(from, to, promotion, viaDrag = false, fromPremove = false) {
  if (!fromPremove) {
    clearSelection();
    clearAnnotations();
  }
  viewPly = gameState.moveHistory.length;

  if (net.mode === 'local') {
    const prevState = gameState;
    const next = tryMakeMove(gameState, from, to, promotion);
    if (next) {
      gameState = next;
      viewPly = gameState.moveHistory.length;
      if (!viaDrag) {
        queueSlideAnimationFromFrame(gameState.historyFrames[gameState.historyFrames.length - 1]);
      }
      playMoveFeedbackSound(prevState, gameState, true);
      renderAll();
    }
    return;
  }

  if (net.mode === 'online') {
    if (net.role === 'host') {
      if (gameState.turn !== net.myColor) return;
      const prevState = gameState;
      const candidate = tryMakeMove(gameState, from, to, promotion);
      if (!candidate) return;

      if (!commitHostClockTurn(net.myColor)) {
        reconcileInteractionAfterTurnChange();
        playSound('gameEnd');
        broadcastHostState();
        renderAll();
        return;
      }

      gameState = candidate;
      if (gameState.status !== 'playing') {
        clockState.running = false;
      }
      net.drawOfferedBy = null;
      viewPly = gameState.moveHistory.length;

      if (!viaDrag) {
        queueSlideAnimationFromFrame(gameState.historyFrames[gameState.historyFrames.length - 1]);
      }
      if (fromPremove && typeof setTimeout === 'function') {
        const snapPrev = prevState;
        const snapNext = gameState;
        setTimeout(() => playMoveFeedbackSound(snapPrev, snapNext, true), 40);
      } else {
        playMoveFeedbackSound(prevState, gameState, true);
      }
      broadcastHostState();
      if (!fromPremove) renderAll();
    } else if (net.role === 'guest') {
      if (gameState.turn !== net.myColor) return;
      const prevState = gameState;
      const preview = tryMakeMove(gameState, from, to, promotion);
      if (!preview) return;

      // Optimistically update Guest state immediately so Guest can queue premoves with 0ms latency!
      gameState = preview;
      net.pendingOptimisticPly = gameState.moveHistory.length;
      net.drawOfferedBy = null;
      viewPly = gameState.moveHistory.length;
      drag.justDroppedMove = Boolean(viaDrag);

      if (!viaDrag) {
        queueSlideAnimationFromFrame(gameState.historyFrames[gameState.historyFrames.length - 1]);
      }
      if (fromPremove && typeof setTimeout === 'function') {
        const snapPrev = prevState;
        const snapNext = gameState;
        setTimeout(() => playMoveFeedbackSound(snapPrev, snapNext, true), 40);
      } else {
        playMoveFeedbackSound(prevState, gameState, true);
      }

      sendPacket(net.conn, {
        type: 'move_request',
        from: { r: from.r, c: from.c },
        to: { r: to.r, c: to.c },
        promotion: promotion || null
      });
      if (!fromPremove) renderAll();
    }
  }
}

// --- Variant-Safe Multi-Premove Projection, Promotion & Seamless Turn Transitions ---

const MAX_PREMOVE_QUEUE = 32;

function applyPremoveStepToState(baseState, step, color) {
  if (!step || !isValidCoordObj(step.from) || !isValidCoordObj(step.to)) return null;
  const movingCode = baseState.board[step.from.r]?.[step.from.c];
  if (!movingCode || getPieceColor(movingCode) !== color) return null;

  const allowedTargets = getPremoveTargetsForSquare(baseState, step.from.r, step.from.c, color);
  if (!allowedTargets.some((t) => t.r === step.to.r && t.c === step.to.c)) {
    return null;
  }

  const moverType = getPieceType(movingCode);

  // Probe pseudo-moves (current projected board + unblocked home-rank board) to detect castling rookMove or custom hooks
  const myTurnState = { ...baseState, turn: color };
  let matchedMove = generatePseudoMoves(myTurnState, step.from.r, step.from.c, false).find(
    (m) =>
      m.to.r === step.to.r &&
      m.to.c === step.to.c &&
      (!step.promotion || !m.promotion || m.promotion === step.promotion)
  );

  if (!matchedMove) {
    const soloBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    soloBoard[step.from.r][step.from.c] = movingCode;
    const homeRow = color === 'w' ? 7 : 0;
    if (
      baseState.board[homeRow][0] === color + 'r' &&
      !(step.from.r === homeRow && step.from.c === 0)
    ) {
      soloBoard[homeRow][0] = color + 'r';
    }
    if (
      baseState.board[homeRow][7] === color + 'r' &&
      !(step.from.r === homeRow && step.from.c === 7)
    ) {
      soloBoard[homeRow][7] = color + 'r';
    }
    const soloState = {
      board: soloBoard,
      turn: color,
      castling: baseState.castling,
      enPassant: null
    };
    matchedMove = generatePseudoMoves(soloState, step.from.r, step.from.c, false).find(
      (m) =>
        m.to.r === step.to.r &&
        m.to.c === step.to.c &&
        (!step.promotion || !m.promotion || m.promotion === step.promotion)
    );
  }

  const nextBoard = cloneBoard(baseState.board);
  const nextCastling = { ...baseState.castling };

  nextBoard[step.from.r][step.from.c] = null;

  if (matchedMove && matchedMove.isEnPassant && matchedMove.captureSq) {
    nextBoard[matchedMove.captureSq.r][matchedMove.captureSq.c] = null;
  }

  if (matchedMove && matchedMove.rookMove) {
    const rm = matchedMove.rookMove;
    const rCode = nextBoard[rm.from.r][rm.from.c];
    if (rCode && getPieceColor(rCode) === color) {
      nextBoard[rm.from.r][rm.from.c] = null;
      nextBoard[rm.to.r][rm.to.c] = rCode;
    }
  }

  const finalType =
    step.promotion && Object.prototype.hasOwnProperty.call(PIECE_DEFS, step.promotion)
      ? step.promotion
      : moverType;
  nextBoard[step.to.r][step.to.c] = color + finalType;

  const nextProj = {
    board: nextBoard,
    turn: color,
    castling: nextCastling,
    enPassant: null
  };

  const def = PIECE_DEFS[moverType];
  if (def && typeof def.afterMove === 'function') {
    def.afterMove(
      nextProj,
      matchedMove || {
        from: { ...step.from },
        to: { ...step.to },
        promotion: step.promotion || null
      }
    );
  }

  if (color === 'w' && moverType === 'k') {
    nextProj.castling.wK = false;
    nextProj.castling.wQ = false;
  }
  if (color === 'b' && moverType === 'k') {
    nextProj.castling.bK = false;
    nextProj.castling.bQ = false;
  }
  const touches = (r, c) =>
    (step.from.r === r && step.from.c === c) || (step.to.r === r && step.to.c === c);
  if (touches(7, 7)) nextProj.castling.wK = false;
  if (touches(7, 0)) nextProj.castling.wQ = false;
  if (touches(0, 7)) nextProj.castling.bK = false;
  if (touches(0, 0)) nextProj.castling.bQ = false;

  return nextProj;
}

function getProjectedPremoveState(
  state = gameState,
  queue = premoveQueue,
  color = net.myColor
) {
  let cur = {
    board: cloneBoard(state.board),
    turn: color,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null
  };
  for (const step of queue) {
    const next = applyPremoveStepToState(cur, step, color);
    if (!next) break;
    cur = next;
  }
  return cur;
}

function sanitizePremoveQueue() {
  if (premoveQueue.length === 0) return;
  let cur = {
    board: cloneBoard(gameState.board),
    turn: net.myColor,
    castling: { ...gameState.castling },
    enPassant: gameState.enPassant ? { ...gameState.enPassant } : null
  };
  const valid = [];
  for (const step of premoveQueue) {
    const next = applyPremoveStepToState(cur, step, net.myColor);
    if (!next) break;
    valid.push(step);
    cur = next;
  }
  premoveQueue = valid;
}

function doesPremoveRequirePromotion(projState, from, to, color) {
  const code = projState.board[from.r]?.[from.c];
  if (!code || getPieceColor(code) !== color) return false;
  if (getPromotionTypes().length === 0) return false;

  // 1. Current projected board
  const curProbe = { ...projState, turn: color };
  if (
    generatePseudoMoves(curProbe, from.r, from.c, false).some(
      (m) => m.to.r === to.r && m.to.c === to.c && m.promotion !== null
    )
  ) {
    return true;
  }

  // 2. Empty destination probe (straight pawn push onto a currently occupied promotion square)
  const emptyBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  emptyBoard[from.r][from.c] = code;
  const emptyProbe = {
    board: emptyBoard,
    turn: color,
    castling: projState.castling,
    enPassant: null
  };
  if (
    generatePseudoMoves(emptyProbe, from.r, from.c, false).some(
      (m) => m.to.r === to.r && m.to.c === to.c && m.promotion !== null
    )
  ) {
    return true;
  }

  // 3. Capture destination probe (diagonal pawn pre-capture onto an empty or friendly promotion square!)
  const enemy = color === 'w' ? 'b' : 'w';
  const dummyEnemyType = Object.keys(PIECE_DEFS).find((k) => !PIECE_DEFS[k].isRoyal) || 'p';
  const capBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  capBoard[from.r][from.c] = code;
  capBoard[to.r][to.c] = enemy + dummyEnemyType;
  const capProbe = {
    board: capBoard,
    turn: color,
    castling: projState.castling,
    enPassant: null
  };
  return generatePseudoMoves(capProbe, from.r, from.c, false).some(
    (m) => m.to.r === to.r && m.to.c === to.c && m.promotion !== null
  );
}

function getInteractiveLiveBoard() {
  if (canUsePremoveMode() && premoveQueue.length > 0) {
    return getProjectedPremoveState().board;
  }
  return gameState.board;
}

function enqueuePremove(from, to, promotion = null) {
  if (premoveQueue.length >= MAX_PREMOVE_QUEUE) {
    clearSelection();
    renderAll();
    return;
  }
  premoveQueue.push({
    from: { r: from.r, c: from.c },
    to: { r: to.r, c: to.c },
    promotion: promotion || null
  });
  clearSelection();
  playSound('premove');
  renderAll();
}

function requestOrQueuePremove(from, to, viaDrag = false) {
  if (!canUsePremoveMode()) return false;
  const projState = getProjectedPremoveState();
  const targets = getPremoveTargetsForSquare(projState, from.r, from.c, net.myColor);
  if (!targets.some((t) => t.r === to.r && t.c === to.c)) return false;

  if (doesPremoveRequirePromotion(projState, from, to, net.myColor)) {
    clearSelection();
    openPromotionPicker(from, to, net.myColor, viaDrag, true);
    renderBoard();
    return true;
  }

  enqueuePremove(from, to, null);
  return true;
}

function cancelAllPremoves() {
  const hadAnything =
    premoveQueue.length > 0 ||
    premoveOriginSq !== null ||
    Boolean(pendingPromotion && pendingPromotion.isPremove);
  premoveQueue = [];
  if (drag.active && drag.isPremoveDrag) {
    cancelActiveDrag();
  }
  if (premoveOriginSq) {
    premoveOriginSq = null;
    premoveTargets = [];
  }
  if (pendingPromotion && pendingPromotion.isPremove) {
    closePromotionPicker();
  }
  if (hadAnything) {
    renderAll();
  }
  return hadAnything;
}

function reconcileActivePremoveInteraction() {
  const projState = getProjectedPremoveState();

  if (pendingPromotion && pendingPromotion.isPremove) {
    if (
      !doesPremoveRequirePromotion(
        projState,
        pendingPromotion.from,
        pendingPromotion.to,
        net.myColor
      )
    ) {
      closePromotionPicker();
    }
  }

  if (premoveOriginSq) {
    const code = projState.board[premoveOriginSq.r]?.[premoveOriginSq.c];
    if (code && getPieceColor(code) === net.myColor) {
      premoveTargets = getPremoveTargetsForSquare(
        projState,
        premoveOriginSq.r,
        premoveOriginSq.c,
        net.myColor
      );
      if (drag.active && drag.moved && dom.dragGhost) {
        dom.dragGhost.src = getPieceSvgDataUri(code);
      }
    } else {
      cancelActiveDrag();
      clearSelection();
    }
  }
}

function reconcileInteractionAfterTurnChange() {
  if (gameState.status !== 'playing' || opponentDisconnected || net.mode !== 'online') {
    premoveQueue = [];
    cancelActiveDrag();
    clearSelection();
    closePromotionPicker();
    return;
  }

  if (gameState.turn === net.myColor) {
    if (premoveQueue.length > 0) {
      const nextPre = premoveQueue.shift();
      const pieceCode = gameState.board[nextPre.from.r]?.[nextPre.from.c];
      const legal =
        pieceCode && getPieceColor(pieceCode) === net.myColor
          ? getLegalMovesForSquare(gameState, nextPre.from.r, nextPre.from.c).filter(
              (m) => m.to.r === nextPre.to.r && m.to.c === nextPre.to.c
            )
          : [];

      if (legal.length > 0) {
        let chosenPromo = null;
        if (legal[0].promotion !== null) {
          const exact = legal.find((m) => m.promotion === nextPre.promotion);
          chosenPromo = exact ? exact.promotion : legal[0].promotion;
        }

        submitPlayerMove(nextPre.from, nextPre.to, chosenPromo, false, true);

        if (gameState.status !== 'playing') {
          premoveQueue = [];
          cancelActiveDrag();
          clearSelection();
          closePromotionPicker();
          return;
        }

        sanitizePremoveQueue();
        reconcileActivePremoveInteraction();
        return;
      }

      // First premove is illegal in resulting position -> cancel entire premove chain like Chess.com
      premoveQueue = [];
      if (pendingPromotion && pendingPromotion.isPremove) {
        closePromotionPicker();
      }
    }

    // Transitioned to player's LIVE turn with no remaining premoves:
    // 1. Seamlessly upgrade an open premove Promotion Chooser to a live Promotion Chooser if legal!
    if (pendingPromotion && pendingPromotion.isPremove) {
      const promoLegal = getLegalMovesForSquare(
        gameState,
        pendingPromotion.from.r,
        pendingPromotion.from.c
      ).filter(
        (m) =>
          m.to.r === pendingPromotion.to.r &&
          m.to.c === pendingPromotion.to.c &&
          m.promotion !== null
      );
      if (promoLegal.length > 0) {
        pendingPromotion.isPremove = false;
      } else {
        closePromotionPicker();
      }
    }

    // 2. Seamlessly upgrade selected/dragged premove piece into a live selection/drag!
    if (premoveOriginSq) {
      const sq = { r: premoveOriginSq.r, c: premoveOriginSq.c };
      const code = gameState.board[sq.r]?.[sq.c];
      if (code && getPieceColor(code) === net.myColor && isViewingLive()) {
        selectedSq = sq;
        selectedLegalMoves = getLegalMovesForSquare(gameState, sq.r, sq.c);
        premoveOriginSq = null;
        premoveTargets = [];
        if (drag.active && drag.isPremoveDrag) {
          drag.isPremoveDrag = false;
          if (drag.moved && dom.dragGhost) {
            dom.dragGhost.src = getPieceSvgDataUri(code);
          }
        }
      } else {
        cancelActiveDrag();
        clearSelection();
      }
    } else if (drag.active && drag.isPremoveDrag) {
      cancelActiveDrag();
    }
    return;
  }

  // Still opponent's turn -> keep premove queue & active premove interaction sanitized
  sanitizePremoveQueue();
  reconcileActivePremoveInteraction();
}

// --- Pointer Input (Click-to-Move, Drag-and-Drop, Multi-Premoves & Right-Click Arrows) ---

function clientPointToSquare(clientX, clientY) {
  if (!dom.board) return null;
  const rect = dom.board.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX >= rect.right ||
    clientY < rect.top ||
    clientY >= rect.bottom
  ) {
    return null;
  }
  const visCol = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
  const visRow = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
  return {
    r: boardFlipped ? 7 - visRow : visRow,
    c: boardFlipped ? 7 - visCol : visCol
  };
}

function updateDragHoverSquare(sq) {
  if (!dom.board) return;
  const prev = dom.board.querySelector('.square.drag-target');
  if (prev) prev.classList.remove('drag-target');
  drag.hoverSq = sq;
  if (sq) {
    const el = dom.board.querySelector(`.square[data-r="${sq.r}"][data-c="${sq.c}"]`);
    if (el) el.classList.add('drag-target');
  }
}

function endDragVisuals() {
  if (dom.dragGhost) dom.dragGhost.classList.add('hidden');
  if (dom.board) {
    const hiddenPiece = dom.board.querySelector('.piece.dragging-source');
    if (hiddenPiece) hiddenPiece.classList.remove('dragging-source');
  }
  updateDragHoverSquare(null);
}

function toggleRightClickArrowOrMark(originSq, targetSq) {
  if (originSq.r === targetSq.r && originSq.c === targetSq.c) {
    if (cancelAllPremoves()) {
      return;
    }
    const idx = markedSquares.findIndex((s) => s.r === originSq.r && s.c === originSq.c);
    if (idx >= 0) markedSquares.splice(idx, 1);
    else markedSquares.push({ r: originSq.r, c: originSq.c });
    renderBoard();
  } else {
    const idx = drawnArrows.findIndex(
      (a) =>
        a.from.r === originSq.r &&
        a.from.c === originSq.c &&
        a.to.r === targetSq.r &&
        a.to.c === targetSq.c
    );
    if (idx >= 0) drawnArrows.splice(idx, 1);
    else drawnArrows.push({ from: { ...originSq }, to: { ...targetSq } });
    renderArrowsOverlay();
  }
}

function handleBoardPointerDown(e) {
  if (dom.promoBackdrop && !dom.promoBackdrop.classList.contains('hidden')) return;

  const sq = clientPointToSquare(e.clientX, e.clientY);
  if (!sq) return;

  // Right-click (button 2): draw tactical arrows, mark squares, or cancel premoves
  if (e.button === 2) {
    e.preventDefault();
    rcDrag.active = true;
    rcDrag.pointerId = e.pointerId;
    rcDrag.originSq = sq;
    previewArrow = null;
    return;
  }

  if (e.button !== undefined && e.button !== 0) return;

  // Left-click clears any drawn right-click arrows/marks
  if (drawnArrows.length > 0 || markedSquares.length > 0) {
    clearAnnotations();
    renderBoard();
  }

  // If viewing historical move, only allow inspecting board (click >| to play)
  if (!isViewingLive()) return;

  // 1A. Normal turn: if friendly piece is selected and player clicks a legal target -> Move!
  if (selectedSq && canPlayerMovePiece(net.mode === 'online' ? net.myColor : gameState.turn)) {
    const isLegalTarget = selectedLegalMoves.some((m) => m.to.r === sq.r && m.to.c === sq.c);
    if (isLegalTarget) {
      e.preventDefault();
      requestOrOpenPromotion(selectedSq, sq, false);
      return;
    }
  }

  // 1B. Opponent's turn (Premove mode): if premove origin is selected and player clicks a premove target -> Queue!
  if (premoveOriginSq && canUsePremoveMode()) {
    const isPreTarget = premoveTargets.some((t) => t.r === sq.r && t.c === sq.c);
    if (isPreTarget) {
      e.preventDefault();
      requestOrQueuePremove(premoveOriginSq, sq, false);
      return;
    }
  }

  const activeBoard = getInteractiveLiveBoard();
  const code = activeBoard[sq.r][sq.c];
  const pieceColor = getPieceColor(code);

  // 2A. Pressing on a movable piece on your turn
  if (code && canPlayerMovePiece(pieceColor)) {
    e.preventDefault();
    const alreadySelected = Boolean(selectedSq && selectedSq.r === sq.r && selectedSq.c === sq.c);
    selectSquare(sq.r, sq.c);
    renderBoard();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = false;
    drag.wasAlreadySelected = alreadySelected;
    drag.pointerId = e.pointerId;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = sq;
    return;
  }

  // 2B. Pressing on your piece (including projected premoved pieces!) during opponent's turn -> Premove select / drag!
  if (code && canPlayerPremovePiece(pieceColor)) {
    e.preventDefault();
    const alreadyPreSelected = Boolean(
      premoveOriginSq && premoveOriginSq.r === sq.r && premoveOriginSq.c === sq.c
    );
    selectPremoveOrigin(sq.r, sq.c);
    renderBoard();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = true;
    drag.wasAlreadySelected = alreadyPreSelected;
    drag.pointerId = e.pointerId;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = sq;
    return;
  }

  // 3. Clicking empty/non-target square clears selection & cancels queued premoves
  if (selectedSq || premoveOriginSq || premoveQueue.length > 0) {
    clearSelection();
    premoveQueue = [];
    renderAll();
  }
}

function handleGlobalPointerMove(e) {
  if (rcDrag.active && e.pointerId === rcDrag.pointerId) {
    const curSq = clientPointToSquare(e.clientX, e.clientY);
    if (curSq && (curSq.r !== rcDrag.originSq.r || curSq.c !== rcDrag.originSq.c)) {
      previewArrow = { from: rcDrag.originSq, to: curSq };
    } else {
      previewArrow = null;
    }
    renderArrowsOverlay();
    return;
  }

  if (!drag.active || e.pointerId !== drag.pointerId) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  if (!drag.moved && Math.hypot(dx, dy) >= 4) {
    drag.moved = true;
    const displayBoard = isViewingLive() ? getInteractiveLiveBoard() : getDisplayedFrame().board;
    const originCode = displayBoard[drag.originSq.r]?.[drag.originSq.c];
    if (!originCode) {
      drag.active = false;
      drag.moved = false;
      return;
    }
    const boardRect = dom.board.getBoundingClientRect();
    const piecePx = (boardRect.width / 8) * 0.92;
    dom.dragGhost.style.width = `${piecePx}px`;
    dom.dragGhost.style.height = `${piecePx}px`;
    dom.dragGhost.src = getPieceSvgDataUri(originCode);
    dom.dragGhost.classList.remove('hidden');

    const sourceImg = dom.board.querySelector(
      `.square[data-r="${drag.originSq.r}"][data-c="${drag.originSq.c}"] .piece`
    );
    if (sourceImg) sourceImg.classList.add('dragging-source');
  }

  if (drag.moved) {
    dom.dragGhost.style.left = `${e.clientX}px`;
    dom.dragGhost.style.top = `${e.clientY}px`;
    updateDragHoverSquare(clientPointToSquare(e.clientX, e.clientY));
  }
}

function handleGlobalPointerUp(e) {
  if (rcDrag.active && e.pointerId === rcDrag.pointerId) {
    const origin = rcDrag.originSq;
    rcDrag.active = false;
    rcDrag.pointerId = null;
    rcDrag.originSq = null;
    previewArrow = null;

    const dropSq = clientPointToSquare(e.clientX, e.clientY);
    if (dropSq && origin) {
      toggleRightClickArrowOrMark(origin, dropSq);
    } else {
      renderArrowsOverlay();
    }
    return;
  }

  if (!drag.active || e.pointerId !== drag.pointerId) return;

  const wasDragging = drag.moved;
  const isPremove = drag.isPremoveDrag;
  const origin = drag.originSq;
  const wasSelected = drag.wasAlreadySelected;

  drag.active = false;
  drag.moved = false;
  drag.isPremoveDrag = false;
  drag.pointerId = null;
  drag.originSq = null;
  endDragVisuals();

  const dropSq = clientPointToSquare(e.clientX, e.clientY);

  if (wasDragging) {
    if (dropSq && (dropSq.r !== origin.r || dropSq.c !== origin.c)) {
      if (isPremove) {
        const validPre = premoveTargets.some((t) => t.r === dropSq.r && t.c === dropSq.c);
        if (validPre) {
          requestOrQueuePremove(origin, dropSq, true);
        } else {
          renderBoard();
        }
      } else {
        const moved = requestOrOpenPromotion(origin, dropSq, true);
        if (!moved) renderBoard();
      }
    } else if (dropSq && dropSq.r === origin.r && dropSq.c === origin.c && wasSelected) {
      clearSelection();
      renderBoard();
    } else {
      renderBoard();
    }
  } else {
    if (wasSelected && dropSq && dropSq.r === origin.r && dropSq.c === origin.c) {
      clearSelection();
      renderBoard();
    }
  }
}

// --- SVG Tactical Arrow Renderer (Automatically Flips with Board!) ---

function createSvgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function buildArrowElement(arrow, opacity = 0.82) {
  const fromCol = boardFlipped ? 7 - arrow.from.c : arrow.from.c;
  const fromRow = boardFlipped ? 7 - arrow.from.r : arrow.from.r;
  const toCol = boardFlipped ? 7 - arrow.to.c : arrow.to.c;
  const toRow = boardFlipped ? 7 - arrow.to.r : arrow.to.r;

  const x1 = fromCol * 100 + 50;
  const y1 = fromRow * 100 + 50;
  const x2 = toCol * 100 + 50;
  const y2 = toRow * 100 + 50;

  const dCol = toCol - fromCol;
  const dRow = toRow - fromRow;
  const isKnightL =
    (Math.abs(dCol) === 1 && Math.abs(dRow) === 2) ||
    (Math.abs(dCol) === 2 && Math.abs(dRow) === 1);

  const color = `rgba(248, 170, 35, ${opacity})`;
  const g = createSvgEl('g', {});

  if (isKnightL) {
    // Chess.com-style bent L-arrow for Knight jumps
    const cornerX = Math.abs(dRow) === 2 ? x1 : x2;
    const cornerY = Math.abs(dRow) === 2 ? y2 : y1;
    const ux = Math.sign(x2 - cornerX);
    const uy = Math.sign(y2 - cornerY);
    const neckX = x2 - ux * 36;
    const neckY = y2 - uy * 36;

    const polyLine = createSvgEl('polyline', {
      points: `${x1},${y1} ${cornerX},${cornerY} ${neckX},${neckY}`,
      fill: 'none',
      stroke: color,
      'stroke-width': 22,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });

    const px = -uy;
    const py = ux;
    const tipX = x2 - ux * 6;
    const tipY = y2 - uy * 6;
    const head = createSvgEl('polygon', {
      points: `${tipX},${tipY} ${neckX + px * 28},${neckY + py * 28} ${neckX - px * 28},${neckY - py * 28}`,
      fill: color
    });

    g.appendChild(polyLine);
    g.appendChild(head);
    return g;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return g;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const startX = x1 + ux * 18;
  const startY = y1 + uy * 18;
  const neckX = x2 - ux * 36;
  const neckY = y2 - uy * 36;
  const tipX = x2 - ux * 6;
  const tipY = y2 - uy * 6;

  const shaftHalf = 11;
  const headHalf = 28;

  const pts = [
    `${startX + px * shaftHalf},${startY + py * shaftHalf}`,
    `${neckX + px * shaftHalf},${neckY + py * shaftHalf}`,
    `${neckX + px * headHalf},${neckY + py * headHalf}`,
    `${tipX},${tipY}`,
    `${neckX - px * headHalf},${neckY - py * headHalf}`,
    `${neckX - px * shaftHalf},${neckY - py * shaftHalf}`,
    `${startX - px * shaftHalf},${startY - py * shaftHalf}`
  ].join(' ');

  g.appendChild(createSvgEl('polygon', { points: pts, fill: color }));
  return g;
}

function renderArrowsOverlay() {
  if (!dom.boardArrows) return;
  dom.boardArrows.replaceChildren();

  for (const arrow of drawnArrows) {
    dom.boardArrows.appendChild(buildArrowElement(arrow, 0.82));
  }
  if (previewArrow) {
    dom.boardArrows.appendChild(buildArrowElement(previewArrow, 0.55));
  }
}

// --- Board, Clocks, Replay & Sidebar Rendering ---

function renderBoard() {
  const frame = getDisplayedFrame();
  const viewingLive = isViewingLive();
  const fragment = document.createDocumentFragment();

  const showProjectedPremoves =
    viewingLive &&
    net.mode === 'online' &&
    gameState.status === 'playing' &&
    !opponentDisconnected &&
    premoveQueue.length > 0;
  const displayBoard = showProjectedPremoves ? getProjectedPremoveState().board : frame.board;

  const legalMap = new Map();
  if (viewingLive) {
    for (const m of selectedLegalMoves) {
      legalMap.set(`${m.to.r},${m.to.c}`, Boolean(m.captureSq));
    }
  }

  const premoveTargetSet = new Set();
  if (viewingLive && premoveOriginSq) {
    for (const t of premoveTargets) {
      premoveTargetSet.add(`${t.r},${t.c}`);
    }
  }

  const premoveSquareSet = new Set();
  if (viewingLive) {
    for (const step of premoveQueue) {
      premoveSquareSet.add(`${step.from.r},${step.from.c}`);
      premoveSquareSet.add(`${step.to.r},${step.to.c}`);
    }
    if (pendingPromotion && pendingPromotion.isPremove) {
      premoveSquareSet.add(`${pendingPromotion.from.r},${pendingPromotion.from.c}`);
      premoveSquareSet.add(`${pendingPromotion.to.r},${pendingPromotion.to.c}`);
    }
  }

  const rcMarkSet = new Set(markedSquares.map((s) => `${s.r},${s.c}`));

  const checkedSquares = new Set();
  if (frame.inCheck) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const code = frame.board[r][c];
        if (code && getPieceColor(code) === frame.turn) {
          const def = PIECE_DEFS[getPieceType(code)];
          if (def && def.isRoyal && displayBoard[r][c] === code) {
            checkedSquares.add(`${r},${c}`);
          }
        }
      }
    }
  }

  for (let visRow = 0; visRow < BOARD_SIZE; visRow++) {
    for (let visCol = 0; visCol < BOARD_SIZE; visCol++) {
      const r = boardFlipped ? 7 - visRow : visRow;
      const c = boardFlipped ? 7 - visCol : visCol;
      const key = `${r},${c}`;

      const sqEl = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
      sqEl.dataset.r = String(r);
      sqEl.dataset.c = String(c);

      const isSelected =
        viewingLive &&
        ((selectedSq && selectedSq.r === r && selectedSq.c === c) ||
          (premoveOriginSq && premoveOriginSq.r === r && premoveOriginSq.c === c));
      const isLastFrom =
        frame.lastMove && frame.lastMove.from.r === r && frame.lastMove.from.c === c;
      const isLastTo =
        frame.lastMove && frame.lastMove.to.r === r && frame.lastMove.to.c === c;

      if (isSelected || isLastFrom || isLastTo) {
        sqEl.classList.add('highlight');
      }

      if (rcMarkSet.has(key)) {
        sqEl.classList.add('rc-mark');
      }

      if (premoveSquareSet.has(key)) {
        sqEl.classList.add('premove');
      }

      if (checkedSquares.has(key)) {
        sqEl.classList.add('in-check');
      }

      if (
        viewingLive &&
        drag.active &&
        drag.moved &&
        drag.hoverSq &&
        drag.hoverSq.r === r &&
        drag.hoverSq.c === c
      ) {
        sqEl.classList.add('drag-target');
      }

      if (visCol === 0) {
        const rankSpan = document.createElement('span');
        rankSpan.className = 'coord coord-rank';
        rankSpan.textContent = String(BOARD_SIZE - r);
        sqEl.appendChild(rankSpan);
      }
      if (visRow === 7) {
        const fileSpan = document.createElement('span');
        fileSpan.className = 'coord coord-file';
        fileSpan.textContent = FILES[c];
        sqEl.appendChild(fileSpan);
      }

      const code = displayBoard[r][c];
      if (code) {
        const pieceColor = getPieceColor(code);
        const pieceType = getPieceType(code);
        if (canPlayerMovePiece(pieceColor) || canPlayerPremovePiece(pieceColor)) {
          sqEl.classList.add('movable');
        }
        const img = document.createElement('img');
        img.className = 'piece';
        img.src = getPieceSvgDataUri(code);
        img.alt = `${pieceColor === 'w' ? 'White' : 'Black'} ${PIECE_DEFS[pieceType]?.name || pieceType}`;
        img.draggable = false;
        const hideForDrag =
          drag.active &&
          drag.moved &&
          drag.originSq &&
          drag.originSq.r === r &&
          drag.originSq.c === c;
        const hideForPromo =
          viewingLive &&
          pendingPromotion &&
          pendingPromotion.from.r === r &&
          pendingPromotion.from.c === c;
        if (hideForDrag || hideForPromo) {
          img.classList.add('dragging-source');
        }
        sqEl.appendChild(img);
      }

      if (legalMap.has(key)) {
        sqEl.classList.add('legal-dest');
        const isCaptureMove = legalMap.get(key) || Boolean(code);
        const indicator = document.createElement('span');
        indicator.className = isCaptureMove ? 'legal-ring' : 'legal-dot';
        sqEl.appendChild(indicator);
      } else if (premoveTargetSet.has(key)) {
        sqEl.classList.add('legal-dest');
        const indicator = document.createElement('span');
        indicator.className = code ? 'legal-ring premove-ring' : 'legal-dot premove-dot';
        sqEl.appendChild(indicator);
      }

      fragment.appendChild(sqEl);
    }
  }

  dom.board.replaceChildren(fragment);
  renderArrowsOverlay();
  applyPendingSlideAnimations();
}

function formatClockText(ms) {
  const clamped = Math.max(0, ms);
  if (clamped < 20000) {
    const totalTenths = Math.ceil(clamped / 100);
    const secs = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `0:${String(secs).padStart(2, '0')}.${tenths}`;
  }
  const totalSec = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function renderSingleClock(el, color) {
  if (!el) return;
  const showClock = net.mode === 'online' && clockState.timed;
  el.classList.toggle('hidden', !showClock);
  if (!showClock) return;

  const ms = getLiveClockMs(color);
  el.textContent = formatClockText(ms);

  const isActive =
    gameState.status === 'playing' && !opponentDisconnected && gameState.turn === color;
  el.classList.toggle('active', isActive && ms > 20000);
  el.classList.toggle('low-time', (isActive && ms <= 20000) || ms <= 0);
}

function renderClockBoxesOnly() {
  const bottomColor = boardFlipped ? 'b' : 'w';
  const topColor = bottomColor === 'w' ? 'b' : 'w';
  renderSingleClock(dom.topClock, topColor);
  renderSingleClock(dom.bottomClock, bottomColor);
}

function computeMaterialTotals(board) {
  const totals = { w: 0, b: 0 };
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const code = board[r][c];
      if (!code) continue;
      const val = PIECE_DEFS[getPieceType(code)]?.value || 0;
      totals[getPieceColor(code)] += val;
    }
  }
  return totals;
}

function renderCapturedRow(containerEl, diffEl, capturedMap, sideColor, advantage) {
  containerEl.replaceChildren();
  const enemyColor = sideColor === 'w' ? 'b' : 'w';
  const capturedTypes = (capturedMap[sideColor] || [])
    .slice()
    .sort((a, b) => (PIECE_DEFS[b]?.value || 0) - (PIECE_DEFS[a]?.value || 0));

  for (const type of capturedTypes) {
    const img = document.createElement('img');
    img.className = 'captured-icon';
    img.src = getPieceSvgDataUri(enemyColor + type);
    img.alt = PIECE_DEFS[type]?.name || type;
    containerEl.appendChild(img);
  }

  diffEl.textContent = advantage > 0 ? `+${advantage}` : '';
}

function setEloElement(el, name) {
  if (!el) return;
  const elo = computeDisplayElo(name);
  el.textContent = `(${elo})`;
  el.classList.toggle('negative', elo < 0);
}

function renderPlayerBars() {
  const frame = getDisplayedFrame();
  const bottomColor = boardFlipped ? 'b' : 'w';
  const topColor = bottomColor === 'w' ? 'b' : 'w';

  dom.topSwatch.className = `color-swatch ${topColor === 'w' ? 'white' : 'black'}`;
  dom.bottomSwatch.className = `color-swatch ${bottomColor === 'w' ? 'white' : 'black'}`;

  let topLabel = '';
  let bottomLabel = '';

  if (net.mode === 'online') {
    const topIsMe = topColor === net.myColor;
    topLabel = topIsMe ? net.myName : net.peerName;
    bottomLabel = !topIsMe ? net.myName : net.peerName;
  } else {
    topLabel = topColor === 'w' ? `${net.myName} (White)` : 'Black';
    bottomLabel = bottomColor === 'w' ? `${net.myName} (White)` : 'Black';
  }

  dom.topName.textContent = topLabel;
  dom.bottomName.textContent = bottomLabel;
  setEloElement(dom.topElo, topLabel);
  setEloElement(dom.bottomElo, bottomLabel);

  const activeGame =
    gameState.status === 'playing' &&
    !opponentDisconnected &&
    net.mode !== 'waiting' &&
    net.mode !== 'setup';
  dom.topTurn.classList.toggle('hidden', !(activeGame && gameState.turn === topColor));
  dom.bottomTurn.classList.toggle('hidden', !(activeGame && gameState.turn === bottomColor));

  const totals = computeMaterialTotals(frame.board);
  renderCapturedRow(
    dom.topCaptured,
    dom.topMaterial,
    frame.captured,
    topColor,
    totals[topColor] - totals[bottomColor]
  );
  renderCapturedRow(
    dom.bottomCaptured,
    dom.bottomMaterial,
    frame.captured,
    bottomColor,
    totals[bottomColor] - totals[topColor]
  );

  renderClockBoxesOnly();
}

function formatTimeSummary(timed, minutes, incrementSec) {
  if (!timed) return 'No Clock';
  return `${minutes}+${incrementSec}`;
}

function renderStatusAndControls() {
  dom.gameIdle.classList.toggle('hidden', net.mode !== 'local' && net.mode !== 'joining');
  dom.gameSetup.classList.toggle('hidden', net.mode !== 'setup');
  dom.gameWaiting.classList.toggle('hidden', net.mode !== 'waiting');
  dom.gameConnected.classList.toggle('hidden', net.mode !== 'online');

  dom.localControls.classList.toggle('hidden', net.mode === 'online');
  dom.onlineControls.classList.toggle('hidden', net.mode !== 'online');

  dom.openSetupBtn.disabled = net.mode === 'joining';
  dom.joinBtn.disabled = net.mode === 'joining';
  dom.joinInput.disabled = net.mode === 'joining';

  const tcSummary = formatTimeSummary(
    clockState.timed,
    clockState.minutes,
    clockState.incrementSec
  );

  if (net.mode === 'online') {
    dom.modeBadge.textContent = opponentDisconnected ? 'Offline' : 'Online';
    dom.modeBadge.classList.toggle('online', !opponentDisconnected);
    dom.activeGameCode.textContent = net.roomCode || '-----';
    dom.activeTimeTag.textContent = tcSummary;
  } else if (net.mode === 'waiting') {
    dom.modeBadge.textContent = 'Waiting';
    dom.modeBadge.classList.remove('online');
    dom.codeDisplay.textContent = net.roomCode || '-----';
    const desc = clockState.timed
      ? `${clockState.minutes} min + ${clockState.incrementSec}s`
      : 'Unlimited time';
    dom.waitingSummary.textContent = `${desc} • Waiting for opponent`;
  } else if (net.mode === 'joining') {
    dom.modeBadge.textContent = 'Joining';
    dom.modeBadge.classList.remove('online');
  } else {
    dom.modeBadge.textContent = 'Local';
    dom.modeBadge.classList.remove('online');
  }

  // Incoming draw offer banner
  const incomingDraw =
    net.mode === 'online' &&
    gameState.status === 'playing' &&
    !opponentDisconnected &&
    net.drawOfferedBy &&
    net.drawOfferedBy !== net.myColor;
  dom.drawOfferBanner.classList.toggle('hidden', !incomingDraw);

  // Status banner
  dom.statusBanner.classList.remove('game-over', 'in-check', 'viewing-past');
  let statusText = '';

  if (!isViewingLive() && gameState.moveHistory.length > 0) {
    dom.statusBanner.classList.add('viewing-past');
    statusText =
      viewPly === 0
        ? `Viewing start position (0/${gameState.moveHistory.length}) — click >| for live`
        : `Viewing move ${viewPly}/${gameState.moveHistory.length} (${gameState.moveHistory[viewPly - 1]}) — click >| for live`;
  } else if (net.mode === 'waiting') {
    statusText = 'Share your game code or invite link with a friend.';
  } else if (net.mode === 'joining') {
    statusText = `Connecting to game ${net.roomCode || ''}...`;
  } else if (opponentDisconnected) {
    statusText = 'Opponent disconnected from the game.';
    dom.statusBanner.classList.add('game-over');
  } else if (gameState.status === 'playing') {
    const sideLabel = gameState.turn === 'w' ? 'White' : 'Black';
    if (net.mode === 'online') {
      const turnText = gameState.turn === net.myColor ? 'Your turn' : "Opponent's turn";
      statusText = `${turnText} (${sideLabel})`;
      if (premoveQueue.length === 1) {
        statusText += ' • 1 premove queued';
      } else if (premoveQueue.length > 1) {
        statusText += ` • ${premoveQueue.length} premoves queued`;
      }
    } else {
      statusText = `${sideLabel} to move`;
    }
    if (gameState.inCheck) {
      statusText += ' — Check!';
      dom.statusBanner.classList.add('in-check');
    }
  } else {
    dom.statusBanner.classList.add('game-over');
    const winLabel = gameState.winner === 'w' ? 'White' : 'Black';
    if (gameState.status === 'checkmate') {
      statusText = `Checkmate — ${winLabel} wins!`;
    } else if (gameState.status === 'timeout') {
      statusText = `Time out — ${winLabel} wins on time!`;
    } else if (gameState.status === 'resigned') {
      statusText = `${gameState.winner === 'w' ? 'Black' : 'White'} resigned — ${winLabel} wins!`;
    } else if (gameState.status === 'draw_agreement') {
      statusText = 'Draw by mutual agreement';
    } else if (gameState.status === 'stalemate') {
      statusText = 'Draw by stalemate';
    } else if (gameState.status === 'draw_repetition') {
      statusText = 'Draw by threefold repetition';
    } else if (gameState.status === 'draw_50') {
      statusText = 'Draw by 50-move rule';
    } else if (gameState.status === 'draw_material') {
      statusText = 'Draw by insufficient material';
    }
  }

  if (
    isViewingLive() &&
    net.mode === 'online' &&
    !opponentDisconnected &&
    gameState.status !== 'playing' &&
    net.peerRematchWanted
  ) {
    statusText += ' • Opponent wants a rematch!';
  }

  dom.statusBanner.textContent = statusText;

  // Replay Navigation Buttons
  const totalPlies = gameState.moveHistory.length;
  dom.navFirstBtn.disabled = viewPly <= 0;
  dom.navPrevBtn.disabled = viewPly <= 0;
  dom.navNextBtn.disabled = viewPly >= totalPlies;
  dom.navLastBtn.disabled = viewPly >= totalPlies;
  dom.navLastBtn.classList.toggle('live-behind', viewPly < totalPlies);

  // Online Action Buttons (Offer Draw, Resign, Rematch)
  if (net.mode === 'online') {
    const isPlaying = gameState.status === 'playing' && !opponentDisconnected;
    dom.resignBtn.disabled = !isPlaying;
    if (!isPlaying) resetResignConfirm();

    if (!isPlaying) {
      dom.drawBtn.disabled = true;
      dom.drawBtn.textContent = 'Offer Draw';
    } else if (net.drawOfferedBy === net.myColor) {
      dom.drawBtn.disabled = true;
      dom.drawBtn.textContent = 'Draw Sent';
    } else {
      dom.drawBtn.disabled = false;
      dom.drawBtn.textContent = 'Offer Draw';
    }

    if (opponentDisconnected || isPlaying) {
      dom.rematchBtn.disabled = true;
      dom.rematchBtn.textContent = 'Rematch';
    } else if (net.myRematchWanted) {
      dom.rematchBtn.disabled = true;
      dom.rematchBtn.textContent = 'Sent...';
    } else if (net.peerRematchWanted) {
      dom.rematchBtn.disabled = false;
      dom.rematchBtn.textContent = 'Accept Rematch';
    } else {
      dom.rematchBtn.disabled = false;
      dom.rematchBtn.textContent = 'Rematch';
    }
  }
}

function renderMoveHistory() {
  const moves = gameState.moveHistory;
  if (moves.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'move-empty';
    empty.textContent = 'No moves played yet.';
    dom.moveList.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement('div');
    row.className = 'move-row';

    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${Math.floor(i / 2) + 1}.`;

    const wPly = i + 1;
    const wMove = document.createElement('span');
    wMove.className = 'move-san' + (viewPly === wPly ? ' active-ply' : '');
    wMove.textContent = moves[i];
    wMove.addEventListener('click', () => stepHistoryTo(wPly));

    const bPly = i + 2;
    const bMove = document.createElement('span');
    if (moves[i + 1]) {
      bMove.className = 'move-san' + (viewPly === bPly ? ' active-ply' : '');
      bMove.textContent = moves[i + 1];
      bMove.addEventListener('click', () => stepHistoryTo(bPly));
    } else {
      bMove.className = 'move-san empty';
      bMove.textContent = '';
    }

    row.append(num, wMove, bMove);
    frag.appendChild(row);
  }

  dom.moveList.replaceChildren(frag);
  const activeEl = dom.moveList.querySelector('.move-san.active-ply');
  if (activeEl && activeEl.scrollIntoView) {
    activeEl.scrollIntoView({ block: 'nearest' });
  } else if (viewPly === moves.length) {
    dom.moveList.scrollTop = dom.moveList.scrollHeight;
  }
}

function renderAll() {
  renderBoard();
  renderPlayerBars();
  renderStatusAndControls();
  renderMoveHistory();
}

// --- Move History Replay (< / > & Arrow Keys) ---

function stepHistoryTo(targetPly) {
  const maxPly = gameState.moveHistory.length;
  const clamped = Math.max(0, Math.min(maxPly, targetPly));
  if (clamped === viewPly) return;

  const delta = clamped - viewPly;
  const prevPly = viewPly;
  viewPly = clamped;
  cancelActiveDrag();
  clearSelection();
  closePromotionPicker();

  if (delta === 1) {
    const frame = gameState.historyFrames[clamped];
    queueSlideAnimationFromFrame(frame, false);
    if (frame?.inCheck) playSound('check');
    else if (frame?.meta?.promotion) playSound('promote');
    else if (frame?.meta?.castleSide) playSound('castle');
    else if (frame?.meta?.isCapture) playSound('capture');
    else playSound('moveSelf');
  } else if (delta === -1) {
    const undoneFrame = gameState.historyFrames[prevPly];
    queueSlideAnimationFromFrame(undoneFrame, true);
    playSound('moveSelf');
  }

  renderAll();
}

// --- PGN Export ---

function buildPGNString() {
  const whiteName =
    net.mode === 'online'
      ? net.myColor === 'w'
        ? net.myName
        : net.peerName
      : `${net.myName}`;
  const blackName =
    net.mode === 'online'
      ? net.myColor === 'b'
        ? net.myName
        : net.peerName
      : 'Black';

  let result = '*';
  if (gameState.status !== 'playing') {
    if (gameState.winner === 'w') result = '1-0';
    else if (gameState.winner === 'b') result = '0-1';
    else result = '1/2-1/2';
  }

  const tc =
    net.mode === 'online' && clockState.timed
      ? `${clockState.minutes * 60}+${clockState.incrementSec}`
      : '-';

  const headers = [
    `[White "${whiteName.replace(/"/g, '')}"]`,
    `[Black "${blackName.replace(/"/g, '')}"]`,
    `[TimeControl "${tc}"]`,
    `[Result "${result}"]`
  ];

  const moveTokens = [];
  for (let i = 0; i < gameState.moveHistory.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1;
    const w = gameState.moveHistory[i];
    const b = gameState.moveHistory[i + 1];
    moveTokens.push(b ? `${moveNo}. ${w} ${b}` : `${moveNo}. ${w}`);
  }
  if (result !== '*' || moveTokens.length > 0) {
    moveTokens.push(result);
  }

  return `${headers.join('\n')}\n\n${moveTokens.join(' ')}`.trim();
}

// --- Controls, Setup Panel, Themes & Event Listeners ---

function setGameFeedback(msg) {
  if (!dom.gameFeedback) return;
  if (!msg) {
    dom.gameFeedback.textContent = '';
    dom.gameFeedback.classList.add('hidden');
  } else {
    dom.gameFeedback.textContent = msg;
    dom.gameFeedback.classList.remove('hidden');
  }
}

function buildInviteUrl(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('game', code);
  return url.toString();
}

async function copyTextWithFeedback(text, btnEl, defaultLabel) {
  try {
    await navigator.clipboard.writeText(text);
    btnEl.textContent = 'Copied!';
    setTimeout(() => {
      btnEl.textContent = defaultLabel;
    }, 1500);
  } catch (_) {
    setGameFeedback(text);
  }
}

function syncMyNameFromInput() {
  if (!dom.nameInput) return;
  net.myName = sanitizePlayerName(dom.nameInput.value);
  setEloElement(dom.eloPreview, net.myName);
  try {
    localStorage.setItem('chess_display_name', dom.nameInput.value.slice(0, 18));
  } catch (_) {}
}

function syncSetupPanelUI() {
  dom.minutesSlider.value = String(setupConfig.minutes);
  dom.incrementSlider.value = String(setupConfig.incrementSec);
  dom.minutesLabel.textContent = `${setupConfig.minutes} min`;
  dom.incrementLabel.textContent = `+${setupConfig.incrementSec} sec`;
  dom.slidersGroup.classList.toggle('disabled', !setupConfig.timed);

  for (const chip of dom.presetRow.querySelectorAll('.preset-chip')) {
    const isUnlim = chip.dataset.unlimited === '1';
    if (isUnlim) {
      chip.classList.toggle('active', !setupConfig.timed);
    } else {
      const m = Number(chip.dataset.min);
      const inc = Number(chip.dataset.inc);
      chip.classList.toggle(
        'active',
        setupConfig.timed && setupConfig.minutes === m && setupConfig.incrementSec === inc
      );
    }
  }

  for (const btn of dom.sideButtons.querySelectorAll('.side-btn')) {
    btn.classList.toggle('active', btn.dataset.side === setupConfig.sidePref);
  }
}

function resetResignConfirm() {
  if (resignConfirmTimer) {
    clearTimeout(resignConfirmTimer);
    resignConfirmTimer = null;
  }
  if (dom.resignBtn) {
    dom.resignBtn.textContent = 'Resign';
    dom.resignBtn.classList.remove('btn-danger');
  }
}

function handleResignClick() {
  if (net.mode !== 'online' || gameState.status !== 'playing' || opponentDisconnected) return;

  if (!resignConfirmTimer) {
    dom.resignBtn.textContent = 'Confirm?';
    dom.resignBtn.classList.add('btn-danger');
    resignConfirmTimer = setTimeout(resetResignConfirm, 3000);
    return;
  }

  resetResignConfirm();

  if (net.role === 'host') {
    gameState.status = 'resigned';
    gameState.winner = net.myColor === 'w' ? 'b' : 'w';
    clockState.running = false;
    net.drawOfferedBy = null;
    reconcileInteractionAfterTurnChange();
    playSound('gameEnd');
    broadcastHostState();
    renderAll();
  } else {
    sendPacket(net.conn, { type: 'resign' });
  }
}

function handleOfferDrawClick() {
  if (net.mode !== 'online' || gameState.status !== 'playing' || opponentDisconnected) return;
  if (net.drawOfferedBy === net.myColor) return;

  if (net.role === 'host') {
    if (net.drawOfferedBy && net.drawOfferedBy !== net.myColor) {
      gameState.status = 'draw_agreement';
      gameState.winner = null;
      clockState.running = false;
      net.drawOfferedBy = null;
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
    } else {
      net.drawOfferedBy = net.myColor;
    }
    broadcastHostState();
    renderAll();
  } else {
    net.drawOfferedBy = net.myColor;
    sendPacket(net.conn, { type: 'draw_offer' });
    renderAll();
  }
}

function handleAcceptDraw() {
  if (net.mode !== 'online' || gameState.status !== 'playing' || opponentDisconnected) return;
  if (!net.drawOfferedBy || net.drawOfferedBy === net.myColor) return;

  if (net.role === 'host') {
    gameState.status = 'draw_agreement';
    gameState.winner = null;
    clockState.running = false;
    net.drawOfferedBy = null;
    reconcileInteractionAfterTurnChange();
    playSound('gameEnd');
    broadcastHostState();
    renderAll();
  } else {
    sendPacket(net.conn, { type: 'draw_accept' });
  }
}

function handleDeclineDraw() {
  if (net.mode !== 'online') return;
  if (net.role === 'host') {
    net.drawOfferedBy = null;
    broadcastHostState();
    renderAll();
  } else {
    net.drawOfferedBy = null;
    sendPacket(net.conn, { type: 'draw_decline' });
    renderAll();
  }
}

function handleRematchClick() {
  if (net.mode !== 'online' || gameState.status === 'playing' || opponentDisconnected) return;
  if (net.myRematchWanted) return;

  net.myRematchWanted = true;

  if (net.role === 'host') {
    if (net.peerRematchWanted) {
      startNewMatchAsHost(true);
    } else {
      sendPacket(net.conn, { type: 'rematch_request' });
      renderAll();
    }
  } else {
    sendPacket(net.conn, { type: 'rematch_request' });
    renderAll();
  }
}

function applyBoardTheme(themeName) {
  const valid = ['green', 'brown', 'slate'].includes(themeName) ? themeName : 'green';
  if (valid === 'green') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme', valid);

  for (const btn of document.querySelectorAll('.theme-dot')) {
    btn.classList.toggle('active', btn.dataset.theme === valid);
  }
  try {
    localStorage.setItem('chess_board_theme', valid);
  } catch (_) {}
}

function updateSoundToggleUI() {
  if (!dom.soundOnIcon || !dom.soundOffIcon) return;
  dom.soundOnIcon.classList.toggle('hidden', !soundEnabled);
  dom.soundOffIcon.classList.toggle('hidden', soundEnabled);
}

function checkAutoJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawCode = params.get('game') || params.get('code');
  if (!rawCode) return;

  try {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (_) {}

  const code = extractCleanGameCode(rawCode);
  if (code.length === 5) {
    joinGameRoom(code);
  }
}

function initUI() {
  cacheDom();

  // Restore saved preferences (name, theme, sound)
  try {
    const savedName = localStorage.getItem('chess_display_name');
    if (savedName) dom.nameInput.value = savedName.slice(0, 18);
    const savedTheme = localStorage.getItem('chess_board_theme');
    if (savedTheme) applyBoardTheme(savedTheme);
    const savedSound = localStorage.getItem('chess_sound_enabled');
    if (savedSound === '0') soundEnabled = false;
  } catch (_) {}

  syncMyNameFromInput();
  updateSoundToggleUI();
  syncSetupPanelUI();

  // Board pointer & right-click contextmenu handlers
  dom.board.addEventListener('pointerdown', handleBoardPointerDown);
  dom.boardShell.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('pointermove', handleGlobalPointerMove);
  window.addEventListener('pointerup', handleGlobalPointerUp);
  window.addEventListener('pointercancel', handleGlobalPointerUp);

  dom.promoBackdrop.addEventListener('click', () => {
    closePromotionPicker();
    renderAll();
  });

  dom.promoBackdrop.addEventListener('pointerdown', (e) => {
    if (e.button === 2) {
      e.preventDefault();
      closePromotionPicker();
      premoveQueue = [];
      clearSelection();
      renderAll();
    }
  });

  // Keyboard Arrow Keys for Move History Replay (< / >) & Escape to cancel selection/premoves
  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (pendingPromotion) {
        closePromotionPicker();
        renderAll();
      } else if (premoveQueue.length > 0 || premoveOriginSq || selectedSq || drag.active) {
        premoveQueue = [];
        cancelActiveDrag();
        clearSelection();
        renderAll();
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepHistoryTo(viewPly - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepHistoryTo(viewPly + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepHistoryTo(0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepHistoryTo(gameState.moveHistory.length);
    }
  });

  // Theme & Sound Header Controls
  for (const dot of document.querySelectorAll('.theme-dot')) {
    dot.addEventListener('click', () => applyBoardTheme(dot.dataset.theme));
  }

  dom.soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateSoundToggleUI();
    try {
      localStorage.setItem('chess_sound_enabled', soundEnabled ? '1' : '0');
    } catch (_) {}
    if (soundEnabled) playSound('moveSelf');
  });

  // Temporary Display Name (+ live 0 / -67 Elo update!)
  dom.nameInput.addEventListener('input', () => {
    syncMyNameFromInput();
    renderPlayerBars();
    if (net.mode === 'online') {
      if (net.role === 'host') broadcastHostState();
      else sendPacket(net.conn, { type: 'name_update', name: net.myName });
    }
  });

  // Open / Configure Match Setup Panel
  dom.openSetupBtn.addEventListener('click', () => {
    setGameFeedback('');
    net.mode = 'setup';
    syncSetupPanelUI();
    renderAll();
  });

  dom.setupBackBtn.addEventListener('click', () => {
    net.mode = 'local';
    setGameFeedback('');
    renderAll();
  });

  dom.presetRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    if (chip.dataset.unlimited === '1') {
      setupConfig.timed = false;
    } else {
      setupConfig.timed = true;
      setupConfig.minutes = Math.min(60, Math.max(1, Number(chip.dataset.min) || 10));
      setupConfig.incrementSec = Math.min(60, Math.max(0, Number(chip.dataset.inc) || 0));
    }
    syncSetupPanelUI();
  });

  dom.minutesSlider.addEventListener('input', () => {
    setupConfig.timed = true;
    setupConfig.minutes = Math.min(60, Math.max(1, Number(dom.minutesSlider.value) || 10));
    syncSetupPanelUI();
  });

  dom.incrementSlider.addEventListener('input', () => {
    setupConfig.timed = true;
    setupConfig.incrementSec = Math.min(60, Math.max(0, Number(dom.incrementSlider.value) || 0));
    syncSetupPanelUI();
  });

  dom.sideButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.side-btn');
    if (!btn) return;
    setupConfig.sidePref = btn.dataset.side || 'w';
    syncSetupPanelUI();
  });

  dom.createGameBtn.addEventListener('click', () => createGameRoom(0));

  // Join Game Form
  dom.joinInput.addEventListener('input', () => {
    dom.joinInput.value = extractCleanGameCode(dom.joinInput.value);
  });

  dom.joinInput.addEventListener('paste', (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted) {
      e.preventDefault();
      dom.joinInput.value = extractCleanGameCode(pasted);
    }
  });

  dom.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    joinGameRoom(dom.joinInput.value);
  });

  dom.copyCodeBtn.addEventListener('click', () => {
    if (net.roomCode) copyTextWithFeedback(net.roomCode, dom.copyCodeBtn, 'Copy');
  });

  dom.copyLinkBtn.addEventListener('click', () => {
    if (net.roomCode) {
      copyTextWithFeedback(buildInviteUrl(net.roomCode), dom.copyLinkBtn, 'Copy Invite Link');
    }
  });

  dom.cancelGameBtn.addEventListener('click', () => {
    const savedName = net.myName;
    cleanupNetworkSession();
    net.myName = savedName;
    setGameFeedback('');
    gameState = createInitialState();
    viewPly = 0;
    renderAll();
  });

  dom.leaveGameBtn.addEventListener('click', () => {
    const savedName = net.myName;
    cleanupNetworkSession();
    net.myName = savedName;
    setGameFeedback('');
    boardFlipped = false;
    gameState = createInitialState();
    viewPly = 0;
    renderAll();
  });

  // Replay Navigation Buttons + PGN Copy
  dom.navFirstBtn.addEventListener('click', () => stepHistoryTo(0));
  dom.navPrevBtn.addEventListener('click', () => stepHistoryTo(viewPly - 1));
  dom.navNextBtn.addEventListener('click', () => stepHistoryTo(viewPly + 1));
  dom.navLastBtn.addEventListener('click', () => stepHistoryTo(gameState.moveHistory.length));

  dom.copyPgnBtn.addEventListener('click', () => {
    copyTextWithFeedback(buildPGNString(), dom.copyPgnBtn, 'Copy PGN');
  });

  // Footer Action Controls
  dom.resetLocalBtn.addEventListener('click', () => {
    if (net.mode === 'online') return;
    clearBoardTransientUI();
    gameState = createInitialState();
    viewPly = 0;
    renderAll();
  });

  dom.flipBoardBtn.addEventListener('click', () => {
    boardFlipped = !boardFlipped;
    positionPromotionMenu();
    renderAll();
  });

  dom.drawBtn.addEventListener('click', handleOfferDrawClick);
  dom.acceptDrawBtn.addEventListener('click', handleAcceptDraw);
  dom.declineDrawBtn.addEventListener('click', handleDeclineDraw);
  dom.resignBtn.addEventListener('click', handleResignClick);
  dom.rematchBtn.addEventListener('click', handleRematchClick);

  // Live 100ms clock refresh
  if (clockState.intervalId) clearInterval(clockState.intervalId);
  clockState.intervalId = setInterval(tickClocksUIAndAuthority, 100);

  renderAll();
  checkAutoJoinFromUrl();
}

/* ============================================================================
 * SECTION 6: VECTOR PIECE ARTWORK (SVG)
 * Classic Staunton vector SVGs by Colin M.L. Burnett (BSD / CC-BY-SA)
 * ============================================================================ */

const PIECE_SVGS = {
  wp: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><path fill="#fff" stroke="#000" stroke-linecap="round" stroke-width="1.5" d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></svg>',
  wn: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#fff" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#fff" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><path fill="#000" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/></g></svg>',
  wb: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g></svg>',
  wr: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3-3v-4h21v4zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/><path d="m34 14-3 3H14l-3-3"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M31 17v12.5H14V17"/><path d="m31 29.5 1.5 2.5h-20l1.5-2.5"/><path fill="none" stroke-linejoin="miter" d="M11 14h23"/></g></svg>',
  wq: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0m16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0M16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0"/><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/></g></svg>',
  wk: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/><path fill="#fff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#fff" d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>',
  bp: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><path fill="#000" stroke="#000" stroke-linecap="round" stroke-width="1.5" d="M22.5 9a4 4 0 0 0-3.22 6.38 6.48 6.48 0 0 0-.87 10.65c-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47a6.46 6.46 0 0 0-.87-10.65A4.01 4.01 0 0 0 22.5 9z"/></svg>',
  bn: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#000" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#000" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-1-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-2 2.5-3c1 0 1 3 1 3"/><path fill="#ececec" stroke="#ececec" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.43-9.75a.5 1.5 30 1 1-.86-.5.5 1.5 30 1 1 .86.5"/><path fill="#ececec" stroke="none" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/></g></svg>',
  bb: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.4-1 10.1.4 13.5-2 3.4 2.4 10.1 1 13.5 2 0 0 1.6.5 3 2-.7 1-1.6 1-3 .5-3.4-1-10.1.5-13.5-1-3.4 1.5-10.1 0-13.5 1-1.4.5-2.3.5-3-.5 1.4-2 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke="#ececec" stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g></svg>',
  br: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="#000" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3.5-7 1.5-2.5h17l1.5 2.5zm-.5 4v-4h21v4z"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M14 29.5v-13h17v13z"/><path stroke-linecap="butt" d="M14 16.5 11 14h23l-3 2.5zM11 14V9h4v2h5V9h5v2h5V9h4v5z"/><path fill="none" stroke="#ececec" stroke-linejoin="miter" stroke-width="1" d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23"/></g></svg>',
  bq: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="#000" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" stroke-linecap="butt" d="M11 38.5a35 35 1 0 0 23 0"/><path fill="none" stroke="#ececec" d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"/></g></svg>',
  bk: '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.6V6"/><path fill="#000" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#000" d="M11.5 37a22.3 22.3 0 0 0 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path stroke-linejoin="miter" d="M20 8h5"/><path stroke="#ececec" d="M32 29.5s8.5-4 6-9.7C34.1 14 25 18 22.5 24.6v2.1-2.1C20 18 9.9 14 7 19.9c-2.5 5.6 4.8 9 4.8 9"/><path stroke="#ececec" d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>'
};

const svgDataUriCache = {};

function getPieceSvgDataUri(code) {
  if (svgDataUriCache[code]) return svgDataUriCache[code];

  let svg = PIECE_SVGS[code];

  if (!svg) {
    const isWhite = getPieceColor(code) === 'w';
    const type = getPieceType(code);
    const label = (PIECE_DEFS[type]?.symbol || type || '?')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 2);
    const fill = isWhite ? '#ffffff' : '#1e1d1b';
    const stroke = isWhite ? '#1e1d1b' : '#ececec';
    const textFill = isWhite ? '#1e1d1b' : '#ffffff';
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="45" viewBox="0 0 45 45"><circle cx="22.5" cy="22.5" r="17" fill="${fill}" stroke="#000" stroke-width="2"/><circle cx="22.5" cy="22.5" r="13.5" fill="none" stroke="${stroke}" stroke-width="1.2"/><text x="22.5" y="28" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="${textFill}">${label}</text></svg>`;
  }

  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  svgDataUriCache[code] = uri;
  return uri;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PIECE_DEFS,
    INITIAL_BOARD,
    createInitialState,
    getLegalMovesForSquare,
    getAllLegalMoves,
    getPremoveTargetsForSquare,
    getProjectedPremoveState,
    applyPremoveStepToState,
    doesPremoveRequirePromotion,
    applyMove,
    tryMakeMove,
    isInCheck,
    computeDisplayElo,
    sanitizePlayerName,
    extractCleanGameCode,
    extractCleanPartyCode: extractCleanGameCode,
    validateAndHydrateState,
    serializeAuthoritativeState
  };
}
