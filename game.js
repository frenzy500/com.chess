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
 * SECTION 1: VARIANT & PIECE DEFINITIONS (Edit here for Custom Variants!)
 * ============================================================================
 * HOW TO CREATE CUSTOM VARIANTS OR PIECES:
 *
 * A. Add or tweak a game mode in VARIANT_DEFS below:
 *    - allowSelfCapture: Capture your own non-Royal pieces too (Cannibal Chess)
 *    - allowDrops:       Captured enemy pieces enter your pocket to drop (Crazyhouse)
 *    - fogOfWar:         Hide non-visible squares & opponent moves during play
 *    - royalCaptureWins: No check/checkmate rules — win by capturing the Royal piece!
 *
 * B. Add a new piece key (for example, 'a' for Archbishop) to PIECE_DEFS below:
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
 * C. Place your new piece on INITIAL_BOARD below using 'w' + key or 'b' + key.
 *    NOTE: Premoves and < / > Move History Replay automatically work with ANY
 *    custom piece or board ability you add here—zero extra code required!
 * ============================================================================ */

const BOARD_SIZE = 8;

const VARIANT_DEFS = {
  standard: {
    name: 'Standard',
    shortName: 'Standard',
    description: 'Classic chess rules. Checkmate the opponent\'s King to win.',
    allowSelfCapture: false,
    allowDrops: false,
    fogOfWar: false,
    royalCaptureWins: false
  },
  cannibal: {
    name: 'Cannibal Chess',
    shortName: 'Cannibal',
    description: 'You can capture your own non-King pieces too. Pawns still capture forward diagonally.',
    allowSelfCapture: true,
    allowDrops: false,
    fogOfWar: false,
    royalCaptureWins: false
  },
  crazyhouse: {
    name: 'Crazyhouse',
    shortName: 'Crazyhouse',
    description: 'Captured enemy pieces join your pocket and can be dropped onto any empty square on your turn.',
    allowSelfCapture: false,
    allowDrops: true,
    fogOfWar: false,
    royalCaptureWins: false
  },
  fog: {
    name: 'Fog of War',
    shortName: 'Fog of War',
    description: 'Only see squares your pieces occupy or can legally move to. No check — capture the King to win!',
    allowSelfCapture: false,
    allowDrops: false,
    fogOfWar: true,
    royalCaptureWins: true
  },
  secret: {
    name: 'Secret Queen Chess',
    shortName: 'Secret Queen',
    description: 'Each side secretly hides a Queen inside a starting pawn. Revealed on non-pawn moves, pins, or checks.',
    allowSelfCapture: false,
    allowDrops: false,
    fogOfWar: false,
    royalCaptureWins: false,
    secretQueen: true
  },
  dice: {
    name: 'Dice Chess',
    shortName: 'Dice Chess',
    description: 'Roll 2 dice each turn (1=P, 2=N, 3=B, 4=R, 5=Q, 6=K). Doubles are wild — move any piece on the board. Capture the King to win!',
    allowSelfCapture: false,
    allowDrops: false,
    fogOfWar: false,
    royalCaptureWins: true,
    diceChess: true
  }
};

function getVariantDef(stateOrVariant) {
  const key =
    typeof stateOrVariant === 'string'
      ? stateOrVariant
      : stateOrVariant && typeof stateOrVariant.variant === 'string'
        ? stateOrVariant.variant
        : 'standard';
  return Object.prototype.hasOwnProperty.call(VARIANT_DEFS, key)
    ? VARIANT_DEFS[key]
    : VARIANT_DEFS.standard;
}

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

        if (helpers.canCaptureAt(tr, tc, color)) {
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
      const ignoreCheck = Boolean(helpers.variant?.royalCaptureWins);

      if (r !== homeRow || c !== 4) return moves;
      if (!ignoreCheck && helpers.isInCheck(state, color)) return moves;

      const rights = state.castling;
      const canKingside = color === 'w' ? rights.wK : rights.bK;
      const canQueenside = color === 'w' ? rights.wQ : rights.bQ;

      if (
        canKingside &&
        helpers.pieceAt(homeRow, 7) === color + 'r' &&
        helpers.isEmpty(homeRow, 5) &&
        helpers.isEmpty(homeRow, 6) &&
        (ignoreCheck ||
          (!helpers.isSquareAttacked(state, homeRow, 5, enemy) &&
            !helpers.isSquareAttacked(state, homeRow, 6, enemy)))
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
        (ignoreCheck ||
          (!helpers.isSquareAttacked(state, homeRow, 3, enemy) &&
            !helpers.isSquareAttacked(state, homeRow, 2, enemy)))
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
const POCKET_PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'];

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

function getDropPieceTypes() {
  const ordered = POCKET_PIECE_ORDER.filter((k) => PIECE_DEFS[k] && !PIECE_DEFS[k].isRoyal);
  for (const key of Object.keys(PIECE_DEFS)) {
    if (!PIECE_DEFS[key].isRoyal && !ordered.includes(key)) {
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

const DICE_PIECE_MAP = {
  1: 'p',
  2: 'n',
  3: 'b',
  4: 'r',
  5: 'q',
  6: 'k'
};

const PIECE_TO_DIE_MAP = {
  p: 1,
  n: 2,
  b: 3,
  r: 4,
  q: 5,
  k: 6
};

function createPendingDiceState() {
  return {
    values: null,
    rolled: false,
    isDoubles: false,
    noLegalMoves: false
  };
}

function cloneDiceState(dice) {
  if (!dice || typeof dice !== 'object') return null;
  if (dice.rolled === false || dice.values === null) {
    return createPendingDiceState();
  }
  if (!Array.isArray(dice.values) || dice.values.length !== 2) return null;
  return {
    values: [dice.values[0], dice.values[1]],
    rolled: true,
    isDoubles: Boolean(dice.isDoubles),
    noLegalMoves: Boolean(dice.noLegalMoves)
  };
}

function canCastleWithDice(dice) {
  if (!dice || dice.rolled === false || !Array.isArray(dice.values) || dice.values.length !== 2) {
    return false;
  }
  const [d1, d2] = dice.values;
  if (d1 === d2) return true;
  return (d1 === 6 && d2 === 4) || (d1 === 4 && d2 === 6);
}

function rollSingleDie() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % 6) + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
}

function setDiceRoll(state, d1, d2) {
  if (!state || !getVariantDef(state).diceChess) return state;
  const v1 = Math.max(1, Math.min(6, Math.floor(Number(d1) || 1)));
  const v2 = Math.max(1, Math.min(6, Math.floor(Number(d2) || 1)));
  state.dice = {
    values: [v1, v2],
    rolled: true,
    isDoubles: v1 === v2,
    noLegalMoves: false
  };
  if (state.status === 'playing') {
    const moves = getAllLegalMoves(state, state.turn);
    state.dice.noLegalMoves = moves.length === 0;
  }
  if (Array.isArray(state.historyFrames) && state.historyFrames.length > 0) {
    state.historyFrames[state.historyFrames.length - 1].dice = cloneDiceState(state.dice);
  }
  return state;
}

function prepareTurnDice(state, fixedValues = null) {
  if (!state || !getVariantDef(state).diceChess) return state;
  if (Array.isArray(fixedValues) && fixedValues.length === 2) {
    return setDiceRoll(state, fixedValues[0], fixedValues[1]);
  }
  state.dice = createPendingDiceState();
  return state;
}

function rollDiceForState(state, fixedValues = null) {
  if (!state || !getVariantDef(state).diceChess) return state;
  if (Array.isArray(fixedValues) && fixedValues.length === 2) {
    return setDiceRoll(state, fixedValues[0], fixedValues[1]);
  }
  return setDiceRoll(state, rollSingleDie(), rollSingleDie());
}

function applyDicePassTurn(state, fixedNextDice = null) {
  if (
    !state ||
    !getVariantDef(state).diceChess ||
    state.status !== 'playing' ||
    !state.dice ||
    state.dice.rolled === false ||
    !state.dice.noLegalMoves
  ) {
    return state;
  }
  const next = cloneState(state);
  const prevRoller = state.turn;
  const nextTurn = prevRoller === 'w' ? 'b' : 'w';
  const d1 = state.dice?.values?.[0] || 1;
  const d2 = state.dice?.values?.[1] || 1;

  // Clear lastMove on a Pass ply so < / > navigation does not highlight or reverse-slide the earlier piece move
  next.lastMove = null;
  next.enPassant = null;
  next.halfMoveClock += 1;
  if (prevRoller === 'b') {
    next.fullMoveNumber += 1;
  }
  next.turn = nextTurn;
  next.inCheck = false;

  const wildProbe = {
    ...next,
    dice: { values: [6, 6], isDoubles: true, noLegalMoves: false }
  };
  const anyPossibleMoves = getAllLegalMoves(wildProbe, nextTurn);
  if (anyPossibleMoves.length === 0) {
    next.status = 'stalemate';
    next.winner = null;
    next.dice = null;
  } else if (next.halfMoveClock >= 100) {
    next.status = 'draw_50';
    next.dice = null;
  } else {
    prepareTurnDice(next, fixedNextDice);
  }

  const san = `Pass ${d1}-${d2}`;
  next.moveHistory.push(san);
  next.historyFrames.push(
    makeHistoryFrame(next, {
      moverColor: prevRoller,
      isCapture: false,
      isDrop: false,
      dropType: null,
      castleSide: null,
      rookMove: null,
      promotion: null,
      isPass: true,
      passedDice: [d1, d2]
    })
  );

  return next;
}

function cloneLastMove(lm) {
  if (!lm) return null;
  return {
    from: lm.from ? { r: lm.from.r, c: lm.from.c } : null,
    to: lm.to ? { r: lm.to.r, c: lm.to.c } : null,
    isDrop: Boolean(lm.isDrop),
    dropType: lm.dropType || null
  };
}

// Immutable frame snapshot so < / > move replay works with ANY future variant rules
function makeHistoryFrame(state, meta = null) {
  let fogVisible = null;
  let fogVis = null;
  if (getVariantDef(state).fogOfWar) {
    if (state.fogMasked) {
      fogVisible = Array.isArray(state.fogVisible) ? state.fogVisible.slice() : null;
    } else {
      fogVis = {
        w: Array.from(computeVisibleSquares(state, 'w')),
        b: Array.from(computeVisibleSquares(state, 'b'))
      };
    }
  }

  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    inCheck: Boolean(state.inCheck),
    lastMove: cloneLastMove(state.lastMove),
    captured: { w: state.captured.w.slice(), b: state.captured.b.slice() },
    pockets: {
      w: (state.pockets?.w || []).slice(),
      b: (state.pockets?.b || []).slice()
    },
    secretQueens: state.secretQueens
      ? {
          w: state.secretQueens.w
            ? {
                sq: state.secretQueens.w.sq ? { ...state.secretQueens.w.sq } : null,
                revealed: Boolean(state.secretQueens.w.revealed),
                picked: Boolean(state.secretQueens.w.picked)
              }
            : null,
          b: state.secretQueens.b
            ? {
                sq: state.secretQueens.b.sq ? { ...state.secretQueens.b.sq } : null,
                revealed: Boolean(state.secretQueens.b.revealed),
                picked: Boolean(state.secretQueens.b.picked)
              }
            : null
        }
      : null,
    dice: cloneDiceState(state.dice),
    fogVisible,
    fogVis,
    meta: meta ? { ...meta } : null
  };
}

function createInitialState(variant = 'standard', options = {}) {
  const cleanVariant = Object.prototype.hasOwnProperty.call(VARIANT_DEFS, variant)
    ? variant
    : 'standard';
  const state = {
    variant: cleanVariant,
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
    status: cleanVariant === 'secret' && !options.ready ? 'secret_pick' : 'playing',
    winner: null,
    inCheck: false,
    lastMove: null,
    moveHistory: [],
    captured: { w: [], b: [] },
    pockets: { w: [], b: [] },
    promoted: [], // Array of "r,c" coordinates of promoted pawns currently on board
    positionCounts: {},
    historyFrames: [],
    fogMasked: false,
    fogVisible: null,
    fogLegalMoves: null,
    secretQueens:
      cleanVariant === 'secret'
        ? {
            w: {
              sq: options.whiteCol !== undefined ? { r: 6, c: options.whiteCol } : null,
              revealed: false,
              picked: options.whiteCol !== undefined || Boolean(options.ready)
            },
            b: {
              sq: options.blackCol !== undefined ? { r: 1, c: options.blackCol } : null,
              revealed: false,
              picked: options.blackCol !== undefined || Boolean(options.ready)
            }
          }
        : null,
    dice: null
  };
  if (cleanVariant === 'dice') {
    prepareTurnDice(state, options.diceValues || null);
  }
  const key = computePositionKey(state);
  state.positionCounts[key] = 1;
  state.historyFrames.push(makeHistoryFrame(state, null));
  return state;
}

function createCustomState(config = {}) {
  const cleanVariant = Object.prototype.hasOwnProperty.call(VARIANT_DEFS, config.variant)
    ? config.variant
    : 'standard';
  const customBoard = config.board ? cloneBoard(config.board) : cloneBoard(INITIAL_BOARD);
  const turn = config.turn === 'b' ? 'b' : 'w';

  const castlingInput = config.castling || {};
  const castling = {
    wK: Boolean(castlingInput.wK && customBoard[7]?.[4] === 'wk' && customBoard[7]?.[7] === 'wr'),
    wQ: Boolean(castlingInput.wQ && customBoard[7]?.[4] === 'wk' && customBoard[7]?.[0] === 'wr'),
    bK: Boolean(castlingInput.bK && customBoard[0]?.[4] === 'bk' && customBoard[0]?.[7] === 'br'),
    bQ: Boolean(castlingInput.bQ && customBoard[0]?.[4] === 'bk' && customBoard[0]?.[0] === 'br')
  };

  const pockets = {
    w: Array.isArray(config.pockets?.w) ? config.pockets.w.slice() : [],
    b: Array.isArray(config.pockets?.b) ? config.pockets.b.slice() : []
  };

  let secretQueens = null;
  if (cleanVariant === 'secret') {
    if (config.secretQueens) {
      secretQueens = {
        w: config.secretQueens.w ? { ...config.secretQueens.w } : { sq: null, revealed: false, picked: false },
        b: config.secretQueens.b ? { ...config.secretQueens.b } : { sq: null, revealed: false, picked: false }
      };
    } else {
      secretQueens = {
        w: { sq: null, revealed: false, picked: false },
        b: { sq: null, revealed: false, picked: false }
      };
    }
  }

  const state = {
    variant: cleanVariant,
    board: customBoard,
    turn,
    castling,
    enPassant: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    status:
      cleanVariant === 'secret' && (!secretQueens?.w?.picked || !secretQueens?.b?.picked)
        ? 'secret_pick'
        : 'playing',
    winner: null,
    inCheck: false,
    lastMove: null,
    moveHistory: [],
    captured: { w: [], b: [] },
    pockets,
    promoted: [],
    positionCounts: {},
    historyFrames: [],
    fogMasked: false,
    fogVisible: null,
    fogLegalMoves: null,
    secretQueens,
    dice: null
  };

  state.inCheck = !getVariantDef(state).royalCaptureWins && isInCheck(state, turn);

  if (state.status === 'playing') {
    if (cleanVariant === 'dice') {
      const wildProbe = {
        ...state,
        dice: { values: [6, 6], isDoubles: true, noLegalMoves: false }
      };
      if (getAllLegalMoves(wildProbe, turn).length === 0) {
        state.status = 'stalemate';
        state.winner = null;
      } else {
        prepareTurnDice(state, config.diceValues || null);
      }
    } else {
      const legalMoves = getAllLegalMoves(state);
      if (legalMoves.length === 0) {
        if (state.inCheck) {
          state.status = 'checkmate';
          state.winner = turn === 'w' ? 'b' : 'w';
        } else {
          state.status = 'stalemate';
          state.winner = null;
        }
      }
    }
  }

  const key = computePositionKey(state);
  state.positionCounts[key] = 1;
  state.historyFrames.push(makeHistoryFrame(state, null));
  return state;
}

function cloneState(state) {
  return {
    variant: state.variant || 'standard',
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    status: state.status,
    winner: state.winner,
    inCheck: state.inCheck,
    lastMove: cloneLastMove(state.lastMove),
    moveHistory: state.moveHistory.slice(),
    captured: { w: state.captured.w.slice(), b: state.captured.b.slice() },
    pockets: {
      w: (state.pockets?.w || []).slice(),
      b: (state.pockets?.b || []).slice()
    },
    promoted: (state.promoted || []).slice(),
    positionCounts: { ...state.positionCounts },
    historyFrames: (state.historyFrames || []).map((f) => ({
      board: cloneBoard(f.board),
      turn: f.turn,
      inCheck: f.inCheck,
      lastMove: cloneLastMove(f.lastMove),
      captured: { w: f.captured.w.slice(), b: f.captured.b.slice() },
      pockets: {
        w: (f.pockets?.w || []).slice(),
        b: (f.pockets?.b || []).slice()
      },
      secretQueens: f.secretQueens
        ? {
            w: f.secretQueens.w
              ? {
                  sq: f.secretQueens.w.sq ? { ...f.secretQueens.w.sq } : null,
                  revealed: Boolean(f.secretQueens.w.revealed),
                  picked: Boolean(f.secretQueens.w.picked)
                }
              : null,
            b: f.secretQueens.b
              ? {
                  sq: f.secretQueens.b.sq ? { ...f.secretQueens.b.sq } : null,
                  revealed: Boolean(f.secretQueens.b.revealed),
                  picked: Boolean(f.secretQueens.b.picked)
                }
              : null
          }
        : null,
      dice: cloneDiceState(f.dice),
      fogVisible: Array.isArray(f.fogVisible) ? f.fogVisible.slice() : null,
      fogVis: f.fogVis
        ? {
            w: Array.isArray(f.fogVis.w) ? f.fogVis.w.slice() : [],
            b: Array.isArray(f.fogVis.b) ? f.fogVis.b.slice() : []
          }
        : null,
      meta: f.meta ? { ...f.meta } : null
    })),
    fogMasked: Boolean(state.fogMasked),
    fogVisible: Array.isArray(state.fogVisible) ? state.fogVisible.slice() : null,
    fogLegalMoves: Array.isArray(state.fogLegalMoves) ? state.fogLegalMoves.slice() : null,
    secretQueens: state.secretQueens
      ? {
          w: state.secretQueens.w
            ? {
                sq: state.secretQueens.w.sq ? { ...state.secretQueens.w.sq } : null,
                revealed: Boolean(state.secretQueens.w.revealed),
                picked: Boolean(state.secretQueens.w.picked)
              }
            : null,
          b: state.secretQueens.b
            ? {
                sq: state.secretQueens.b.sq ? { ...state.secretQueens.b.sq } : null,
                revealed: Boolean(state.secretQueens.b.revealed),
                picked: Boolean(state.secretQueens.b.picked)
              }
            : null
        }
      : null,
    dice: cloneDiceState(state.dice)
  };
}

function computePositionKey(state) {
  const vDef = getVariantDef(state);
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

  let extra = '';
  if (vDef.allowDrops) {
    const pw = (state.pockets?.w || []).slice().sort().join('');
    const pb = (state.pockets?.b || []).slice().sort().join('');
    const pr = (state.promoted || []).slice().sort().join(';');
    extra = ` [${pw}|${pb}|${pr}]`;
  }
  if (vDef.secretQueen && state.secretQueens) {
    const sw = state.secretQueens.w;
    const sb = state.secretQueens.b;
    const wStr = sw
      ? `${sw.sq ? sw.sq.r + ',' + sw.sq.c : 'none'}:${sw.revealed ? 'rev' : 'hid'}`
      : '-';
    const bStr = sb
      ? `${sb.sq ? sb.sq.r + ',' + sb.sq.c : 'none'}:${sb.revealed ? 'rev' : 'hid'}`
      : '-';
    extra += ` [SQ:${wStr}|${bStr}]`;
  }

  return `${state.variant || 'standard'} ${rows} ${state.turn} ${cr} ${ep}${extra}`;
}

function canCaptureOccupant(occupant, moverColor, state) {
  if (!occupant) return false;
  if (getPieceColor(occupant) !== moverColor) return true;
  if (getVariantDef(state).allowSelfCapture) {
    const occDef = PIECE_DEFS[getPieceType(occupant)];
    return Boolean(occDef && !occDef.isRoyal);
  }
  return false;
}

function generatePseudoMoves(state, r, c, attacksOnly = false) {
  const code = state.board[r][c];
  if (!code) return [];

  const color = getPieceColor(code);
  const type = getPieceType(code);
  const def = PIECE_DEFS[type];
  if (!def) return [];

  const vDef = getVariantDef(state);
  const moves = [];

  const isSecretQueen = Boolean(
    vDef.secretQueen &&
    state.secretQueens &&
    state.secretQueens[color]?.sq &&
    state.secretQueens[color].sq.r === r &&
    state.secretQueens[color].sq.c === c &&
    !state.secretQueens[color].revealed
  );

  if (isSecretQueen) {
    const qDef = PIECE_DEFS.q;
    for (const [dr, dc] of qDef.slideDirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const occupant = state.board[tr][tc];
        if (!occupant) {
          const move = { from: { r, c }, to: { r: tr, c: tc }, captureSq: null, promotion: null };
          const pawnStart = color === 'w' ? 6 : 1;
          const pawnDir = color === 'w' ? -1 : 1;
          if (r === pawnStart && tr === r + 2 * pawnDir && tc === c) {
            move.enPassantTarget = { r: r + pawnDir, c };
          }
          moves.push(move);
        } else {
          const canCap = attacksOnly
            ? getPieceColor(occupant) !== color
            : canCaptureOccupant(occupant, color, state);
          if (canCap) {
            moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: { r: tr, c: tc }, promotion: null });
          }
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
    if (!attacksOnly && state.enPassant) {
      const pawnDir = color === 'w' ? -1 : 1;
      if (state.enPassant.r === r + pawnDir && Math.abs(state.enPassant.c - c) === 1) {
        const victimR = r;
        const victimC = state.enPassant.c;
        const victim = state.board[victimR]?.[victimC];
        if (victim && getPieceColor(victim) !== color && getPieceType(victim) === 'p') {
          moves.push({
            from: { r, c },
            to: { r: state.enPassant.r, c: state.enPassant.c },
            captureSq: { r: victimR, c: victimC },
            promotion: null,
            isEnPassant: true
          });
        }
      }
    }
    return moves;
  }

  if (def.leapOffsets) {
    for (const [dr, dc] of def.leapOffsets) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const occupant = state.board[tr][tc];
      if (!occupant) {
        moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: null, promotion: null });
      } else {
        const canCap = attacksOnly
          ? getPieceColor(occupant) !== color
          : canCaptureOccupant(occupant, color, state);
        if (canCap) {
          moves.push({ from: { r, c }, to: { r: tr, c: tc }, captureSq: { r: tr, c: tc }, promotion: null });
        }
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
          const canCap = attacksOnly
            ? getPieceColor(occupant) !== color
            : canCaptureOccupant(occupant, color, state);
          if (canCap) {
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
      variant: vDef,
      inBounds,
      pieceAt: (rr, cc) => (inBounds(rr, cc) ? state.board[rr][cc] : null),
      colorAt: (rr, cc) => (inBounds(rr, cc) ? getPieceColor(state.board[rr][cc]) : null),
      isEmpty: (rr, cc) => inBounds(rr, cc) && state.board[rr][cc] === null,
      isEnemy: (rr, cc, col) => {
        if (!inBounds(rr, cc) || !state.board[rr][cc]) return false;
        return getPieceColor(state.board[rr][cc]) !== col;
      },
      canCaptureAt: (rr, cc, col) => {
        if (!inBounds(rr, cc) || !state.board[rr][cc]) return false;
        if (attacksOnly) return getPieceColor(state.board[rr][cc]) !== col;
        return canCaptureOccupant(state.board[rr][cc], col, state);
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
    variant: state.variant || 'standard',
    board: soloBoard,
    turn: color,
    castling: state.castling,
    enPassant: null
  };
  for (const m of generatePseudoMoves(soloState, r, c, false)) addTarget(m.to.r, m.to.c);
  for (const m of generatePseudoMoves(soloState, r, c, true)) addTarget(m.to.r, m.to.c);

  return targets;
}

function getPremoveDropTargets(state, dropType, color) {
  if (!getVariantDef(state).allowDrops) return [];
  if (!PIECE_DEFS[dropType] || PIECE_DEFS[dropType].isRoyal) return [];
  if (!(state.pockets?.[color] || []).includes(dropType)) return [];

  const targets = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (dropType === 'p' && (r === 0 || r === BOARD_SIZE - 1)) continue;
    for (let c = 0; c < BOARD_SIZE; c++) {
      targets.push({ r, c });
    }
  }
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

function validateCustomPosition(
  board,
  turn = 'w',
  variant = 'standard',
  pockets = null,
  castling = null,
  secretQueens = null
) {
  if (!board || !Array.isArray(board) || board.length !== 8) {
    return { valid: false, error: 'Invalid board configuration.' };
  }

  let whiteKings = 0;
  let blackKings = 0;
  let whiteKingSq = null;
  let blackKingSq = null;
  let whitePawns = 0;
  let blackPawns = 0;

  for (let r = 0; r < 8; r++) {
    if (!Array.isArray(board[r]) || board[r].length !== 8) {
      return { valid: false, error: 'Invalid board dimensions.' };
    }
    for (let c = 0; c < 8; c++) {
      const code = board[r][c];
      if (!code) continue;
      if (code === 'wk') {
        whiteKings++;
        whiteKingSq = { r, c };
      } else if (code === 'bk') {
        blackKings++;
        blackKingSq = { r, c };
      } else if (code === 'wp') {
        whitePawns++;
        if (r === 0 || r === 7) {
          return { valid: false, error: 'Pawns cannot be placed on the 1st or 8th rank.' };
        }
      } else if (code === 'bp') {
        blackPawns++;
        if (r === 0 || r === 7) {
          return { valid: false, error: 'Pawns cannot be placed on the 1st or 8th rank.' };
        }
      }
    }
  }

  if (whiteKings !== 1) {
    return {
      valid: false,
      error: `Position must contain exactly one White King (found ${whiteKings}).`
    };
  }
  if (blackKings !== 1) {
    return {
      valid: false,
      error: `Position must contain exactly one Black King (found ${blackKings}).`
    };
  }

  if (
    Math.abs(whiteKingSq.r - blackKingSq.r) <= 1 &&
    Math.abs(whiteKingSq.c - blackKingSq.c) <= 1
  ) {
    return { valid: false, error: 'Kings cannot be placed on adjacent squares.' };
  }

  if (pockets) {
    const checkPocket = (list) => {
      if (!Array.isArray(list)) return true;
      for (const p of list) {
        if (p === 'k' || p === 'wk' || p === 'bk') return false;
      }
      return true;
    };
    if (!checkPocket(pockets.w) || !checkPocket(pockets.b)) {
      return { valid: false, error: 'Kings cannot be placed into Crazyhouse pockets.' };
    }
  }

  if (variant === 'secret') {
    if (whitePawns === 0 || blackPawns === 0) {
      return {
        valid: false,
        error: 'Secret Queen variant requires at least one pawn for each side.'
      };
    }
  }

  const vDef = VARIANT_DEFS[variant] || VARIANT_DEFS.standard;
  if (!vDef.royalCaptureWins) {
    const probe = {
      variant,
      board,
      castling: castling || { wK: false, wQ: false, bK: false, bQ: false },
      enPassant: null,
      secretQueens: secretQueens || null
    };

    const sideNotToMove = turn === 'w' ? 'b' : 'w';
    const sideToMove = turn === 'w' ? 'w' : 'b';

    const notToMoveInCheck = isInCheck(probe, sideNotToMove);
    const toMoveInCheck = isInCheck(probe, sideToMove);

    if (notToMoveInCheck && toMoveInCheck) {
      return { valid: false, error: 'Both kings cannot be in check at the same time.' };
    }
    if (notToMoveInCheck) {
      const name = sideNotToMove === 'w' ? 'White' : 'Black';
      return {
        valid: false,
        error: `Illegal position: ${name} King is currently in check, but it is not their turn.`
      };
    }
  }

  return { valid: true };
}

function createProbeState(state, nextBoard, move) {
  const probe = {
    variant: state.variant || 'standard',
    board: nextBoard,
    castling: state.castling,
    enPassant: null,
    secretQueens: null
  };
  if (state.secretQueens) {
    probe.secretQueens = {
      w: state.secretQueens.w
        ? {
            sq: state.secretQueens.w.sq ? { ...state.secretQueens.w.sq } : null,
            revealed: Boolean(state.secretQueens.w.revealed),
            picked: Boolean(state.secretQueens.w.picked)
          }
        : null,
      b: state.secretQueens.b
        ? {
            sq: state.secretQueens.b.sq ? { ...state.secretQueens.b.sq } : null,
            revealed: Boolean(state.secretQueens.b.revealed),
            picked: Boolean(state.secretQueens.b.picked)
          }
        : null
    };
    if (move && !move.isDrop && move.from && move.to) {
      const mover = getPieceColor(state.board[move.from.r]?.[move.from.c]);
      if (mover && probe.secretQueens[mover]?.sq) {
        if (
          probe.secretQueens[mover].sq.r === move.from.r &&
          probe.secretQueens[mover].sq.c === move.from.c
        ) {
          probe.secretQueens[mover].sq = { r: move.to.r, c: move.to.c };
        }
      }
      if (move.captureSq) {
        const enemy = mover === 'w' ? 'b' : 'w';
        if (
          probe.secretQueens[enemy]?.sq &&
          probe.secretQueens[enemy].sq.r === move.captureSq.r &&
          probe.secretQueens[enemy].sq.c === move.captureSq.c
        ) {
          probe.secretQueens[enemy].sq = null;
        }
      }
    }
  }
  return probe;
}

function isStandardPawnMove(state, from, to, captureSq) {
  if (!from || !to) return false;
  const code = state.board[from.r]?.[from.c];
  if (!code) return false;
  const color = getPieceColor(code);
  const dir = color === 'w' ? -1 : 1;
  const startRow = color === 'w' ? 6 : 1;
  const dr = to.r - from.r;
  const dc = to.c - from.c;

  // 1-step forward push to empty square
  if (dr === dir && dc === 0 && !captureSq && state.board[to.r][to.c] === null) {
    return true;
  }

  // 2-step forward push from starting rank through empty square
  if (
    from.r === startRow &&
    dr === 2 * dir &&
    dc === 0 &&
    !captureSq &&
    state.board[from.r + dir][from.c] === null &&
    state.board[to.r][to.c] === null
  ) {
    return true;
  }

  // 1-step forward diagonal capture
  if (dr === dir && Math.abs(dc) === 1 && captureSq !== null) {
    return true;
  }

  return false;
}

function revealSecretQueen(state, color) {
  if (!state.secretQueens || !state.secretQueens[color]) return;
  state.secretQueens[color].revealed = true;
  const sq = state.secretQueens[color].sq;
  if (sq && inBounds(sq.r, sq.c)) {
    const cur = state.board[sq.r][sq.c];
    if (cur && getPieceColor(cur) === color) {
      state.board[sq.r][sq.c] = color + 'q';
    }
  }
}

function assignSecretQueen(state, color, col, row = null) {
  if (!state.secretQueens) return;
  const c = Math.max(0, Math.min(7, col));
  let r = row;
  if (r === null || !inBounds(r, c) || state.board[r]?.[c] !== color + 'p') {
    const defaultR = color === 'w' ? 6 : 1;
    if (state.board[defaultR]?.[c] === color + 'p') {
      r = defaultR;
    } else {
      r = defaultR;
      for (let scanR = 0; scanR < BOARD_SIZE; scanR++) {
        if (state.board[scanR]?.[c] === color + 'p') {
          r = scanR;
          break;
        }
      }
    }
  }
  state.secretQueens[color] = {
    sq: { r, c },
    revealed: false,
    picked: true
  };
}

function checkSecretQueenPinInteraction(state, from, to) {
  if (!state || !from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) return null;
  const vDef = getVariantDef(state);
  if (!vDef.secretQueen || !state.secretQueens) return null;

  const moverPiece = state.board[from.r]?.[from.c];
  if (!moverPiece) return null;
  const moverColor = getPieceColor(moverPiece);
  const enemyColor = moverColor === 'w' ? 'b' : 'w';

  const enemySQ = state.secretQueens[enemyColor];
  if (!enemySQ || !enemySQ.sq || enemySQ.revealed) return null;

  // Build hypothetical state where enemy secret queen is strictly a normal pawn
  const hypoState = cloneState(state);
  hypoState.secretQueens = null;

  const hypoPseudos = generatePseudoMoves(hypoState, from.r, from.c, false);
  const hypoMatching = hypoPseudos.filter((m) => m.to.r === to.r && m.to.c === to.c);
  if (hypoMatching.length === 0) return null;

  const hypoNextBoard = executeMoveOnBoard(hypoState, hypoMatching[0]);
  const hypoProbe = {
    variant: 'standard',
    board: hypoNextBoard,
    castling: hypoState.castling,
    enPassant: null
  };
  if (isInCheck(hypoProbe, moverColor)) {
    return null;
  }

  // In the real state, does any move to (to.r, to.c) leave King safe?
  const realPseudos = generatePseudoMoves(state, from.r, from.c, false);
  const realMatching = realPseudos.filter((m) => m.to.r === to.r && m.to.c === to.c);
  let realLegal = false;
  for (const rm of realMatching) {
    const realNextBoard = executeMoveOnBoard(state, rm);
    const realProbe = createProbeState(state, realNextBoard, rm);
    if (!isInCheck(realProbe, moverColor)) {
      realLegal = true;
      break;
    }
  }

  if (!realLegal) {
    return {
      triggered: true,
      secretColor: enemyColor,
      sq: { ...enemySQ.sq }
    };
  }

  return null;
}

function executeMoveOnBoard(state, move, moverColorOverride = null) {
  const nextBoard = cloneBoard(state.board);

  if (move.isDrop) {
    const dropColor = move.color || moverColorOverride || state.turn;
    nextBoard[move.to.r][move.to.c] = dropColor + move.dropType;
    return nextBoard;
  }

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
  if (!code) return [];

  const vDef = getVariantDef(state);
  const pieceColor = getPieceColor(code);
  const pieceType = getPieceType(code);
  if (vDef.diceChess) {
    if (!state.dice || state.dice.rolled === false || !Array.isArray(state.dice.values)) {
      return [];
    }
  }
  const isDice = Boolean(vDef.diceChess && state.dice && Array.isArray(state.dice.values));
  const isWildTurn = Boolean(isDice && state.dice.isDoubles);

  if (!isWildTurn) {
    if (pieceColor !== state.turn) return [];
    if (isDice) {
      const [d1, d2] = state.dice.values;
      const allowed1 = DICE_PIECE_MAP[d1];
      const allowed2 = DICE_PIECE_MAP[d2];
      if (pieceType !== allowed1 && pieceType !== allowed2) return [];
    }
  }

  if (state.fogMasked && Array.isArray(state.fogLegalMoves)) {
    return state.fogLegalMoves.filter(
      (m) => !m.isDrop && m.from && m.from.r === r && m.from.c === c
    );
  }

  const color = state.turn;
  const pseudo = generatePseudoMoves(state, r, c, false);
  const legal = [];

  for (const move of pseudo) {
    if (isDice && move.castleSide) {
      if (pieceColor !== state.turn || !canCastleWithDice(state.dice)) continue;
    }

    if (isDice && pieceColor !== state.turn) {
      if (move.castleSide || move.isEnPassant) continue;
      if (move.captureSq) {
        const capCode = state.board[move.captureSq.r]?.[move.captureSq.c];
        if (capCode && PIECE_DEFS[getPieceType(capCode)]?.isRoyal) {
          continue;
        }
      }
    }

    const nextBoard = executeMoveOnBoard(state, move);
    const probeState = createProbeState(state, nextBoard, move);

    const def = PIECE_DEFS[pieceType];
    if (def && typeof def.afterMove === 'function') {
      def.afterMove(probeState, move);
    }

    if (vDef.royalCaptureWins || !isInCheck(probeState, color)) {
      legal.push(move);
    }
  }

  return legal;
}

function getLegalDropMoves(state, dropType, color = state.turn) {
  if (state.status !== 'playing') return [];
  const vDef = getVariantDef(state);
  if (!vDef.allowDrops) return [];
  if (!PIECE_DEFS[dropType] || PIECE_DEFS[dropType].isRoyal) return [];

  if (state.fogMasked && Array.isArray(state.fogLegalMoves)) {
    return state.fogLegalMoves.filter((m) => m.isDrop && m.dropType === dropType);
  }

  const pocket = state.pockets?.[color] || [];
  if (!pocket.includes(dropType)) return [];

  const legal = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (dropType === 'p' && (r === 0 || r === BOARD_SIZE - 1)) continue;
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board[r][c] !== null) continue;
      const move = {
        isDrop: true,
        dropType,
        color,
        from: null,
        to: { r, c },
        captureSq: null,
        promotion: null
      };
      if (!vDef.royalCaptureWins) {
        const nextBoard = executeMoveOnBoard(state, move, color);
        const probeState = createProbeState(state, nextBoard, move);
        const def = PIECE_DEFS[dropType];
        if (def && typeof def.afterMove === 'function') {
          def.afterMove(probeState, move);
        }
        if (isInCheck(probeState, color)) continue;
      }
      legal.push(move);
    }
  }
  return legal;
}

function getAllLegalMoves(state, color = state.turn) {
  if (state.fogMasked && Array.isArray(state.fogLegalMoves) && color === state.turn) {
    return state.fogLegalMoves.slice();
  }

  const savedTurn = state.turn;
  const savedStatus = state.status;
  const tempState =
    savedTurn === color && savedStatus === 'playing'
      ? state
      : { ...state, turn: color, status: 'playing' };

  const isDiceWild = Boolean(
    getVariantDef(tempState).diceChess &&
    tempState.dice &&
    tempState.dice.isDoubles
  );

  const all = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const sqColor = getPieceColor(tempState.board[r][c]);
      if (sqColor === color || (isDiceWild && sqColor !== null)) {
        all.push(...getLegalMovesForSquare(tempState, r, c));
      }
    }
  }

  if (getVariantDef(tempState).allowDrops) {
    const distinctTypes = Array.from(new Set(tempState.pockets?.[color] || []));
    for (const dt of distinctTypes) {
      all.push(...getLegalDropMoves(tempState, dt, color));
    }
  }

  return all;
}

// Chess.com Fog of War visibility:
// Returns Set of "r,c" keys visible to viewerColor:
//  1) All squares occupied by viewerColor's own pieces
//  2) All destination squares of viewerColor's legal moves (plus captured pawn square for En Passant)
function computeVisibleSquares(state, viewerColor) {
  const vis = new Set();
  if (!getVariantDef(state).fogOfWar) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        vis.add(`${r},${c}`);
      }
    }
    return vis;
  }

  if (state.fogMasked && Array.isArray(state.fogVisible)) {
    for (const key of state.fogVisible) {
      vis.add(key);
    }
    return vis;
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getPieceColor(state.board[r][c]) === viewerColor) {
        vis.add(`${r},${c}`);
      }
    }
  }

  const moves = getAllLegalMoves(state, viewerColor);
  for (const m of moves) {
    if (m.to) {
      vis.add(`${m.to.r},${m.to.c}`);
    }
    if (m.isEnPassant && m.captureSq) {
      vis.add(`${m.captureSq.r},${m.captureSq.c}`);
    }
  }
  return vis;
}

function hasInsufficientMaterial(stateOrBoard) {
  const isState =
    stateOrBoard && !Array.isArray(stateOrBoard) && Array.isArray(stateOrBoard.board);
  const board = isState ? stateOrBoard.board : stateOrBoard;
  const vDef = isState ? getVariantDef(stateOrBoard) : VARIANT_DEFS.standard;

  if (isState && vDef.allowDrops) {
    if ((stateOrBoard.pockets?.w?.length || 0) > 0 || (stateOrBoard.pockets?.b?.length || 0) > 0) {
      return false;
    }
  }

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
  if (vDef.royalCaptureWins) return false;

  if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return true;

  // In Crazyhouse, K+B vs K+B can capture a Bishop and drop it on the opposite color complex
  if (vDef.allowDrops) return false;

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
  const vDef = getVariantDef(prevState);
  const addCheckSuffix = (str) => {
    if (vDef.royalCaptureWins) return str;
    if (nextState.status === 'checkmate') return str + '#';
    if (nextState.inCheck) return str + '+';
    return str;
  };

  if (move.isDrop) {
    const def = PIECE_DEFS[move.dropType];
    const sym = move.dropType === 'p' ? '' : def?.symbol || move.dropType.toUpperCase();
    return addCheckSuffix(`${sym}@${coordToAlgebraic(move.to.r, move.to.c)}`);
  }

  if (move.castleSide === 'K') {
    return addCheckSuffix('O-O');
  }
  if (move.castleSide === 'Q') {
    return addCheckSuffix('O-O-O');
  }

  const movingCode = prevState.board[move.from.r][move.from.c];
  let type = getPieceType(movingCode);
  const moverColor = getPieceColor(movingCode);
  if (
    type === 'p' &&
    nextState.secretQueens?.[moverColor]?.revealed &&
    !prevState.secretQueens?.[moverColor]?.revealed
  ) {
    type = 'q';
  }
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

    const targetCode = moverColor + type;
    const peers = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r !== move.from.r || c !== move.from.c) && prevState.board[r][c] === targetCode) {
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

  return addCheckSuffix(san);
}

function applyMove(state, move, options = {}) {
  const next = cloneState(state);
  const vDef = getVariantDef(next);
  const promoSet = new Set(next.promoted || []);
  const turnColor = state.turn;

  let moverColor = turnColor;
  let pieceColor = turnColor;
  let moverType;
  let capturedType = null;

  if (move.isDrop) {
    moverColor = move.color || turnColor;
    pieceColor = moverColor;
    moverType = move.dropType;

    const pIdx = next.pockets[moverColor].indexOf(moverType);
    if (pIdx >= 0) {
      next.pockets[moverColor].splice(pIdx, 1);
    }

    next.board[move.to.r][move.to.c] = moverColor + moverType;
    promoSet.delete(`${move.to.r},${move.to.c}`);
    next.promoted = Array.from(promoSet);

    const def = PIECE_DEFS[moverType];
    if (def && typeof def.afterMove === 'function') {
      def.afterMove(next, move);
    }

    next.enPassant = null;
    if (moverType === 'p') {
      next.halfMoveClock = 0;
    } else {
      next.halfMoveClock += 1;
    }
    if (turnColor === 'b') {
      next.fullMoveNumber += 1;
    }

    next.lastMove = {
      from: null,
      to: { ...move.to },
      isDrop: true,
      dropType: moverType
    };
  } else {
    const movingCode = state.board[move.from.r][move.from.c];
    pieceColor = getPieceColor(movingCode);
    moverColor = turnColor;
    moverType = getPieceType(movingCode);

    const isSQMove = Boolean(
      vDef.secretQueen &&
      next.secretQueens &&
      !move.isDrop &&
      next.secretQueens[pieceColor]?.sq &&
      next.secretQueens[pieceColor].sq.r === move.from.r &&
      next.secretQueens[pieceColor].sq.c === move.from.c
    );

    const fromKey = `${move.from.r},${move.from.c}`;
    const toKey = `${move.to.r},${move.to.c}`;
    const moverWasPromoted = promoSet.has(fromKey) || Boolean(move.promotion);
    let wasPromotedCapture = false;

    if (move.captureSq) {
      const capKey = `${move.captureSq.r},${move.captureSq.c}`;
      wasPromotedCapture = promoSet.has(capKey);
      promoSet.delete(capKey);

      const capCode = next.board[move.captureSq.r][move.captureSq.c];
      if (capCode) {
        const capColor = getPieceColor(capCode);
        capturedType = getPieceType(capCode);
        if (
          vDef.secretQueen &&
          next.secretQueens &&
          next.secretQueens[capColor]?.sq &&
          next.secretQueens[capColor].sq.r === move.captureSq.r &&
          next.secretQueens[capColor].sq.c === move.captureSq.c
        ) {
          next.secretQueens[capColor].sq = null;
          next.secretQueens[capColor].revealed = true;
          capturedType = 'q';
        }
        const trayOwner = capColor === 'w' ? 'b' : 'w';
        next.captured[trayOwner].push(capturedType);

        // Crazyhouse: captured enemy non-Royal pieces join mover's pocket (promoted pawns demote to 'p'!)
        if (vDef.allowDrops && capColor !== pieceColor && !PIECE_DEFS[capturedType]?.isRoyal) {
          const bankedType = wasPromotedCapture ? 'p' : capturedType;
          next.pockets[pieceColor].push(bankedType);
        }
      }
      next.board[move.captureSq.r][move.captureSq.c] = null;
    }

    promoSet.delete(fromKey);
    next.board[move.from.r][move.from.c] = null;

    if (move.rookMove) {
      const rookFromKey = `${move.rookMove.from.r},${move.rookMove.from.c}`;
      const rookToKey = `${move.rookMove.to.r},${move.rookMove.to.c}`;
      if (promoSet.has(rookFromKey)) {
        promoSet.delete(rookFromKey);
        promoSet.add(rookToKey);
      }
      const rookCode = next.board[move.rookMove.from.r][move.rookMove.from.c];
      next.board[move.rookMove.from.r][move.rookMove.from.c] = null;
      next.board[move.rookMove.to.r][move.rookMove.to.c] = rookCode;
    }

    let finalType = move.promotion || moverType;
    if (isSQMove) {
      if (!next.secretQueens[pieceColor].revealed) {
        const isStd = isStandardPawnMove(state, move.from, move.to, move.captureSq);
        const reachedEnd = move.to.r === (pieceColor === 'w' ? 0 : 7);
        if (!isStd || reachedEnd) {
          next.secretQueens[pieceColor].revealed = true;
          finalType = 'q';
        } else {
          finalType = 'p';
        }
      } else {
        finalType = 'q';
      }
      next.secretQueens[pieceColor].sq = { r: move.to.r, c: move.to.c };
    }
    next.board[move.to.r][move.to.c] = pieceColor + finalType;
    if (moverWasPromoted) {
      promoSet.add(toKey);
    } else {
      promoSet.delete(toKey);
    }
    next.promoted = Array.from(promoSet);

    const def = PIECE_DEFS[moverType];
    if (def && typeof def.afterMove === 'function') {
      def.afterMove(next, move);
    }

    if (pieceColor === 'w' && moverType === 'k') {
      next.castling.wK = false;
      next.castling.wQ = false;
    }
    if (pieceColor === 'b' && moverType === 'k') {
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

    next.enPassant =
      pieceColor === turnColor && move.enPassantTarget ? { ...move.enPassantTarget } : null;

    if (moverType === 'p' || capturedType !== null) {
      next.halfMoveClock = 0;
    } else {
      next.halfMoveClock += 1;
    }
    if (turnColor === 'b') {
      next.fullMoveNumber += 1;
    }

    next.lastMove = {
      from: { ...move.from },
      to: { ...move.to },
      isDrop: false,
      dropType: null
    };
  }

  const enemyColor = turnColor === 'w' ? 'b' : 'w';
  next.turn = enemyColor;

  if (vDef.royalCaptureWins && capturedType && PIECE_DEFS[capturedType]?.isRoyal) {
    next.inCheck = false;
    next.status = 'king_captured';
    next.winner = turnColor;
    if (vDef.diceChess) next.dice = null;
  } else if (state.fogMasked) {
    // Guest optimistic preview on a fog-masked board: wait for Host sync_state for full enemy checks/vision
    next.inCheck = false;
    next.fogMasked = true;
    next.fogLegalMoves = [];
    const optVis = new Set();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (getPieceColor(next.board[r][c]) === turnColor) {
          optVis.add(`${r},${c}`);
          for (const pm of generatePseudoMoves({ ...next, turn: turnColor }, r, c, false)) {
            if (pm.to) optVis.add(`${pm.to.r},${pm.to.c}`);
          }
        }
      }
    }
    next.fogVisible = Array.from(optVis);
  } else if (vDef.royalCaptureWins) {
    next.inCheck = false;
    const posKey = computePositionKey(next);
    next.positionCounts[posKey] = (next.positionCounts[posKey] || 0) + 1;
    if (vDef.diceChess) {
      const wildProbe = {
        ...next,
        dice: { values: [6, 6], isDoubles: true, noLegalMoves: false }
      };
      const anyPossibleMoves = getAllLegalMoves(wildProbe, enemyColor);
      if (anyPossibleMoves.length === 0) {
        next.status = 'stalemate';
        next.winner = null;
        next.dice = null;
      } else if (next.positionCounts[posKey] >= 3) {
        next.status = 'draw_repetition';
        next.dice = null;
      } else if (next.halfMoveClock >= 100) {
        next.status = 'draw_50';
        next.dice = null;
      } else if (hasInsufficientMaterial(next)) {
        next.status = 'draw_material';
        next.dice = null;
      } else {
        prepareTurnDice(next, options.nextDice || null);
      }
    } else {
      const opponentMoves = getAllLegalMoves(next, enemyColor);
      if (opponentMoves.length === 0) {
        next.status = 'stalemate';
        next.winner = null;
      } else if (next.positionCounts[posKey] >= 3) {
        next.status = 'draw_repetition';
      } else if (next.halfMoveClock >= 100) {
        next.status = 'draw_50';
      } else if (hasInsufficientMaterial(next)) {
        next.status = 'draw_material';
      }
    }
  } else {
    // Check if mover's secret queen has unobstructed Queen line of sight to enemy King (delivering check)
    if (
      vDef.secretQueen &&
      next.secretQueens &&
      next.secretQueens[moverColor]?.sq &&
      !next.secretQueens[moverColor].revealed
    ) {
      const sq = next.secretQueens[moverColor].sq;
      let enemyKr = -1, enemyKc = -1;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (next.board[r][c] === enemyColor + 'k') {
            enemyKr = r;
            enemyKc = c;
            break;
          }
        }
        if (enemyKr >= 0) break;
      }
      if (enemyKr >= 0) {
        const dr = enemyKr - sq.r;
        const dc = enemyKc - sq.c;
        const isAligned = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
        if (isAligned) {
          const stepR = Math.sign(dr);
          const stepC = Math.sign(dc);
          let cr = sq.r + stepR;
          let cc = sq.c + stepC;
          let clear = true;
          while (cr !== enemyKr || cc !== enemyKc) {
            if (next.board[cr][cc] !== null) {
              clear = false;
              break;
            }
            cr += stepR;
            cc += stepC;
          }
          if (clear) {
            revealSecretQueen(next, moverColor);
          }
        }
      }
    }

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
    } else if (hasInsufficientMaterial(next)) {
      next.status = 'draw_material';
    }
  }

  const san = formatMoveSAN(state, move, next);
  next.moveHistory.push(san);

  next.historyFrames.push(
    makeHistoryFrame(next, {
      moverColor,
      isCapture: capturedType !== null,
      isDrop: Boolean(move.isDrop),
      dropType: move.dropType || null,
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

function tryMakeDrop(state, dropType, to) {
  if (!dropType || !to || !inBounds(to.r, to.c)) return null;
  const legalDrops = getLegalDropMoves(state, dropType, state.turn);
  const chosen = legalDrops.find((m) => m.to.r === to.r && m.to.c === to.c) || null;
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
    case 'diceRoll':
      playWoodTap(ctx, t, 210, 1280, 0.16, 0.032);
      playWoodTap(ctx, t + 0.044, 245, 1460, 0.18, 0.032);
      playWoodTap(ctx, t + 0.095, 230, 1340, 0.19, 0.035);
      playWoodTap(ctx, t + 0.152, 272, 1520, 0.17, 0.036);
      break;
    case 'diceDoubles':
      playToneNote(ctx, t, 523.25, 0.11, 0.13, 'triangle');
      playToneNote(ctx, t + 0.055, 659.25, 0.12, 0.15, 'triangle');
      playToneNote(ctx, t + 0.11, 783.99, 0.13, 0.18, 'triangle');
      playToneNote(ctx, t + 0.165, 1046.5, 0.11, 0.24, 'sine');
      break;
    case 'diceBlocked':
    case 'dicePass':
      playWoodTap(ctx, t, 118, 560, 0.24, 0.055);
      playToneNote(ctx, t + 0.015, 246.94, 0.11, 0.14, 'triangle');
      playToneNote(ctx, t + 0.105, 185.0, 0.11, 0.18, 'triangle');
      break;
    case 'turnPass':
      playWoodTap(ctx, t, 200, 920, 0.14, 0.03);
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
  if (meta?.isPass) {
    playSound('turnPass');
    return;
  }

  if (getVariantDef(nextState).fogOfWar) {
    if (!isMyMove) {
      const viewer = net.mode === 'online' ? net.myColor : nextState.turn;
      const vis = computeVisibleSquares(nextState, viewer);
      const to = nextState.lastMove?.to;
      if (to && vis.has(`${to.r},${to.c}`) && meta?.isCapture) {
        playSound('capture');
      } else {
        playSound('moveOpponent');
      }
      return;
    }
    if (meta?.promotion) {
      playSound('promote');
    } else if (meta?.castleSide) {
      playSound('castle');
    } else if (meta?.isCapture) {
      playSound('capture');
    } else {
      playSound('moveSelf');
    }
    return;
  }

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
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 2
};

let heartbeatInterval = null;
let heartbeatWorker = null;
let lastHeartbeatReceived = Date.now();
let opponentGraceTimer = null;
let opponentGraceSecondsLeft = 30;
let guestReconnectAttempts = 0;
let guestReconnectTimer = null;

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
  variant: 'standard', // 'standard' | 'cannibal' | 'crazyhouse' | 'fog' | 'secret'
  timed: true,
  minutes: 10,         // 1..60 minutes
  incrementSec: 5,     // 0..60 seconds gained per turn
  sidePref: 'w',       // 'w' | 'random' | 'b'
  customState: null    // Custom position configuration if set from editor
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
  remotePeerId: null,
  relayOpen: false,
  bcChannel: null,
  bcOpen: false,
  bcPeerId: null,
  localClientId: 'c_' + Math.random().toString(36).slice(2, 10),
  currentMatchId: null,
  joinTimer: null,
  joinRetryTimer: null,
  myRematchWanted: false,
  peerRematchWanted: false,
  drawOfferedBy: null,    // 'w' | 'b' | null
  pendingOptimisticPly: null,
  msgTimestamps: [],
  txSeq: 0,
  rxPktIds: new Set(),
  relayChunks: new Map()
};

// Shared Match & UI Session State
let gameState = createInitialState();
let viewPly = 0;               // Current move index viewed on board (0..moveHistory.length)
let boardFlipped = false;
let selectedSq = null;
let selectedPocketType = null; // Selected Crazyhouse pocket piece on player's turn
let selectedLegalMoves = [];
let premoveOriginSq = null;    // Selected origin square while choosing a premove
let premovePocketType = null;  // Selected Crazyhouse pocket piece while choosing a premove drop
let premoveTargets = [];       // Candidate target squares for premoveOriginSq / premovePocketType
let premoveQueue = [];         // Array of { isDrop?, dropType?, from: {r, c}|null, to: {r, c}, promotion: string|null }
let pendingPromotion = null;   // { from, to, color, viaDrag, isPremove }
let pendingSlideAnim = null;   // { moves: [{ from, to }] }
let drawnArrows = [];          // Array of { from: {r, c}, to: {r, c} }
let markedSquares = [];        // Array of { r, c } right-click square highlights
let previewArrow = null;       // Live arrow while right-click dragging
let resignConfirmTimer = null;
let opponentDisconnected = false;
let secretPickCol = null;

const editorState = {
  active: false,
  board: Array.from({ length: 8 }, () => Array(8).fill(null)),
  turn: 'w',
  variant: 'standard',
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  pockets: { w: [], b: [] },
  selectedTool: null,
  validationError: null
};
let editorSelectedSq = null;

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

function allowIncomingPacket(data) {
  if (
    data &&
    typeof data === 'object' &&
    (data.type === 'ping' ||
      data.type === 'pong' ||
      data.type === 'hello' ||
      data.type === 'match_start' ||
      data.type === 'sync_state' ||
      data.type === 'room_locked')
  ) {
    return true;
  }
  const now = Date.now();
  net.msgTimestamps = net.msgTimestamps.filter((t) => now - t < 1000);
  if (net.msgTimestamps.length >= 60) return false;
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

function isValidCoordKey(str) {
  if (typeof str !== 'string') return false;
  const parts = str.split(',');
  if (parts.length !== 2) return false;
  const r = Number(parts[0]);
  const c = Number(parts[1]);
  return Number.isInteger(r) && Number.isInteger(c) && inBounds(r, c);
}

function sanitizeSAN(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[^A-Za-z0-9+#=\-O@? ]/g, '').slice(0, 12);
}

function sanitizeLastMoveObj(lm) {
  if (!lm || typeof lm !== 'object') return null;
  const from = isValidCoordObj(lm.from) ? { r: lm.from.r, c: lm.from.c } : null;
  const to = isValidCoordObj(lm.to) ? { r: lm.to.r, c: lm.to.c } : null;
  if (!from && !to) return null;
  const dropType =
    typeof lm.dropType === 'string' &&
    Object.prototype.hasOwnProperty.call(PIECE_DEFS, lm.dropType) &&
    !PIECE_DEFS[lm.dropType].isRoyal
      ? lm.dropType
      : null;
  return {
    from,
    to,
    isDrop: Boolean(lm.isDrop),
    dropType
  };
}

function sanitizeLegalMoveList(arr) {
  if (!Array.isArray(arr)) return null;
  const clean = [];
  for (const m of arr.slice(0, 256)) {
    if (!m || typeof m !== 'object' || !isValidCoordObj(m.to)) continue;
    if (m.isDrop) {
      if (
        typeof m.dropType !== 'string' ||
        !Object.prototype.hasOwnProperty.call(PIECE_DEFS, m.dropType) ||
        PIECE_DEFS[m.dropType].isRoyal
      ) {
        continue;
      }
      clean.push({
        isDrop: true,
        dropType: m.dropType,
        color: m.color === 'b' ? 'b' : 'w',
        from: null,
        to: { r: m.to.r, c: m.to.c },
        captureSq: null,
        promotion: null
      });
    } else {
      if (!isValidCoordObj(m.from)) continue;
      clean.push({
        isDrop: false,
        from: { r: m.from.r, c: m.from.c },
        to: { r: m.to.r, c: m.to.c },
        captureSq: isValidCoordObj(m.captureSq) ? { r: m.captureSq.r, c: m.captureSq.c } : null,
        promotion:
          typeof m.promotion === 'string' && Object.prototype.hasOwnProperty.call(PIECE_DEFS, m.promotion)
            ? m.promotion
            : null,
        castleSide: m.castleSide === 'K' || m.castleSide === 'Q' ? m.castleSide : null,
        rookMove:
          m.rookMove && isValidCoordObj(m.rookMove.from) && isValidCoordObj(m.rookMove.to)
            ? {
                from: { r: m.rookMove.from.r, c: m.rookMove.from.c },
                to: { r: m.rookMove.to.r, c: m.rookMove.to.c }
              }
            : null,
        enPassantTarget: isValidCoordObj(m.enPassantTarget)
          ? { r: m.enPassantTarget.r, c: m.enPassantTarget.c }
          : null,
        isEnPassant: Boolean(m.isEnPassant)
      });
    }
  }
  return clean;
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
    variant: state.variant || 'standard',
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
    pockets: state.pockets || { w: [], b: [] },
    promoted: state.promoted || [],
    secretQueens: state.secretQueens
      ? {
          w: state.secretQueens.w
            ? {
                sq: state.secretQueens.w.sq ? { ...state.secretQueens.w.sq } : null,
                revealed: Boolean(state.secretQueens.w.revealed),
                picked: Boolean(state.secretQueens.w.picked)
              }
            : null,
          b: state.secretQueens.b
            ? {
                sq: state.secretQueens.b.sq ? { ...state.secretQueens.b.sq } : null,
                revealed: Boolean(state.secretQueens.b.revealed),
                picked: Boolean(state.secretQueens.b.picked)
              }
            : null
        }
      : null,
    dice: cloneDiceState(state.dice),
    historyFrames: (state.historyFrames || []).map((f) => ({
      board: f.board,
      turn: f.turn,
      inCheck: Boolean(f.inCheck),
      lastMove: f.lastMove,
      captured: f.captured,
      pockets: f.pockets,
      secretQueens: f.secretQueens || null,
      dice: cloneDiceState(f.dice),
      meta: f.meta || null
    }))
  };
}

function maskFrameForFogPeer(state, frame, peerColor, vDef, overrideVisSet = null) {
  let visSet = overrideVisSet;
  if (!visSet) {
    if (Array.isArray(frame?.fogVis?.[peerColor])) {
      visSet = new Set(frame.fogVis[peerColor]);
    } else {
      visSet = computeVisibleSquares(
        {
          ...state,
          board: frame.board,
          turn: frame.turn
        },
        peerColor
      );
    }
  }

  const maskedBoard = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push(visSet.has(`${r},${c}`) ? frame.board[r][c] : null);
    }
    maskedBoard.push(row);
  }

  const rawLm = frame.lastMove;
  const visFrom =
    rawLm?.from && visSet.has(`${rawLm.from.r},${rawLm.from.c}`)
      ? { r: rawLm.from.r, c: rawLm.from.c }
      : null;
  const visTo =
    rawLm?.to && visSet.has(`${rawLm.to.r},${rawLm.to.c}`)
      ? { r: rawLm.to.r, c: rawLm.to.c }
      : null;
  const maskedLastMove =
    visFrom || visTo
      ? {
          from: visFrom,
          to: visTo,
          isDrop: Boolean(rawLm?.isDrop && visTo),
          dropType: visTo ? rawLm?.dropType || null : null
        }
      : null;

  const frameMeta = frame?.meta;
  const moverIsPeer = frameMeta?.moverColor === peerColor;

  return {
    board: maskedBoard,
    turn: frame.turn,
    inCheck: false,
    lastMove: maskedLastMove,
    captured: { w: [], b: [] },
    pockets: vDef.allowDrops
      ? { w: (frame.pockets?.w || state.pockets?.w || []).slice(), b: (frame.pockets?.b || state.pockets?.b || []).slice() }
      : { w: [], b: [] },
    meta: frameMeta
      ? {
          moverColor: frameMeta.moverColor,
          isCapture: Boolean(frameMeta.isCapture && (moverIsPeer || visTo)),
          isDrop: Boolean(frameMeta.isDrop && (moverIsPeer || visTo)),
          dropType: moverIsPeer || visTo ? frameMeta.dropType || null : null,
          castleSide: moverIsPeer ? frameMeta.castleSide || null : null,
          rookMove: moverIsPeer ? frameMeta.rookMove || null : null,
          promotion: moverIsPeer ? frameMeta.promotion || null : null
        }
      : null,
    fogVisible: Array.from(visSet)
  };
}

// Network-level Fog of War anti-cheat serializer:
// While a Fog of War game is actively in progress, strips all hidden Host pieces,
// opponent castling rights, captured counts, and opponent SAN moves before sending to Guest
// across both the live state and any replay frames. As soon as the game ends (status !== 'playing'),
// sends the full unmasked state & replay!
function serializeStateForPeer(state, peerColor) {
  const vDef = getVariantDef(state);
  if (!vDef.fogOfWar || state.status !== 'playing') {
    const auth = serializeAuthoritativeState(state);
    if (state.status === 'playing' && Array.isArray(auth.historyFrames) && auth.historyFrames.length > 8) {
      auth.historyFrames = auth.historyFrames.slice(-8);
    }
    if (vDef.secretQueen && auth.secretQueens) {
      const oppColor = peerColor === 'w' ? 'b' : 'w';
      if (auth.secretQueens[oppColor] && !auth.secretQueens[oppColor].revealed) {
        auth.secretQueens = {
          ...auth.secretQueens,
          [oppColor]: {
            sq: null,
            revealed: false,
            picked: Boolean(auth.secretQueens[oppColor].picked)
          }
        };
      }
    }
    return auth;
  }

  const vis = computeVisibleSquares(state, peerColor);
  const rawFrames =
    Array.isArray(state.historyFrames) && state.historyFrames.length > 0
      ? state.historyFrames
      : [makeHistoryFrame(state, null)];
  const tailRawFrames = rawFrames.length > 16 ? rawFrames.slice(-16) : rawFrames;
  const maskedFrames = tailRawFrames.map((f, idx) =>
    maskFrameForFogPeer(
      state,
      f,
      peerColor,
      vDef,
      idx === tailRawFrames.length - 1 ? vis : null
    )
  );
  const latestMasked = maskedFrames[maskedFrames.length - 1];

  const maskedHistory = state.moveHistory.map((san, idx) => {
    const plyColor = idx % 2 === 0 ? 'w' : 'b';
    return plyColor === peerColor ? san : '?';
  });

  return {
    variant: state.variant,
    board: latestMasked.board,
    turn: state.turn,
    castling: {
      wK: peerColor === 'w' ? Boolean(state.castling.wK) : false,
      wQ: peerColor === 'w' ? Boolean(state.castling.wQ) : false,
      bK: peerColor === 'b' ? Boolean(state.castling.bK) : false,
      bQ: peerColor === 'b' ? Boolean(state.castling.bQ) : false
    },
    enPassant:
      state.enPassant && vis.has(`${state.enPassant.r},${state.enPassant.c}`)
        ? { r: state.enPassant.r, c: state.enPassant.c }
        : null,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    status: state.status,
    winner: state.winner,
    inCheck: false,
    lastMove: latestMasked.lastMove,
    moveHistory: maskedHistory,
    captured: { w: [], b: [] },
    pockets: vDef.allowDrops
      ? { w: (state.pockets?.w || []).slice(), b: (state.pockets?.b || []).slice() }
      : { w: [], b: [] },
    promoted: [],
    historyFrames: maskedFrames,
    fogMasked: true,
    fogVisible: Array.from(vis),
    fogLegalMoves: getAllLegalMoves(state, peerColor)
  };
}

function validateAndHydrateState(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const cleanBoard = validateCleanBoard(raw.board);
  if (!cleanBoard) return null;

  const cleanVariant =
    typeof raw.variant === 'string' && Object.prototype.hasOwnProperty.call(VARIANT_DEFS, raw.variant)
      ? raw.variant
      : 'standard';

  const allowedStatuses = [
    'secret_pick',
    'playing',
    'checkmate',
    'king_captured',
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

  const cleanPocketSide = (arr) =>
    Array.isArray(arr)
      ? arr
          .slice(0, 64)
          .filter(
            (t) =>
              typeof t === 'string' &&
              Object.prototype.hasOwnProperty.call(PIECE_DEFS, t) &&
              !PIECE_DEFS[t].isRoyal
          )
      : [];

  const cleanPromoted = Array.isArray(raw.promoted)
    ? raw.promoted.slice(0, 64).filter(isValidCoordKey)
    : [];

  const cleanDiceObj = (d) => {
    if (!d || typeof d !== 'object') return null;
    if (d.rolled === false || d.values === null) {
      return createPendingDiceState();
    }
    if (!Array.isArray(d.values) || d.values.length !== 2) {
      return null;
    }
    const v1 = Math.max(1, Math.min(6, Math.floor(Number(d.values[0]) || 1)));
    const v2 = Math.max(1, Math.min(6, Math.floor(Number(d.values[1]) || 1)));
    return {
      values: [v1, v2],
      rolled: true,
      isDoubles: v1 === v2,
      noLegalMoves: Boolean(d.noLegalMoves)
    };
  };

  const isFogMasked = Boolean(raw.fogMasked && cleanVariant === 'fog' && raw.status === 'playing');
  const cleanFogVisible =
    isFogMasked && Array.isArray(raw.fogVisible)
      ? raw.fogVisible.slice(0, 64).filter(isValidCoordKey)
      : null;
  const cleanFogMoves = isFogMasked ? sanitizeLegalMoveList(raw.fogLegalMoves) : null;

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
        lastMove: sanitizeLastMoveObj(f.lastMove),
        captured: {
          w: cleanCapturedSide(f.captured?.w),
          b: cleanCapturedSide(f.captured?.b)
        },
        pockets: {
          w: cleanPocketSide(f.pockets?.w),
          b: cleanPocketSide(f.pockets?.b)
        },
        dice: cleanVariant === 'dice' ? cleanDiceObj(f.dice) : null,
        fogVisible:
          isFogMasked && Array.isArray(f.fogVisible)
            ? f.fogVisible.slice(0, 64).filter(isValidCoordKey)
            : null,
        meta:
          f.meta && typeof f.meta === 'object'
            ? {
                moverColor: f.meta.moverColor === 'b' ? 'b' : f.meta.moverColor === 'w' ? 'w' : null,
                isCapture: Boolean(f.meta.isCapture),
                isDrop: Boolean(f.meta.isDrop),
                dropType:
                  typeof f.meta.dropType === 'string' && PIECE_DEFS[f.meta.dropType]
                    ? f.meta.dropType
                    : null,
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
                    : null,
                isPass: Boolean(f.meta.isPass)
              }
            : null
      });
    }
  }

  let cleanSecretQueens = null;
  if (cleanVariant === 'secret' && raw.secretQueens && typeof raw.secretQueens === 'object') {
    const cleanSide = (s) => {
      if (!s || typeof s !== 'object') return { sq: null, revealed: false, picked: false };
      const sq = isValidCoordObj(s.sq) ? { r: s.sq.r, c: s.sq.c } : null;
      return {
        sq,
        revealed: Boolean(s.revealed),
        picked: Boolean(s.picked)
      };
    };
    cleanSecretQueens = {
      w: cleanSide(raw.secretQueens.w),
      b: cleanSide(raw.secretQueens.b)
    };
  }

  const hydrated = {
    variant: cleanVariant,
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
    lastMove: sanitizeLastMoveObj(raw.lastMove),
    moveHistory: cleanHistory,
    captured: {
      w: cleanCapturedSide(raw.captured?.w),
      b: cleanCapturedSide(raw.captured?.b)
    },
    pockets: {
      w: cleanPocketSide(raw.pockets?.w),
      b: cleanPocketSide(raw.pockets?.b)
    },
    promoted: cleanPromoted,
    positionCounts: {},
    historyFrames: cleanFrames,
    fogMasked: isFogMasked,
    fogVisible: cleanFogVisible,
    fogLegalMoves: cleanFogMoves,
    secretQueens: cleanSecretQueens,
    dice: cleanVariant === 'dice' ? cleanDiceObj(raw.dice) : null
  };

  if (hydrated.historyFrames.length === 0) {
    hydrated.historyFrames.push(makeHistoryFrame(hydrated, null));
  }

  return hydrated;
}

function hasActiveSignalingSocket(peer = net.peer) {
  return Boolean(
    peer &&
      !peer.destroyed &&
      !peer.disconnected &&
      peer.socket &&
      typeof peer.socket.send === 'function'
  );
}

function isLogicalConnOpen(conn = net.conn) {
  if (conn && conn.open) return true;
  if (net.relayOpen && hasActiveSignalingSocket(net.peer)) return true;
  if (net.bcOpen && net.bcChannel) return true;
  return false;
}

function sendRawSignalingEnvelope(dstPeerId, envelopeObj, peer = net.peer) {
  if (!dstPeerId || !hasActiveSignalingSocket(peer)) return false;
  try {
    const serialized = JSON.stringify(envelopeObj);
    if (serialized.length <= 7000) {
      peer.socket.send({
        type: 'CANDIDATE',
        dst: dstPeerId,
        payload: {
          candidate: {
            candidate: serialized,
            sdpMid: '0',
            sdpMLineIndex: 0
          },
          type: 'data',
          connectionId: '__chess_relay__'
        }
      });
    } else {
      const chunkId = net.localClientId + '_c' + ++net.txSeq;
      const chunkSize = 6500;
      const total = Math.ceil(serialized.length / chunkSize);
      for (let idx = 0; idx < total; idx++) {
        const part = JSON.stringify({
          __chessRelay: true,
          kind: 'chunk',
          id: chunkId,
          idx,
          total,
          chunk: serialized.slice(idx * chunkSize, (idx + 1) * chunkSize)
        });
        peer.socket.send({
          type: 'CANDIDATE',
          dst: dstPeerId,
          payload: {
            candidate: {
              candidate: part,
              sdpMid: '0',
              sdpMLineIndex: 0
            },
            type: 'data',
            connectionId: '__chess_relay__'
          }
        });
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

function sendViaBroadcastChannel(envelopeObj) {
  if (!net.bcChannel) return false;
  try {
    net.bcChannel.postMessage({
      ...envelopeObj,
      srcClientId: net.localClientId
    });
    return true;
  } catch (_) {
    return false;
  }
}

function receiveDeduplicatedPacket(data, pktId) {
  if (!data || typeof data !== 'object') return;
  const id = typeof pktId === 'string' ? pktId : typeof data._pktId === 'string' ? data._pktId : null;
  if (id) {
    if (net.rxPktIds.has(id)) return;
    net.rxPktIds.add(id);
    if (net.rxPktIds.size > 600) {
      const first = net.rxPktIds.values().next().value;
      if (first !== undefined) net.rxPktIds.delete(first);
    }
  }
  lastHeartbeatReceived = Date.now();
  if (net.role === 'host') {
    handleHostIncomingData(data);
  } else if (net.role === 'guest') {
    handleGuestIncomingData(data);
  }
}

function sendPacket(conn, payload) {
  if (!payload || typeof payload !== 'object') return;

  // Intruder rejection on a non-primary connection
  if (conn && conn !== net.conn) {
    if (conn.open) {
      try {
        conn.send(payload);
      } catch (_) {}
    } else if (conn.peer && hasActiveSignalingSocket(net.peer)) {
      sendRawSignalingEnvelope(conn.peer, {
        __chessRelay: true,
        kind: 'pkt',
        pktId: net.localClientId + ':' + ++net.txSeq,
        data: payload
      });
    }
    return;
  }

  const useHybrid = hasActiveSignalingSocket(net.peer) || Boolean(net.bcChannel);
  if (!useHybrid) {
    if (conn && conn.open) {
      conn.send(payload);
    }
    return;
  }

  const pktId = net.localClientId + ':' + ++net.txSeq;
  const taggedPayload = { ...payload, _pktId: pktId };

  if (conn && conn.open) {
    try {
      conn.send(taggedPayload);
    } catch (_) {}
  }

  const targetPeerId = net.remotePeerId || (conn && conn.peer) || null;
  if (targetPeerId && hasActiveSignalingSocket(net.peer)) {
    sendRawSignalingEnvelope(targetPeerId, {
      __chessRelay: true,
      kind: 'pkt',
      pktId,
      data: taggedPayload
    });
  }

  if (net.bcChannel && net.bcOpen) {
    sendViaBroadcastChannel({
      __chessRelay: true,
      kind: 'pkt',
      pktId,
      data: taggedPayload
    });
  }
}

function sendCurrentMatchStartPacket() {
  if (net.role !== 'host') return;
  const guestColor = net.myColor === 'w' ? 'b' : 'w';
  if (!net.currentMatchId) {
    net.currentMatchId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }
  sendPacket(net.conn, {
    type: 'match_start',
    matchId: net.currentMatchId,
    yourColor: guestColor,
    hostName: net.myName,
    guestName: net.peerName,
    state: serializeStateForPeer(gameState, guestColor),
    clock: serializeClockPayload()
  });
}

function onHostGuestChannelReady(isReconnect = false) {
  if (net.role !== 'host') return;
  if (net.mode === 'waiting') {
    net.mode = 'online';
    net.roomLocked = true;
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();
    startHeartbeat();
    setGameFeedback('');
    startNewMatchAsHost(false);
    return;
  }
  if (net.mode === 'online') {
    const wasDisconnected = opponentDisconnected || isReconnect;
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();
    startHeartbeat();
    if (wasDisconnected) {
      setGameFeedback('Opponent reconnected!');
      setTimeout(() => setGameFeedback(''), 3000);
    }
    if (gameState.moveHistory.length === 0) {
      sendCurrentMatchStartPacket();
    }
    broadcastHostState();
    renderAll();
  }
}

function handleDecodedRelayEnvelope(srcId, env, via) {
  if (!env || typeof env !== 'object' || !env.__chessRelay) return;

  if (env.kind === 'chunk') {
    if (typeof env.id !== 'string' || typeof env.chunk !== 'string') return;
    const total = Number(env.total);
    const idx = Number(env.idx);
    if (!Number.isInteger(total) || total < 1 || total > 64 || !Number.isInteger(idx) || idx < 0 || idx >= total) {
      return;
    }
    let entry = net.relayChunks.get(env.id);
    if (!entry) {
      if (net.relayChunks.size > 30) {
        const oldestKey = net.relayChunks.keys().next().value;
        if (oldestKey !== undefined) net.relayChunks.delete(oldestKey);
      }
      entry = { parts: new Array(total).fill(null), received: 0, total };
      net.relayChunks.set(env.id, entry);
    }
    if (entry.parts[idx] === null) {
      entry.parts[idx] = env.chunk;
      entry.received++;
    }
    if (entry.received === entry.total) {
      net.relayChunks.delete(env.id);
      try {
        const fullEnv = JSON.parse(entry.parts.join(''));
        handleDecodedRelayEnvelope(srcId, fullEnv, via);
      } catch (_) {}
    }
    return;
  }

  if (env.kind === 'open') {
    if (net.role !== 'host') return;
    const isSamePeer =
      (via === 'relay' && (!net.remotePeerId || net.remotePeerId === srcId)) ||
      (via === 'bc' && (!net.bcPeerId || net.bcPeerId === srcId));
    const isGameActive =
      net.mode === 'online' &&
      (gameState.status === 'playing' || gameState.status === 'secret_pick');
    const canAcceptReconnect = isGameActive && (opponentDisconnected || Boolean(env.reconnect) || isSamePeer);

    if (net.roomLocked && !canAcceptReconnect && net.mode !== 'waiting' && !isSamePeer) {
      const lockEnv = {
        __chessRelay: true,
        kind: 'pkt',
        pktId: net.localClientId + ':' + ++net.txSeq,
        data: { type: 'room_locked' }
      };
      if (via === 'relay') sendRawSignalingEnvelope(srcId, lockEnv);
      else if (via === 'bc') sendViaBroadcastChannel(lockEnv);
      return;
    }

    if (via === 'relay') {
      net.remotePeerId = srcId;
      net.relayOpen = true;
    } else if (via === 'bc') {
      net.bcPeerId = srcId;
      net.bcOpen = true;
    }
    if (typeof env.name === 'string') {
      net.peerName = sanitizePlayerName(env.name);
    }

    const ackEnv = {
      __chessRelay: true,
      kind: 'open_ack',
      hostName: net.myName,
      matchId: net.currentMatchId
    };
    if (via === 'relay') sendRawSignalingEnvelope(srcId, ackEnv);
    else if (via === 'bc') sendViaBroadcastChannel(ackEnv);

    onHostGuestChannelReady(Boolean(env.reconnect));
    return;
  }

  if (env.kind === 'open_ack') {
    if (net.role !== 'guest') return;
    if (via === 'relay') {
      net.remotePeerId = srcId || net.remotePeerId;
      net.relayOpen = true;
    } else if (via === 'bc') {
      net.bcPeerId = srcId || net.bcPeerId;
      net.bcOpen = true;
    }
    lastHeartbeatReceived = Date.now();
    if (opponentDisconnected) {
      guestReconnectAttempts = 0;
      clearOpponentDisconnectGraceTimer();
      opponentDisconnected = false;
      setGameFeedback('Reconnected to game!');
      setTimeout(() => setGameFeedback(''), 3000);
    }
    startHeartbeat();
    sendPacket(net.conn, {
      type: 'hello',
      name: net.myName,
      reconnect: net.mode === 'online'
    });
    return;
  }

  if (env.kind === 'close') {
    const matchesRemote =
      (via === 'relay' && srcId === net.remotePeerId) ||
      (via === 'bc' && srcId === net.bcPeerId);
    if (!matchesRemote) return;
    if (via === 'relay') net.relayOpen = false;
    if (via === 'bc') net.bcOpen = false;
    if (!isLogicalConnOpen(net.conn)) {
      handleTransientDisconnect();
    }
    return;
  }

  if (env.kind === 'pkt' && env.data) {
    if (net.role === 'host') {
      const isKnownPeer =
        (via === 'relay' && (!net.remotePeerId || net.remotePeerId === srcId)) ||
        (via === 'bc' && (!net.bcPeerId || net.bcPeerId === srcId)) ||
        opponentDisconnected;
      if (!isKnownPeer && net.roomLocked) return;
    }
    if (via === 'relay') {
      net.remotePeerId = net.remotePeerId || srcId;
      net.relayOpen = true;
    } else if (via === 'bc') {
      net.bcPeerId = net.bcPeerId || srcId;
      net.bcOpen = true;
    }
    receiveDeduplicatedPacket(env.data, env.pktId);
  }
}

function setupPeerRelayHook(peer) {
  if (!peer || !peer.socket || typeof peer._handleMessage !== 'function' || peer._chessRelayHooked) {
    return;
  }
  peer._chessRelayHooked = true;
  const origHandleMessage = peer._handleMessage.bind(peer);
  peer._handleMessage = function (msg) {
    if (
      msg &&
      msg.type === 'CANDIDATE' &&
      msg.payload &&
      msg.payload.connectionId === '__chess_relay__'
    ) {
      const rawStr = msg.payload.candidate && msg.payload.candidate.candidate;
      if (typeof rawStr === 'string') {
        try {
          const env = JSON.parse(rawStr);
          handleDecodedRelayEnvelope(msg.src, env, 'relay');
        } catch (_) {}
      }
      return;
    }
    if (msg && msg.type === 'LEAVE' && msg.src && msg.src === net.remotePeerId) {
      net.relayOpen = false;
      origHandleMessage(msg);
      if (!isLogicalConnOpen(net.conn)) {
        handleTransientDisconnect();
      }
      return;
    }
    return origHandleMessage(msg);
  };
}

function setupBroadcastChannelForRoom(code, peer) {
  if (!peer || !peer.socket) return;
  if (typeof BroadcastChannel === 'undefined') return;
  if (net.bcChannel) {
    try {
      net.bcChannel.close();
    } catch (_) {}
    net.bcChannel = null;
  }
  try {
    const bc = new BroadcastChannel('chessgame-v2-bc-' + code);
    net.bcChannel = bc;
    bc.onmessage = (ev) => {
      const env = ev && ev.data;
      if (!env || typeof env !== 'object' || !env.__chessRelay) return;
      if (env.srcClientId === net.localClientId) return;
      handleDecodedRelayEnvelope(env.srcClientId || 'bc_peer', env, 'bc');
    };
  } catch (_) {
    net.bcChannel = null;
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
  if (net.role !== 'host' || !isLogicalConnOpen(net.conn)) return;
  const guestColor = net.myColor === 'w' ? 'b' : 'w';
  sendPacket(net.conn, {
    type: 'sync_state',
    yourColor: guestColor,
    matchId: net.currentMatchId,
    state: serializeStateForPeer(gameState, guestColor),
    clock: serializeClockPayload(),
    drawOfferedBy: net.drawOfferedBy,
    hostName: net.myName,
    guestName: net.peerName
  });
}

function startNewMatchAsHost(isRematch = false) {
  const matchVariant = isRematch ? gameState.variant || setupConfig.variant : setupConfig.variant;
  if (isRematch) {
    net.myColor = net.myColor === 'w' ? 'b' : 'w';
  } else {
    if (setupConfig.sidePref === 'random') {
      net.myColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      net.myColor = setupConfig.sidePref === 'b' ? 'b' : 'w';
    }
  }

  net.currentMatchId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  net.myRematchWanted = false;
  net.peerRematchWanted = false;
  net.drawOfferedBy = null;
  net.pendingOptimisticPly = null;
  boardFlipped = net.myColor === 'b';

  premoveQueue = [];
  clearBoardTransientUI();
  initClockForNewMatch();

  if (!isRematch && setupConfig.customState) {
    gameState = createCustomState(setupConfig.customState);
  } else {
    gameState = createInitialState(matchVariant);
  }
  if (gameState.status === 'secret_pick') {
    clockState.running = false;
  }
  viewPly = 0;

  sendCurrentMatchStartPacket();

  playSound('gameStart');
  renderAll();
  if (!isRematch) scrollBoardIntoViewOnMobile();
}

function handleHostIncomingData(data) {
  if (!allowIncomingPacket(data)) return;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return;

  const guestColor = net.myColor === 'w' ? 'b' : 'w';

  lastHeartbeatReceived = Date.now();
  if (data.type === 'ping') {
    sendPacket(net.conn, { type: 'pong', t: data.t });
    return;
  }
  if (data.type === 'pong') {
    if (opponentDisconnected) {
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      renderAll();
    }
    return;
  }

  if (data.type === 'hello' || data.type === 'name_update') {
    net.peerName = sanitizePlayerName(data.name);
    if (opponentDisconnected) {
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
    }
    if (data.type === 'hello' && gameState.moveHistory.length === 0) {
      sendCurrentMatchStartPacket();
    }
    broadcastHostState();
    renderAll();
    return;
  }

  if (data.type === 'secret_pick') {
    if (gameState.status !== 'secret_pick') return;
    if (typeof data.col !== 'number' || data.col < 0 || data.col > 7) return;
    assignSecretQueen(gameState, guestColor, data.col);
    if (gameState.secretQueens.w.picked && gameState.secretQueens.b.picked) {
      gameState.status = 'playing';
      clockState.running = clockState.timed;
      clockState.lastTick = Date.now();
      clockState.lastSyncPerf = getNowPerf();
      playSound('gameStart');
    }
    broadcastHostState();
    renderAll();
    return;
  }

  if (data.type === 'dice_roll_request') {
    if (
      gameState.status === 'playing' &&
      getVariantDef(gameState).diceChess &&
      gameState.turn === guestColor &&
      gameState.dice &&
      gameState.dice.rolled === false &&
      !opponentDisconnected
    ) {
      rollDiceForState(gameState);
      clearSelection();
      playDiceOutcomeSounds(gameState.dice);
      broadcastHostState();
      renderAll();
    }
    return;
  }

  if (data.type === 'dice_pass') {
    if (
      gameState.status === 'playing' &&
      getVariantDef(gameState).diceChess &&
      gameState.dice?.noLegalMoves
    ) {
      executeDicePassTurn();
    }
    return;
  }

  if (data.type === 'move_request') {
    if (gameState.status !== 'playing') return;
    if (gameState.turn !== guestColor) {
      broadcastHostState();
      return;
    }

    const prevState = gameState;
    let candidate = null;

    if (data.isDrop) {
      if (
        typeof data.dropType !== 'string' ||
        !Object.prototype.hasOwnProperty.call(PIECE_DEFS, data.dropType) ||
        PIECE_DEFS[data.dropType].isRoyal ||
        !isValidCoordObj(data.to)
      ) {
        return;
      }
      candidate = tryMakeDrop(gameState, data.dropType, data.to);
    } else {
      if (!isValidCoordObj(data.from) || !isValidCoordObj(data.to)) return;
      const promo = typeof data.promotion === 'string' ? data.promotion.slice(0, 4) : null;
      candidate = tryMakeMove(gameState, data.from, data.to, promo);
    }

    if (!candidate) {
      const pinTrigger = checkSecretQueenPinInteraction(gameState, data.from, data.to);
      if (pinTrigger) {
        revealSecretQueen(gameState, pinTrigger.secretColor);
        broadcastHostState();
        playSound('illegal');
        renderAll();
        return;
      }
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

function clearGuestJoinTimers() {
  if (net.joinTimer) {
    clearTimeout(net.joinTimer);
    net.joinTimer = null;
  }
  if (net.joinRetryTimer) {
    clearInterval(net.joinRetryTimer);
    net.joinRetryTimer = null;
  }
}

function handleGuestIncomingData(data) {
  if (!allowIncomingPacket(data)) return;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return;

  lastHeartbeatReceived = Date.now();
  if (data.type === 'ping') {
    sendPacket(net.conn, { type: 'pong', t: data.t });
    return;
  }
  if (data.type === 'pong') {
    if (opponentDisconnected) {
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      renderAll();
    }
    return;
  }

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

    clearGuestJoinTimers();

    // Ignore duplicate match_start for the same active match arriving over a secondary transport
    if (
      net.mode === 'online' &&
      typeof data.matchId === 'string' &&
      net.currentMatchId === data.matchId
    ) {
      net.peerName = sanitizePlayerName(data.hostName || 'Host');
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      renderAll();
      return;
    }

    net.currentMatchId = typeof data.matchId === 'string' ? data.matchId : 'm_' + Date.now();
    net.mode = 'online';
    net.myColor = data.yourColor;
    net.peerName = sanitizePlayerName(data.hostName || 'Host');
    net.roomLocked = true;
    net.myRematchWanted = false;
    net.peerRematchWanted = false;
    net.drawOfferedBy = null;
    net.pendingOptimisticPly = null;
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();
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
    scrollBoardIntoViewOnMobile();
  } else if (data.type === 'sync_state') {
    const hydrated = validateAndHydrateState(data.state);
    if (!hydrated) return;

    // If Guest was still in 'joining' mode and received sync_state first, complete the join transition!
    const wasJoining = net.mode === 'joining';
    if (wasJoining) {
      clearGuestJoinTimers();
      net.mode = 'online';
      if (data.yourColor === 'w' || data.yourColor === 'b') {
        net.myColor = data.yourColor;
        boardFlipped = net.myColor === 'b';
      }
      if (typeof data.matchId === 'string') {
        net.currentMatchId = data.matchId;
      }
      net.roomLocked = true;
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      setGameFeedback('');
      playSound('gameStart');
    }

    const prevMoveCount = gameState.moveHistory.length;
    const prevStatus = gameState.status;
    const wasAtLive = wasJoining || viewPly === prevMoveCount;

    if (typeof data.hostName === 'string') {
      net.peerName = sanitizePlayerName(data.hostName);
    }
    net.drawOfferedBy =
      data.drawOfferedBy === 'w' || data.drawOfferedBy === 'b' ? data.drawOfferedBy : null;

    applyClockPayload(data.clock);

    const prevState = gameState;
    const newMoveCount = hydrated.moveHistory.length;

    // Re-stitch earlier historyFrames if Host sent a compact tail window during live play
    // (preserving fog-masked history prefix during live Fog of War too, until full post-game reveal)
    if (
      prevState &&
      prevState.variant === hydrated.variant &&
      Boolean(prevState.fogMasked) === Boolean(hydrated.fogMasked) &&
      Array.isArray(prevState.historyFrames) &&
      newMoveCount + 1 > hydrated.historyFrames.length
    ) {
      const neededPrefix = newMoveCount + 1 - hydrated.historyFrames.length;
      if (prevState.historyFrames.length >= neededPrefix) {
        hydrated.historyFrames = prevState.historyFrames
          .slice(0, neededPrefix)
          .concat(hydrated.historyFrames);
      }
    }

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
    if (wasJoining) {
      viewPly = newMoveCount;
    }

    // 3. New move(s) played on board (Opponent's move -> upgrade selection or fire next premove!)
    if (newMoveCount > prevMoveCount && !wasJoining) {
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

    // 4. Same move count (name update, dice roll sync, draw offer/decline, resignation, or timeout)
    const diceJustRolled = Boolean(
      !wasJoining &&
        prevStatus === 'playing' &&
        gameState.status === 'playing' &&
        getVariantDef(gameState).diceChess &&
        (prevState?.dice?.rolled === false || !Array.isArray(prevState?.dice?.values)) &&
        gameState.dice?.rolled !== false &&
        Array.isArray(gameState.dice?.values)
    );
    if (diceJustRolled) {
      playDiceOutcomeSounds(gameState.dice);
    }

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
  stopHeartbeat();
  clearOpponentDisconnectGraceTimer();
  if (guestReconnectTimer) {
    clearTimeout(guestReconnectTimer);
    guestReconnectTimer = null;
  }
  guestReconnectAttempts = 0;
  clearGuestJoinTimers();

  if (net.remotePeerId && hasActiveSignalingSocket(net.peer)) {
    sendRawSignalingEnvelope(net.remotePeerId, {
      __chessRelay: true,
      kind: 'close'
    });
  }
  if (net.bcChannel && net.bcOpen) {
    sendViaBroadcastChannel({
      __chessRelay: true,
      kind: 'close'
    });
  }
  if (net.bcChannel) {
    try {
      net.bcChannel.close();
    } catch (_) {}
    net.bcChannel = null;
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
  net.remotePeerId = null;
  net.relayOpen = false;
  net.bcOpen = false;
  net.bcPeerId = null;
  net.currentMatchId = null;
  net.roomLocked = false;
  net.myRematchWanted = false;
  net.peerRematchWanted = false;
  net.drawOfferedBy = null;
  net.pendingOptimisticPly = null;
  net.msgTimestamps = [];
  net.rxPktIds.clear();
  net.relayChunks.clear();
  opponentDisconnected = false;
  clockState.timed = false;
  clockState.running = false;
  premoveQueue = [];
  clearBoardTransientUI();
}

function runHeartbeatTick() {
  if (net.peer && !net.peer.destroyed) {
    if (net.peer.disconnected) {
      try {
        net.peer.reconnect();
      } catch (_) {}
    } else if (net.peer.socket && typeof net.peer.socket._sendHeartbeat === 'function') {
      try {
        net.peer.socket._sendHeartbeat();
      } catch (_) {}
    }
  }
  if (isLogicalConnOpen(net.conn)) {
    sendPacket(net.conn, { type: 'ping', t: Date.now() });
  }
  if (
    net.mode === 'online' &&
    (gameState.status === 'playing' || gameState.status === 'secret_pick') &&
    !opponentDisconnected &&
    Date.now() - lastHeartbeatReceived > 25000
  ) {
    handleTransientDisconnect();
  }
}

function startHeartbeat() {
  stopHeartbeat();
  lastHeartbeatReceived = Date.now();
  if (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    net.peer &&
    net.peer.socket
  ) {
    try {
      const blob = new Blob(
        ['var t=setInterval(function(){postMessage("tick");},3000);onmessage=function(e){if(e.data==="stop")clearInterval(t);};'],
        { type: 'application/javascript' }
      );
      const url = URL.createObjectURL(blob);
      heartbeatWorker = new Worker(url);
      URL.revokeObjectURL(url);
      heartbeatWorker.onmessage = () => runHeartbeatTick();
      return;
    } catch (_) {
      heartbeatWorker = null;
    }
  }
  heartbeatInterval = setInterval(runHeartbeatTick, 3000);
}

function stopHeartbeat() {
  if (heartbeatWorker) {
    try {
      heartbeatWorker.postMessage('stop');
      heartbeatWorker.terminate();
    } catch (_) {}
    heartbeatWorker = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startOpponentDisconnectGrace() {
  clearOpponentDisconnectGraceTimer();
  opponentGraceSecondsLeft = 30;
  opponentDisconnected = true;
  // Clock continues running: switching apps (e.g. to Discord) does not pause the match timer
  renderAll();

  opponentGraceTimer = setInterval(() => {
    opponentGraceSecondsLeft--;
    if (opponentGraceSecondsLeft <= 0) {
      clearOpponentDisconnectGraceTimer();
      if (
        net.mode === 'online' &&
        (gameState.status === 'playing' || gameState.status === 'secret_pick')
      ) {
        gameState.status = 'resigned';
        gameState.winner = net.myColor;
        setGameFeedback('Opponent disconnected and did not return.');
        playSound('gameEnd');
        renderAll();
      }
    } else {
      renderStatusAndControls();
    }
  }, 1000);
}

function clearOpponentDisconnectGraceTimer() {
  if (opponentGraceTimer) {
    clearInterval(opponentGraceTimer);
    opponentGraceTimer = null;
  }
}

function handleTransientDisconnect() {
  if (net.mode !== 'online') return;
  const isMatchActive = gameState.status === 'playing' || gameState.status === 'secret_pick';
  if (!isMatchActive) {
    opponentDisconnected = true;
    clockState.running = false;
    renderAll();
    return;
  }

  if (!opponentGraceTimer) {
    startOpponentDisconnectGrace();
  }

  if (net.role === 'guest') {
    attemptGuestReconnect();
  }
}

function attemptGuestReconnect() {
  if (net.role !== 'guest' || !net.roomCode || net.mode !== 'online') return;
  if (guestReconnectAttempts >= 20) return;
  if (guestReconnectTimer) return;

  guestReconnectAttempts++;
  guestReconnectTimer = setTimeout(() => {
    guestReconnectTimer = null;
    if (net.role !== 'guest' || net.mode !== 'online' || isLogicalConnOpen(net.conn)) return;

    if (!net.peer || net.peer.destroyed) {
      const guestPeerId =
        PEER_ID_PREFIX + net.roomCode + '-g-' + Math.random().toString(36).slice(2, 8);
      const peer = new Peer(guestPeerId, { config: PEER_ICE_CONFIG });
      net.peer = peer;
      setupPeerRelayHook(peer);
      setupBroadcastChannelForRoom(net.roomCode, peer);
      peer.on('open', () => {
        connectToHostForReconnect(peer);
      });
      peer.on('disconnected', () => {
        if (net.mode !== 'local' && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch (_) {}
        }
      });
      return;
    }

    if (net.peer.disconnected) {
      try {
        net.peer.reconnect();
      } catch (_) {}
    }

    connectToHostForReconnect(net.peer);
  }, 1800);
}

function connectToHostForReconnect(peer) {
  try {
    const hostPeerId = PEER_ID_PREFIX + net.roomCode;
    net.remotePeerId = hostPeerId;
    setupPeerRelayHook(peer);

    if (hasActiveSignalingSocket(peer)) {
      sendRawSignalingEnvelope(
        hostPeerId,
        {
          __chessRelay: true,
          kind: 'open',
          name: net.myName,
          reconnect: true
        },
        peer
      );
    }
    if (net.bcChannel) {
      sendViaBroadcastChannel({
        __chessRelay: true,
        kind: 'open',
        name: net.myName,
        reconnect: true
      });
    }

    if (net.conn) {
      try {
        net.conn.close();
      } catch (_) {}
    }
    const newConn = peer.connect(hostPeerId);
    net.conn = newConn;

    const onReconnected = () => {
      if (net.conn !== newConn) return;
      guestReconnectAttempts = 0;
      clearOpponentDisconnectGraceTimer();
      opponentDisconnected = false;
      startHeartbeat();
      setGameFeedback('Reconnected to game!');
      setTimeout(() => setGameFeedback(''), 3000);
      sendPacket(newConn, { type: 'hello', name: net.myName, reconnect: true });
      renderAll();
    };

    if (newConn.open) onReconnected();
    else newConn.on('open', onReconnected);

    newConn.on('data', (data) => {
      if (net.conn === newConn) {
        receiveDeduplicatedPacket(data, data && data._pktId);
      }
    });

    newConn.on('close', () => {
      if (net.conn === newConn && !isLogicalConnOpen(newConn)) {
        handleTransientDisconnect();
      }
    });

    newConn.on('error', () => {
      if (net.conn === newConn && !isLogicalConnOpen(newConn)) {
        handleTransientDisconnect();
      }
    });
  } catch (_) {
    attemptGuestReconnect();
  }
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
  if (setupConfig.customState) {
    gameState = createCustomState(setupConfig.customState);
  } else {
    gameState = createInitialState(setupConfig.variant);
  }
  viewPly = 0;
  renderAll();

  const peer = new Peer(PEER_ID_PREFIX + code, { config: PEER_ICE_CONFIG });
  net.peer = peer;
  setupPeerRelayHook(peer);
  setupBroadcastChannelForRoom(code, peer);

  peer.on('connection', (incomingConn) => {
    const incomingPeerId = incomingConn && typeof incomingConn.peer === 'string' ? incomingConn.peer : null;
    const isSameGuestPeer = Boolean(incomingPeerId && net.remotePeerId && incomingPeerId === net.remotePeerId);
    const isGameActive =
      net.mode === 'online' &&
      (gameState.status === 'playing' || gameState.status === 'secret_pick');
    const isConnectionDead = !isLogicalConnOpen(net.conn) || opponentDisconnected;

    // Allow re-connecting guest (or WebRTC completing after WSS Relay already started the match) to attach!
    if ((isGameActive && isConnectionDead) || isSameGuestPeer) {
      if (net.conn && net.conn !== incomingConn) {
        try {
          net.conn.close();
        } catch (_) {}
      }
      net.conn = incomingConn;
      if (incomingPeerId) net.remotePeerId = incomingPeerId;
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();

      const acceptReconnect = () => {
        if (net.conn !== incomingConn) return;
        onHostGuestChannelReady(!isSameGuestPeer);
      };

      if (incomingConn.open) acceptReconnect();
      else incomingConn.on('open', acceptReconnect);

      incomingConn.on('data', (data) => {
        if (net.conn === incomingConn) {
          receiveDeduplicatedPacket(data, data && data._pktId);
        }
      });

      incomingConn.on('close', () => {
        if (net.conn === incomingConn && !isLogicalConnOpen(incomingConn)) {
          handleTransientDisconnect();
        }
      });

      incomingConn.on('error', () => {
        if (net.conn === incomingConn && !isLogicalConnOpen(incomingConn)) {
          handleTransientDisconnect();
        }
      });
      return;
    }

    // ROOM LOCKING: Reject 3rd-party intruders if room is already active with 2 players
    if ((net.conn !== null && net.conn.open) || net.roomLocked) {
      const rejectIntruder = () => {
        sendPacket(incomingConn, { type: 'room_locked' });
        setTimeout(() => {
          try {
            incomingConn.close();
          } catch (_) {}
        }, 150);
      };
      if (incomingConn.open) rejectIntruder();
      else incomingConn.on('open', rejectIntruder);
      return;
    }

    net.conn = incomingConn;
    if (incomingPeerId) net.remotePeerId = incomingPeerId;
    if (!hasActiveSignalingSocket(peer)) {
      net.roomLocked = true;
    }

    const activateGuest = () => {
      if (net.conn !== incomingConn) return;
      onHostGuestChannelReady(false);
    };

    if (incomingConn.open) activateGuest();
    else incomingConn.on('open', activateGuest);

    incomingConn.on('data', (data) => {
      if (net.conn === incomingConn) {
        receiveDeduplicatedPacket(data, data && data._pktId);
      }
    });

    incomingConn.on('close', () => {
      if (net.conn === incomingConn && !isLogicalConnOpen(incomingConn)) {
        if (net.mode === 'waiting') {
          net.conn = null;
          net.roomLocked = false;
        } else {
          handleTransientDisconnect();
        }
      }
    });

    incomingConn.on('error', () => {
      if (net.conn === incomingConn && !isLogicalConnOpen(incomingConn)) {
        if (net.mode === 'waiting') {
          net.conn = null;
          net.roomLocked = false;
        } else {
          handleTransientDisconnect();
        }
      }
    });
  });

  peer.on('disconnected', () => {
    if (net.mode !== 'local' && !peer.destroyed) {
      try {
        peer.reconnect();
      } catch (_) {}
    }
  });

  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id' && retryCount < 4) {
      createGameRoom(retryCount + 1);
      return;
    }
    if (net.mode !== 'online' && !isLogicalConnOpen(net.conn)) {
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
  const hostPeerId = PEER_ID_PREFIX + code;
  net.remotePeerId = hostPeerId;
  if (dom.joinInput) dom.joinInput.value = code;
  renderAll();

  const guestPeerId = PEER_ID_PREFIX + code + '-g-' + Math.random().toString(36).slice(2, 8);
  const peer = new Peer(guestPeerId, { config: PEER_ICE_CONFIG });
  net.peer = peer;
  setupPeerRelayHook(peer);
  setupBroadcastChannelForRoom(code, peer);

  if (net.bcChannel) {
    sendViaBroadcastChannel({
      __chessRelay: true,
      kind: 'open',
      name: net.myName,
      reconnect: false
    });
  }

  net.joinTimer = setTimeout(() => {
    if (net.mode === 'joining') {
      cleanupNetworkSession();
      setGameFeedback(`Could not connect to game ${code}. Check the code and try again.`);
      renderAll();
    }
  }, 15000);

  peer.on('disconnected', () => {
    if (net.mode !== 'local' && !peer.destroyed) {
      try {
        peer.reconnect();
      } catch (_) {}
    }
  });

  peer.on('open', () => {
    if (net.peer !== peer) return;

    const attemptRelayAndHello = () => {
      if (net.peer !== peer || net.mode !== 'joining') return;
      if (hasActiveSignalingSocket(peer)) {
        sendRawSignalingEnvelope(
          hostPeerId,
          {
            __chessRelay: true,
            kind: 'open',
            name: net.myName,
            reconnect: false
          },
          peer
        );
      }
      if (net.bcChannel) {
        sendViaBroadcastChannel({
          __chessRelay: true,
          kind: 'open',
          name: net.myName,
          reconnect: false
        });
      }
    };

    attemptRelayAndHello();
    if (hasActiveSignalingSocket(peer) || net.bcChannel) {
      net.joinRetryTimer = setInterval(attemptRelayAndHello, 1200);
    }

    const conn = peer.connect(hostPeerId);
    net.conn = conn;

    const sendHello = () => {
      sendPacket(conn, { type: 'hello', name: net.myName });
      startHeartbeat();
    };

    if (conn.open) sendHello();
    else conn.on('open', sendHello);

    conn.on('data', (data) => {
      if (net.conn === conn) {
        receiveDeduplicatedPacket(data, data && data._pktId);
      }
    });

    conn.on('close', () => {
      if (net.conn === conn && !isLogicalConnOpen(conn)) {
        if (net.mode === 'joining') {
          cleanupNetworkSession();
          setGameFeedback(`Connection to game ${code} closed.`);
        } else {
          handleTransientDisconnect();
        }
      }
    });

    conn.on('error', () => {
      if (net.conn === conn && !isLogicalConnOpen(conn)) {
        if (net.mode === 'joining') {
          cleanupNetworkSession();
          setGameFeedback(`Failed to connect to game ${code}.`);
        } else {
          handleTransientDisconnect();
        }
      }
    });
  });

  peer.on('error', (err) => {
    if (net.peer !== peer) return;
    if (net.mode === 'online' && isLogicalConnOpen(net.conn)) return;
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
  pointerType: 'mouse',
  startX: 0,
  startY: 0,
  originSq: null,
  pocketType: null,
  pocketColor: null,
  hoverSq: null
};

const rcDrag = {
  active: false,
  pointerId: null,
  originSq: null
};

const dom = {};

function scrollBoardIntoViewOnMobile() {
  if (typeof window !== 'undefined' && window.innerWidth <= 900 && typeof window.scrollTo === 'function') {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }
}

function setMobileTab(tabName) {
  const valid = ['play', 'variants', 'moves'].includes(tabName) ? tabName : 'play';
  if (dom.sidebar) {
    dom.sidebar.dataset.mobileTab = valid;
  }
  if (dom.mobileTabs) {
    for (const btn of dom.mobileTabs.querySelectorAll('.mobile-tab-btn')) {
      btn.classList.toggle('active', btn.dataset.tab === valid);
    }
  }
}

function cacheDom() {
  dom.sidebar = document.getElementById('sidebar');
  dom.gameBox = document.getElementById('game-box');
  dom.boardShell = document.getElementById('board-shell');
  dom.board = document.getElementById('board');
  dom.boardArrows = document.getElementById('board-arrows');
  dom.dragGhost = document.getElementById('drag-ghost');
  dom.promoBackdrop = document.getElementById('promotion-backdrop');
  dom.promoMenu = document.getElementById('promotion-menu');

  dom.mobileVariantPill = document.getElementById('mobile-variant-pill');
  dom.mobileVariantUse = document.getElementById('mobile-variant-pill-use');
  dom.mobileVariantLabel = document.getElementById('mobile-variant-pill-label');
  dom.mobileSoundBtn = document.getElementById('mobile-sound-btn');
  dom.mobileSoundOn = document.getElementById('mobile-sound-on');
  dom.mobileSoundOff = document.getElementById('mobile-sound-off');
  dom.mobileModeBadge = document.getElementById('mobile-mode-badge');

  dom.mobileStatusStrip = document.getElementById('mobile-status-strip');
  dom.mobileStatusText = document.getElementById('mobile-status-text');
  dom.mobileCancelPremoveBtn = document.getElementById('mobile-cancel-premove-btn');
  dom.mobileDrawBanner = document.getElementById('mobile-draw-banner');
  dom.mobAcceptDrawBtn = document.getElementById('mob-accept-draw-btn');
  dom.mobDeclineDrawBtn = document.getElementById('mob-decline-draw-btn');
  dom.mobPrevBtn = document.getElementById('mob-prev-btn');
  dom.mobNextBtn = document.getElementById('mob-next-btn');
  dom.mobFlipBtn = document.getElementById('mob-flip-btn');
  dom.mobLocalActions = document.getElementById('mob-local-actions');
  dom.mobResetBtn = document.getElementById('mob-reset-btn');
  dom.mobPlayFriendBtn = document.getElementById('mob-play-friend-btn');
  dom.mobOnlineActions = document.getElementById('mob-online-actions');
  dom.mobDrawBtn = document.getElementById('mob-draw-btn');
  dom.mobResignBtn = document.getElementById('mob-resign-btn');
  dom.mobRematchBtn = document.getElementById('mob-rematch-btn');

  dom.mobileTabs = document.getElementById('mobile-tabs');
  dom.mobileVariantPanel = document.getElementById('mobile-variant-panel');
  dom.mobileVariantsHint = document.getElementById('mobile-variants-hint');
  dom.mobileVariantGrid = document.getElementById('mobile-variant-grid');
  dom.variantTooltip = document.getElementById('variant-tooltip');

  dom.topSwatch = document.getElementById('top-color-swatch');
  dom.topName = document.getElementById('top-player-name');
  dom.topElo = document.getElementById('top-player-elo');
  dom.topTurn = document.getElementById('top-turn-pill');
  dom.topCapturedRow = document.getElementById('top-captured-row');
  dom.topCaptured = document.getElementById('top-captured');
  dom.topMaterial = document.getElementById('top-material');
  dom.topPocket = document.getElementById('top-pocket');
  dom.topClock = document.getElementById('top-clock');

  dom.bottomSwatch = document.getElementById('bottom-color-swatch');
  dom.bottomName = document.getElementById('bottom-player-name');
  dom.bottomElo = document.getElementById('bottom-player-elo');
  dom.bottomTurn = document.getElementById('bottom-turn-pill');
  dom.bottomCapturedRow = document.getElementById('bottom-captured-row');
  dom.bottomCaptured = document.getElementById('bottom-captured');
  dom.bottomMaterial = document.getElementById('bottom-material');
  dom.bottomPocket = document.getElementById('bottom-pocket');
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
  dom.setupVariantGrid = document.getElementById('setup-variant-grid');
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
  dom.pasteCodeBtn = document.getElementById('paste-code-btn');
  dom.joinBtn = document.getElementById('join-game-btn');

  dom.brandHomeBtn = document.getElementById('brand-home-btn');
  dom.desktopHomeBtn = document.getElementById('desktop-home-btn');
  dom.mobileBrandHomeBtn = document.getElementById('mobile-brand-home-btn');
  dom.mobileHomeBtn = document.getElementById('mobile-home-btn');
  dom.mobLeaveBtn = document.getElementById('mob-leave-btn');
  dom.cancelJoinBtn = document.getElementById('cancel-join-btn');
  dom.customPositionBtn = document.getElementById('custom-position-btn');
  dom.mobCustomPositionBtn = document.getElementById('mob-custom-position-btn');

  dom.gameEditor = document.getElementById('game-editor');
  dom.editorBackBtn = document.getElementById('editor-back-btn');
  dom.editorError = document.getElementById('editor-error');
  dom.editorPalette = document.getElementById('editor-palette');
  dom.editorEraseTool = document.getElementById('editor-erase-tool');
  dom.editorTurnWhite = document.getElementById('editor-turn-white');
  dom.editorTurnBlack = document.getElementById('editor-turn-black');
  dom.editorVariantChips = document.getElementById('editor-variant-chips');
  dom.editorPocketsSection = document.getElementById('editor-pockets-section');
  dom.editorWhitePocket = document.getElementById('editor-white-pocket');
  dom.editorBlackPocket = document.getElementById('editor-black-pocket');
  dom.editorCastlingWk = document.getElementById('editor-castling-wk');
  dom.editorCastlingWq = document.getElementById('editor-castling-wq');
  dom.editorCastlingBk = document.getElementById('editor-castling-bk');
  dom.editorCastlingBq = document.getElementById('editor-castling-bq');
  dom.editorClearBtn = document.getElementById('editor-clear-btn');
  dom.editorResetBtn = document.getElementById('editor-reset-btn');
  dom.editorPlayLocalBtn = document.getElementById('editor-play-local-btn');
  dom.editorPlayOnlineBtn = document.getElementById('editor-play-online-btn');

  dom.waitingSummary = document.getElementById('waiting-summary');
  dom.codeDisplay = document.getElementById('game-code-display');
  dom.copyCodeBtn = document.getElementById('copy-code-btn');
  dom.shareLinkBtn = document.getElementById('share-link-btn');
  dom.copyLinkBtn = document.getElementById('copy-link-btn');
  dom.cancelGameBtn = document.getElementById('cancel-game-btn');

  dom.activeGameCode = document.getElementById('active-game-code');
  dom.activeVariantTag = document.getElementById('active-variant-tag');
  dom.activeTimeTag = document.getElementById('active-time-tag');
  dom.leaveGameBtn = document.getElementById('leave-game-btn');

  dom.statusBanner = document.getElementById('status-banner');
  dom.premoveCancelBar = document.getElementById('premove-cancel-bar');
  dom.premoveCountLabel = document.getElementById('premove-count-label');
  dom.cancelPremoveBtn = document.getElementById('cancel-premove-btn');
  dom.drawOfferBanner = document.getElementById('draw-offer-banner');
  dom.acceptDrawBtn = document.getElementById('accept-draw-btn');
  dom.declineDrawBtn = document.getElementById('decline-draw-btn');

  dom.copyPgnBtn = document.getElementById('copy-pgn-btn');
  dom.moveList = document.getElementById('move-list');
  dom.navFirstBtn = document.getElementById('nav-first-btn');
  dom.navPrevBtn = document.getElementById('nav-prev-btn');
  dom.navNextBtn = document.getElementById('nav-next-btn');
  dom.navLastBtn = document.getElementById('nav-last-btn');

  dom.localVariantBar = document.getElementById('local-variant-bar');
  dom.localControls = document.getElementById('local-controls');
  dom.onlineControls = document.getElementById('online-controls');
  dom.resetLocalBtn = document.getElementById('reset-local-btn');
  dom.flipBoardBtn = document.getElementById('flip-board-btn');
  dom.drawBtn = document.getElementById('draw-btn');
  dom.resignBtn = document.getElementById('resign-btn');
  dom.rematchBtn = document.getElementById('rematch-btn');

  dom.secretPickBar = document.getElementById('secret-pick-bar');
  dom.secretPickText = document.getElementById('secret-pick-text');
  dom.secretRandomBtn = document.getElementById('secret-random-btn');
  dom.secretConfirmBtn = document.getElementById('secret-confirm-btn');

  dom.diceBar = document.getElementById('dice-bar');
  dom.diceAutoRollToggle = document.getElementById('dice-autoroll-toggle');
  dom.diceFeltWell = document.getElementById('dice-felt-well');
  dom.diceRollBtn = document.getElementById('dice-roll-btn');
  dom.dieCard1 = document.getElementById('die-card-1');
  dom.dieSvg1 = document.getElementById('die-svg-1');
  dom.diePieceImg1 = document.getElementById('die-piece-img-1');
  dom.dieLabel1 = document.getElementById('die-label-1');
  dom.dieCard2 = document.getElementById('die-card-2');
  dom.dieSvg2 = document.getElementById('die-svg-2');
  dom.diePieceImg2 = document.getElementById('die-piece-img-2');
  dom.dieLabel2 = document.getElementById('die-label-2');
  dom.diceDoublesBadge = document.getElementById('dice-doubles-badge');
  dom.diceCastleBadge = document.getElementById('dice-castle-badge');
  dom.diceSkipBadge = document.getElementById('dice-skip-badge');
  dom.dicePromptText = document.getElementById('dice-prompt-text');
  dom.diceSkipBtn = document.getElementById('dice-skip-btn');
}

function isViewingLive() {
  return viewPly === gameState.moveHistory.length;
}

function isFogActiveNow() {
  return Boolean(
    getVariantDef(gameState).fogOfWar &&
      gameState.status === 'playing' &&
      net.mode !== 'waiting' &&
      net.mode !== 'setup' &&
      net.mode !== 'joining'
  );
}

function getFogViewerColor() {
  return net.mode === 'online' ? net.myColor : gameState.turn;
}

function getReplayMinPly() {
  const frames = gameState.historyFrames;
  if (!frames || frames.length === 0) return gameState.moveHistory.length;
  return Math.max(0, gameState.moveHistory.length + 1 - frames.length);
}

function getFrameForPly(ply) {
  const frames = gameState.historyFrames;
  if (!frames || frames.length === 0) {
    return makeHistoryFrame(gameState, null);
  }
  const minPly = getReplayMinPly();
  const idx = Math.max(0, Math.min(frames.length - 1, ply - minPly));
  return frames[idx];
}

function getDisplayedFrame() {
  return getFrameForPly(viewPly);
}

function getVisibleSquaresForFrame(frame, viewerColor, liveStateFallback = null) {
  if (!getVariantDef(gameState).fogOfWar) return null;
  if (gameState.fogMasked) {
    const keys =
      frame && Array.isArray(frame.fogVisible)
        ? frame.fogVisible
        : Array.isArray(gameState.fogVisible)
          ? gameState.fogVisible
          : [];
    return new Set(keys);
  }
  if (frame && frame.fogVis && Array.isArray(frame.fogVis[viewerColor])) {
    return new Set(frame.fogVis[viewerColor]);
  }
  if (liveStateFallback) {
    return computeVisibleSquares(liveStateFallback, viewerColor);
  }
  return computeVisibleSquares(
    {
      ...gameState,
      board: frame?.board || gameState.board,
      turn: frame?.turn || gameState.turn
    },
    viewerColor
  );
}

function canPlayerMovePiece(color) {
  if (!isViewingLive()) return false;
  if (gameState.status !== 'playing' || opponentDisconnected) return false;
  if (net.mode === 'waiting' || net.mode === 'joining' || net.mode === 'setup') return false;
  const isMyTurn = net.mode === 'online' ? gameState.turn === net.myColor : true;
  if (!isMyTurn) return false;
  if (getVariantDef(gameState).diceChess) {
    if (
      !gameState.dice ||
      gameState.dice.rolled === false ||
      !Array.isArray(gameState.dice.values) ||
      gameState.dice.noLegalMoves
    ) {
      return false;
    }
    if (gameState.dice.isDoubles) {
      return color === 'w' || color === 'b';
    }
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
  selectedPocketType = null;
  selectedLegalMoves = [];
  premoveOriginSq = null;
  premovePocketType = null;
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
    drag.pocketType = null;
    drag.pocketColor = null;
    endDragVisuals();
  }
}

let diceAutoPassTimer = null;
let diceAutoRollTimer = null;
let diceScrambleTimer = null;
let diceAudioSettleTimer = null;
let diceAutoRollEnabled = false;
let lastRenderedDiceKey = '';

function clearDiceAutoRollTimer() {
  if (diceAutoRollTimer) {
    clearTimeout(diceAutoRollTimer);
    diceAutoRollTimer = null;
  }
}

function clearDiceScrambleTimer() {
  if (diceScrambleTimer) {
    clearTimeout(diceScrambleTimer);
    diceScrambleTimer = null;
  }
}

function clearDiceAudioSettleTimer() {
  if (diceAudioSettleTimer) {
    clearTimeout(diceAudioSettleTimer);
    diceAudioSettleTimer = null;
  }
}

function clearDiceAutoPassTimer() {
  if (diceAutoPassTimer) {
    clearTimeout(diceAutoPassTimer);
    diceAutoPassTimer = null;
  }
  clearDiceAutoRollTimer();
  clearDiceScrambleTimer();
  clearDiceAudioSettleTimer();
}

function clearBoardTransientUI() {
  clearDiceAutoPassTimer();
  lastRenderedDiceKey = '';
  if (typeof hideVariantTooltip === 'function') {
    hideVariantTooltip();
  }
  cancelActiveDrag();
  clearSelection();
  clearAnnotations();
  closePromotionPicker();
  resetResignConfirm();
  pendingSlideAnim = null;
  secretPickCol = null;
}

function getDisplayedLegalMovesForSquare(state, r, c) {
  if (!state || state.status !== 'playing') return [];
  const vDef = getVariantDef(state);
  if (!vDef.secretQueen || !state.secretQueens) {
    return getLegalMovesForSquare(state, r, c);
  }

  // Mask any unrevealed Secret Queen that must stay hidden on this screen:
  // - In local mode: mask BOTH White and Black unrevealed Secret Queens so neither player's
  //   secret queen location, Queen-only move dots, or hidden pin restrictions are shown on the shared screen.
  // - In online mode: mask the OPPONENT's unrevealed Secret Queen so hidden pins/checks aren't spoiled before interaction.
  const maskedState = cloneState(state);
  for (const col of ['w', 'b']) {
    const sqInfo = maskedState.secretQueens?.[col];
    if (sqInfo && !sqInfo.revealed) {
      const shouldHide = net.mode === 'online' ? col !== net.myColor : true;
      if (shouldHide) {
        maskedState.secretQueens[col] = {
          sq: null,
          revealed: false,
          picked: Boolean(sqInfo.picked)
        };
      }
    }
  }
  return getLegalMovesForSquare(maskedState, r, c);
}

function selectSquare(r, c) {
  premoveOriginSq = null;
  premovePocketType = null;
  premoveTargets = [];
  selectedPocketType = null;
  selectedSq = { r, c };
  selectedLegalMoves = getLegalMovesForSquare(gameState, r, c);
}

function selectPocketPiece(dropType) {
  premoveOriginSq = null;
  premovePocketType = null;
  premoveTargets = [];
  selectedSq = null;
  selectedPocketType = dropType;
  selectedLegalMoves = getLegalDropMoves(gameState, dropType, gameState.turn);
}

function selectPremoveOrigin(r, c) {
  selectedSq = null;
  selectedPocketType = null;
  selectedLegalMoves = [];
  premovePocketType = null;
  premoveOriginSq = { r, c };
  const projState = getProjectedPremoveState();
  premoveTargets = getPremoveTargetsForSquare(projState, r, c, net.myColor);
}

function selectPremovePocket(dropType) {
  selectedSq = null;
  selectedPocketType = null;
  selectedLegalMoves = [];
  premoveOriginSq = null;
  premovePocketType = dropType;
  const projState = getProjectedPremoveState();
  premoveTargets = getPremoveDropTargets(projState, dropType, net.myColor);
}

// --- Smooth Piece Slide Animation (FLIP transition) ---

function queueSlideAnimationFromFrame(frame, reverse = false) {
  if (!frame || !frame.lastMove || !frame.lastMove.from || !frame.lastMove.to) return;

  // In live Fog of War, only slide-animate if BOTH origin and destination are visible on screen
  // so pieces emerging from fog do not visually betray their hidden starting square!
  if (isFogActiveNow()) {
    const viewerColor = getFogViewerColor();
    const activeFrame = getDisplayedFrame();
    const vis = getVisibleSquaresForFrame(activeFrame, viewerColor, isViewingLive() ? gameState : null);
    const frameVis = reverse ? getVisibleSquaresForFrame(frame, viewerColor, null) : vis;
    const fromKey = `${frame.lastMove.from.r},${frame.lastMove.from.c}`;
    const toKey = `${frame.lastMove.to.r},${frame.lastMove.to.c}`;
    if (!vis || !vis.has(fromKey) || !vis.has(toKey) || !frameVis || !frameVis.has(fromKey) || !frameVis.has(toKey)) {
      return;
    }
  }

  const moves = [];
  if (reverse) {
    moves.push({ from: frame.lastMove.to, to: frame.lastMove.from });
    if (frame.meta?.rookMove?.from && frame.meta?.rookMove?.to) {
      moves.push({ from: frame.meta.rookMove.to, to: frame.meta.rookMove.from });
    }
    pendingSlideAnim = { moves };
    return;
  }

  moves.push({ from: frame.lastMove.from, to: frame.lastMove.to });
  if (frame.meta?.rookMove?.from && frame.meta?.rookMove?.to) {
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
  if (visCol === 7) {
    dom.promoMenu.style.right = '0';
    dom.promoMenu.style.left = 'auto';
  } else {
    dom.promoMenu.style.left = `${visCol * 12.5}%`;
    dom.promoMenu.style.right = 'auto';
  }
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
  if (legal.length === 0) {
    const pinTrigger = checkSecretQueenPinInteraction(gameState, from, to);
    if (pinTrigger) {
      revealSecretQueen(gameState, pinTrigger.secretColor);
      setGameFeedback('Illegal move blocked: Secret Queen revealed!');
      playSound('illegal');
      if (net.mode === 'online' && net.role === 'host') {
        broadcastHostState();
      }
      renderAll();
    }
    return false;
  }

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
    } else {
      const pinTrigger = checkSecretQueenPinInteraction(gameState, from, to);
      if (pinTrigger) {
        revealSecretQueen(gameState, pinTrigger.secretColor);
        setGameFeedback('Illegal move blocked: Secret Queen revealed!');
        playSound('illegal');
        renderAll();
      }
    }
    return;
  }

  if (net.mode === 'online') {
    if (net.role === 'host') {
      if (gameState.turn !== net.myColor) return;
      const prevState = gameState;
      const candidate = tryMakeMove(gameState, from, to, promotion);
      if (!candidate) {
        const pinTrigger = checkSecretQueenPinInteraction(gameState, from, to);
        if (pinTrigger) {
          revealSecretQueen(gameState, pinTrigger.secretColor);
          setGameFeedback('Illegal move blocked: Secret Queen revealed!');
          playSound('illegal');
          broadcastHostState();
          renderAll();
        }
        return;
      }

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
      if (!preview) {
        const pinTrigger = checkSecretQueenPinInteraction(gameState, from, to);
        if (pinTrigger) {
          revealSecretQueen(gameState, pinTrigger.secretColor);
          setGameFeedback('Illegal move blocked: Secret Queen revealed!');
          playSound('illegal');
          renderAll();
        }
        return;
      }

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

function submitPlayerDrop(dropType, to, viaDrag = false, fromPremove = false) {
  if (!fromPremove) {
    clearSelection();
    clearAnnotations();
  }
  viewPly = gameState.moveHistory.length;

  if (net.mode === 'local') {
    const prevState = gameState;
    const next = tryMakeDrop(gameState, dropType, to);
    if (next) {
      gameState = next;
      viewPly = gameState.moveHistory.length;
      playMoveFeedbackSound(prevState, gameState, true);
      renderAll();
    }
    return;
  }

  if (net.mode === 'online') {
    if (net.role === 'host') {
      if (gameState.turn !== net.myColor) return;
      const prevState = gameState;
      const candidate = tryMakeDrop(gameState, dropType, to);
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
      const preview = tryMakeDrop(gameState, dropType, to);
      if (!preview) return;

      gameState = preview;
      net.pendingOptimisticPly = gameState.moveHistory.length;
      net.drawOfferedBy = null;
      viewPly = gameState.moveHistory.length;
      drag.justDroppedMove = Boolean(viaDrag);

      if (fromPremove && typeof setTimeout === 'function') {
        const snapPrev = prevState;
        const snapNext = gameState;
        setTimeout(() => playMoveFeedbackSound(snapPrev, snapNext, true), 40);
      } else {
        playMoveFeedbackSound(prevState, gameState, true);
      }

      sendPacket(net.conn, {
        type: 'move_request',
        isDrop: true,
        dropType,
        to: { r: to.r, c: to.c }
      });
      if (!fromPremove) renderAll();
    }
  }
}

// --- Variant-Safe Multi-Premove Projection, Promotion & Seamless Turn Transitions ---

const MAX_PREMOVE_QUEUE = 32;

function applyPremoveStepToState(baseState, step, color) {
  if (!step || !isValidCoordObj(step.to)) return null;

  // Crazyhouse Pocket Drop Premove
  if (step.isDrop) {
    if (
      typeof step.dropType !== 'string' ||
      !Object.prototype.hasOwnProperty.call(PIECE_DEFS, step.dropType) ||
      PIECE_DEFS[step.dropType].isRoyal
    ) {
      return null;
    }
    const allowedDrops = getPremoveDropTargets(baseState, step.dropType, color);
    if (!allowedDrops.some((t) => t.r === step.to.r && t.c === step.to.c)) {
      return null;
    }

    const nextBoard = cloneBoard(baseState.board);
    nextBoard[step.to.r][step.to.c] = color + step.dropType;

    const nextPockets = {
      w: (baseState.pockets?.w || []).slice(),
      b: (baseState.pockets?.b || []).slice()
    };
    const idx = nextPockets[color].indexOf(step.dropType);
    if (idx < 0) return null;
    nextPockets[color].splice(idx, 1);

    const nextProj = {
      variant: baseState.variant || 'standard',
      board: nextBoard,
      turn: color,
      castling: { ...baseState.castling },
      enPassant: null,
      pockets: nextPockets
    };

    const def = PIECE_DEFS[step.dropType];
    if (def && typeof def.afterMove === 'function') {
      def.afterMove(nextProj, {
        isDrop: true,
        dropType: step.dropType,
        color,
        from: null,
        to: { ...step.to }
      });
    }
    return nextProj;
  }

  if (!isValidCoordObj(step.from)) return null;
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
      variant: baseState.variant || 'standard',
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
    variant: baseState.variant || 'standard',
    board: nextBoard,
    turn: color,
    castling: nextCastling,
    enPassant: null,
    pockets: {
      w: (baseState.pockets?.w || []).slice(),
      b: (baseState.pockets?.b || []).slice()
    }
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
    variant: state.variant || 'standard',
    board: cloneBoard(state.board),
    turn: color,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    pockets: {
      w: (state.pockets?.w || []).slice(),
      b: (state.pockets?.b || []).slice()
    }
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
    variant: gameState.variant || 'standard',
    board: cloneBoard(gameState.board),
    turn: net.myColor,
    castling: { ...gameState.castling },
    enPassant: gameState.enPassant ? { ...gameState.enPassant } : null,
    pockets: {
      w: (gameState.pockets?.w || []).slice(),
      b: (gameState.pockets?.b || []).slice()
    }
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
    variant: projState.variant || 'standard',
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
    variant: projState.variant || 'standard',
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
    isDrop: false,
    from: { r: from.r, c: from.c },
    to: { r: to.r, c: to.c },
    promotion: promotion || null
  });
  clearSelection();
  playSound('premove');
  renderAll();
}

function enqueuePremoveDrop(dropType, to) {
  if (!canUsePremoveMode()) return false;
  if (premoveQueue.length >= MAX_PREMOVE_QUEUE) {
    clearSelection();
    renderAll();
    return false;
  }
  const projState = getProjectedPremoveState();
  const targets = getPremoveDropTargets(projState, dropType, net.myColor);
  if (!targets.some((t) => t.r === to.r && t.c === to.c)) return false;

  premoveQueue.push({
    isDrop: true,
    dropType,
    from: null,
    to: { r: to.r, c: to.c },
    promotion: null
  });
  clearSelection();
  playSound('premove');
  renderAll();
  return true;
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
    premovePocketType !== null ||
    Boolean(pendingPromotion && pendingPromotion.isPremove);
  premoveQueue = [];
  if (drag.active && drag.isPremoveDrag) {
    cancelActiveDrag();
  }
  if (premoveOriginSq || premovePocketType) {
    premoveOriginSq = null;
    premovePocketType = null;
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

  if (premovePocketType) {
    if ((projState.pockets?.[net.myColor] || []).includes(premovePocketType)) {
      premoveTargets = getPremoveDropTargets(projState, premovePocketType, net.myColor);
    } else {
      cancelActiveDrag();
      clearSelection();
    }
    return;
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

      if (nextPre.isDrop) {
        const legalDrops = getLegalDropMoves(gameState, nextPre.dropType, net.myColor).filter(
          (m) => m.to.r === nextPre.to.r && m.to.c === nextPre.to.c
        );
        if (legalDrops.length > 0) {
          submitPlayerDrop(nextPre.dropType, nextPre.to, false, true);
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
      } else if (nextPre.from) {
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

    // 2A. Seamlessly upgrade selected/dragged Crazyhouse pocket piece into a live pocket selection/drag!
    if (premovePocketType) {
      const pType = premovePocketType;
      if ((gameState.pockets?.[net.myColor] || []).includes(pType) && isViewingLive()) {
        selectedPocketType = pType;
        selectedLegalMoves = getLegalDropMoves(gameState, pType, net.myColor);
        premovePocketType = null;
        premoveTargets = [];
        if (drag.active && drag.isPremoveDrag) {
          drag.isPremoveDrag = false;
        }
      } else {
        cancelActiveDrag();
        clearSelection();
      }
      return;
    }

    // 2B. Seamlessly upgrade selected/dragged premove board piece into a live selection/drag!
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

// --- Pointer Input (Click-to-Move, Drag-and-Drop, Pocket Drops, Multi-Premoves & Right-Click Arrows) ---

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
  if (dom.dragGhost) {
    dom.dragGhost.classList.add('hidden');
    dom.dragGhost.classList.remove('touch-drag');
  }
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

function handlePocketPointerDown(e, sideColor, dropType) {
  if (dom.promoBackdrop && !dom.promoBackdrop.classList.contains('hidden')) return;
  if (e.button === 2) {
    e.preventDefault();
    cancelAllPremoves();
    return;
  }
  if (e.button !== undefined && e.button !== 0) return;
  if (!isViewingLive() || !getVariantDef(gameState).allowDrops) return;

  if (drawnArrows.length > 0 || markedSquares.length > 0) {
    clearAnnotations();
  }

  if (canPlayerMovePiece(sideColor)) {
    const pocket = gameState.pockets?.[sideColor] || [];
    if (!pocket.includes(dropType)) return;
    e.preventDefault();
    const alreadySelected = selectedPocketType === dropType;
    selectPocketPiece(dropType);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = false;
    drag.wasAlreadySelected = alreadySelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = null;
    drag.pocketType = dropType;
    drag.pocketColor = sideColor;
    return;
  }

  if (canPlayerPremovePiece(sideColor)) {
    const projPocket = getProjectedPremoveState().pockets?.[sideColor] || [];
    if (!projPocket.includes(dropType)) return;
    e.preventDefault();
    const alreadyPreSelected = premovePocketType === dropType;
    selectPremovePocket(dropType);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = true;
    drag.wasAlreadySelected = alreadyPreSelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = null;
    drag.pocketType = dropType;
    drag.pocketColor = sideColor;
  }
}

function handleBoardPointerDown(e) {
  if (dom.promoBackdrop && !dom.promoBackdrop.classList.contains('hidden')) return;

  const sq = clientPointToSquare(e.clientX, e.clientY);
  if (!sq) return;

  if (net.mode === 'editor') {
    e.preventDefault();
    if (e.button === 2) {
      editorState.board[sq.r][sq.c] = null;
      editorSelectedSq = null;
      syncEditorCastlingValidity();
      renderBoard();
      return;
    }

    if (e.button !== undefined && e.button !== 0) return;

    if (editorState.selectedTool === 'erase') {
      editorState.board[sq.r][sq.c] = null;
      editorSelectedSq = null;
      syncEditorCastlingValidity();
      renderBoard();
      return;
    }

    if (editorState.selectedTool) {
      editorState.board[sq.r][sq.c] = editorState.selectedTool;
      editorSelectedSq = null;
      syncEditorCastlingValidity();
      renderBoard();
      return;
    }

    const occupant = editorState.board[sq.r][sq.c];
    if (editorSelectedSq) {
      if (editorSelectedSq.r === sq.r && editorSelectedSq.c === sq.c) {
        editorSelectedSq = null;
      } else {
        editorState.board[sq.r][sq.c] = editorState.board[editorSelectedSq.r][editorSelectedSq.c];
        editorState.board[editorSelectedSq.r][editorSelectedSq.c] = null;
        editorSelectedSq = null;
        syncEditorCastlingValidity();
      }
      renderBoard();
      return;
    }

    if (occupant) {
      editorSelectedSq = { r: sq.r, c: sq.c };
      drag.active = true;
      drag.moved = false;
      drag.pointerId = e.pointerId;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.originSq = { r: sq.r, c: sq.c };
      drag.from = { r: sq.r, c: sq.c };
      drag.pieceCode = occupant;
      drag.isEditorDrag = true;
      drag.pointerType = e.pointerType;
      renderBoard();
      return;
    }
    return;
  }

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

  if (gameState.status === 'secret_pick') {
    let pickColor = null;
    if (net.mode === 'online') {
      pickColor = net.myColor;
    } else {
      pickColor = !gameState.secretQueens?.w?.picked ? 'w' : 'b';
    }
    const pickRow = pickColor === 'w' ? 6 : 1;
    if (sq.r === pickRow && gameState.board[sq.r][sq.c] === pickColor + 'p') {
      secretPickCol = sq.c;
      if (dom.secretConfirmBtn) dom.secretConfirmBtn.disabled = false;
      renderBoard();
    }
    return;
  }

  const activeTurnColor = net.mode === 'online' ? net.myColor : gameState.turn;

  // 1A-Drop. Normal turn: Crazyhouse pocket piece is selected and player clicks a legal drop square -> Drop!
  if (selectedPocketType && canPlayerMovePiece(activeTurnColor)) {
    const isLegalDrop = selectedLegalMoves.some((m) => m.to.r === sq.r && m.to.c === sq.c);
    if (isLegalDrop) {
      e.preventDefault();
      submitPlayerDrop(selectedPocketType, sq, false, false);
      return;
    }
  }

  // 1A-Board. Normal turn: if friendly piece is selected and player clicks a legal target -> Move!
  if (selectedSq && canPlayerMovePiece(activeTurnColor)) {
    const isLegalTarget = selectedLegalMoves.some((m) => m.to.r === sq.r && m.to.c === sq.c);
    if (isLegalTarget) {
      e.preventDefault();
      requestOrOpenPromotion(selectedSq, sq, false);
      return;
    }
    const pinTrigger = checkSecretQueenPinInteraction(gameState, selectedSq, sq);
    if (pinTrigger) {
      e.preventDefault();
      revealSecretQueen(gameState, pinTrigger.secretColor);
      setGameFeedback('Illegal move blocked: Secret Queen revealed!');
      playSound('illegal');
      if (net.mode === 'online' && net.role === 'host') {
        broadcastHostState();
      }
      clearSelection();
      renderAll();
      return;
    }
  }

  // 1B-Drop. Opponent's turn (Premove mode): Crazyhouse pocket piece is selected -> Queue premove drop!
  if (premovePocketType && canUsePremoveMode()) {
    const isPreDrop = premoveTargets.some((t) => t.r === sq.r && t.c === sq.c);
    if (isPreDrop) {
      e.preventDefault();
      enqueuePremoveDrop(premovePocketType, sq);
      return;
    }
  }

  // 1B-Board. Opponent's turn (Premove mode): if premove origin is selected and player clicks a premove target -> Queue!
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
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = false;
    drag.wasAlreadySelected = alreadySelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = sq;
    drag.pocketType = null;
    drag.pocketColor = null;
    return;
  }

  // 2B. Pressing on your piece (including projected premoved pieces!) during opponent's turn -> Premove select / drag!
  if (code && canPlayerPremovePiece(pieceColor)) {
    e.preventDefault();
    const alreadyPreSelected = Boolean(
      premoveOriginSq && premoveOriginSq.r === sq.r && premoveOriginSq.c === sq.c
    );
    selectPremoveOrigin(sq.r, sq.c);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = true;
    drag.wasAlreadySelected = alreadyPreSelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = sq;
    drag.pocketType = null;
    drag.pocketColor = null;
    return;
  }

  // 3. Clicking empty/non-target square clears selection & cancels queued premoves
  if (
    selectedSq ||
    selectedPocketType ||
    premoveOriginSq ||
    premovePocketType ||
    premoveQueue.length > 0
  ) {
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
  const isTouchPointer = (e.pointerType || drag.pointerType) === 'touch';
  const dragThreshold = isTouchPointer ? 9 : 4;

  if (!drag.moved && Math.hypot(dx, dy) >= dragThreshold) {
    drag.moved = true;
    let originCode = null;
    if (drag.pocketType && drag.pocketColor) {
      originCode = drag.pocketColor + drag.pocketType;
    } else if (drag.originSq) {
      const displayBoard =
        net.mode === 'editor'
          ? editorState.board
          : isViewingLive()
          ? getInteractiveLiveBoard()
          : getDisplayedFrame().board;
      originCode = displayBoard[drag.originSq.r]?.[drag.originSq.c] || null;
    }
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
    dom.dragGhost.classList.toggle('touch-drag', isTouchPointer);
    dom.dragGhost.classList.remove('hidden');

    if (drag.originSq) {
      const sourceImg = dom.board.querySelector(
        `.square[data-r="${drag.originSq.r}"][data-c="${drag.originSq.c}"] .piece`
      );
      if (sourceImg) sourceImg.classList.add('dragging-source');
    }
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

  if (drag.isEditorDrag) {
    const origin = drag.from || drag.originSq;
    const pieceCode = drag.pieceCode;
    const wasDragging = drag.moved;
    drag.active = false;
    drag.moved = false;
    drag.isEditorDrag = false;
    drag.pointerId = null;
    drag.originSq = null;
    drag.from = null;
    drag.pieceCode = null;
    endDragVisuals();

    const dropSq = clientPointToSquare(e.clientX, e.clientY);
    if (wasDragging) {
      if (dropSq) {
        if (origin && (dropSq.r !== origin.r || dropSq.c !== origin.c)) {
          editorState.board[dropSq.r][dropSq.c] = pieceCode;
          editorState.board[origin.r][origin.c] = null;
        }
      } else {
        if (origin) {
          editorState.board[origin.r][origin.c] = null;
        }
      }
      editorSelectedSq = null;
      syncEditorCastlingValidity();
    }
    renderBoard();
    return;
  }

  const wasDragging = drag.moved;
  const isPremove = drag.isPremoveDrag;
  const origin = drag.originSq;
  const pocketType = drag.pocketType;
  const wasSelected = drag.wasAlreadySelected;

  drag.active = false;
  drag.moved = false;
  drag.isPremoveDrag = false;
  drag.pointerId = null;
  drag.originSq = null;
  drag.pocketType = null;
  drag.pocketColor = null;
  endDragVisuals();

  const dropSq = clientPointToSquare(e.clientX, e.clientY);

  // Pocket Piece Drag / Click Release
  if (pocketType) {
    if (wasDragging) {
      if (dropSq) {
        if (isPremove) {
          const validPreDrop = premoveTargets.some((t) => t.r === dropSq.r && t.c === dropSq.c);
          if (validPreDrop) {
            enqueuePremoveDrop(pocketType, dropSq);
          } else {
            renderAll();
          }
        } else {
          const validDrop = selectedLegalMoves.some(
            (m) => m.to.r === dropSq.r && m.to.c === dropSq.c
          );
          if (validDrop) {
            submitPlayerDrop(pocketType, dropSq, true, false);
          } else {
            renderAll();
          }
        }
      } else {
        renderAll();
      }
    } else if (wasSelected) {
      clearSelection();
      renderAll();
    }
    return;
  }

  if (wasDragging) {
    if (dropSq && origin && (dropSq.r !== origin.r || dropSq.c !== origin.c)) {
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
    } else if (dropSq && origin && dropSq.r === origin.r && dropSq.c === origin.c && wasSelected) {
      clearSelection();
      renderBoard();
    } else {
      renderBoard();
    }
  } else {
    if (wasSelected && dropSq && origin && dropSq.r === origin.r && dropSq.c === origin.c) {
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

function renderEditorBoard() {
  const fragment = document.createDocumentFragment();
  const board = editorState.board;

  for (let visRow = 0; visRow < BOARD_SIZE; visRow++) {
    for (let visCol = 0; visCol < BOARD_SIZE; visCol++) {
      const r = boardFlipped ? 7 - visRow : visRow;
      const c = boardFlipped ? 7 - visCol : visCol;
      const sqEl = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sqEl.className = `square ${isLight ? 'light' : 'dark'} editor-square`;
      sqEl.dataset.r = String(r);
      sqEl.dataset.c = String(c);

      if (editorSelectedSq && editorSelectedSq.r === r && editorSelectedSq.c === c) {
        sqEl.classList.add('editor-selected');
      }

      if (
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

      const code = board[r][c];
      if (code) {
        const img = document.createElement('img');
        img.className = 'piece';
        img.src = getPieceSvgDataUri(code);
        img.alt = code;
        img.draggable = false;
        sqEl.appendChild(img);
      }

      fragment.appendChild(sqEl);
    }
  }

  dom.board.replaceChildren(fragment);
  if (dom.boardArrows) dom.boardArrows.replaceChildren();
}

function renderBoard() {
  if (net.mode === 'editor') {
    renderEditorBoard();
    return;
  }
  const frame = getDisplayedFrame();
  const viewingLive = isViewingLive();
  const fragment = document.createDocumentFragment();

  const fogActive = isFogActiveNow();
  const visibleSet = fogActive
    ? getVisibleSquaresForFrame(frame, getFogViewerColor(), viewingLive ? gameState : null)
    : null;

  const showProjectedPremoves =
    viewingLive &&
    net.mode === 'online' &&
    gameState.status === 'playing' &&
    !opponentDisconnected &&
    premoveQueue.length > 0;
  const displayBoard = showProjectedPremoves ? getProjectedPremoveState().board : frame.board;

  const legalMap = new Map();
  if (viewingLive) {
    const visibleLegalMoves =
      selectedSq && getVariantDef(gameState).secretQueen
        ? getDisplayedLegalMovesForSquare(gameState, selectedSq.r, selectedSq.c)
        : selectedLegalMoves;
    for (const m of visibleLegalMoves) {
      legalMap.set(`${m.to.r},${m.to.c}`, Boolean(m.captureSq));
    }
  }

  const premoveTargetSet = new Set();
  if (viewingLive && (premoveOriginSq || premovePocketType)) {
    for (const t of premoveTargets) {
      premoveTargetSet.add(`${t.r},${t.c}`);
    }
  }

  const premoveSquareSet = new Set();
  if (viewingLive) {
    for (const step of premoveQueue) {
      if (step.from) premoveSquareSet.add(`${step.from.r},${step.from.c}`);
      if (step.to) premoveSquareSet.add(`${step.to.r},${step.to.c}`);
    }
    if (pendingPromotion && pendingPromotion.isPremove) {
      if (pendingPromotion.from) {
        premoveSquareSet.add(`${pendingPromotion.from.r},${pendingPromotion.from.c}`);
      }
      if (pendingPromotion.to) {
        premoveSquareSet.add(`${pendingPromotion.to.r},${pendingPromotion.to.c}`);
      }
    }
  }

  const rcMarkSet = new Set(markedSquares.map((s) => `${s.r},${s.c}`));

  const checkedSquares = new Set();
  if (frame.inCheck && !getVariantDef(gameState).royalCaptureWins) {
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

  const isDiceLive = Boolean(
    viewingLive &&
      getVariantDef(gameState).diceChess &&
      gameState.status === 'playing' &&
      gameState.dice &&
      gameState.dice.rolled !== false &&
      Array.isArray(gameState.dice.values) &&
      !gameState.dice.noLegalMoves &&
      !opponentDisconnected &&
      net.mode !== 'waiting' &&
      net.mode !== 'setup' &&
      net.mode !== 'joining'
  );
  const diceEligibleSet = new Set();
  if (isDiceLive && (net.mode !== 'online' || gameState.turn === net.myColor)) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (gameState.board[r][c] && getLegalMovesForSquare(gameState, r, c).length > 0) {
          diceEligibleSet.add(`${r},${c}`);
        }
      }
    }
  }

  for (let visRow = 0; visRow < BOARD_SIZE; visRow++) {
    for (let visCol = 0; visCol < BOARD_SIZE; visCol++) {
      const r = boardFlipped ? 7 - visRow : visRow;
      const c = boardFlipped ? 7 - visCol : visCol;
      const key = `${r},${c}`;
      const isFogSq = Boolean(fogActive && visibleSet && !visibleSet.has(key));

      const sqEl = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
      if (isFogSq) {
        sqEl.classList.add('fog');
      }
      sqEl.dataset.r = String(r);
      sqEl.dataset.c = String(c);

      const isSelected =
        viewingLive &&
        ((selectedSq && selectedSq.r === r && selectedSq.c === c) ||
          (premoveOriginSq && premoveOriginSq.r === r && premoveOriginSq.c === c));
      const isLastFrom = Boolean(
        !isFogSq &&
          frame.lastMove?.from &&
          frame.lastMove.from.r === r &&
          frame.lastMove.from.c === c
      );
      const isLastTo = Boolean(
        !isFogSq &&
          frame.lastMove?.to &&
          frame.lastMove.to.r === r &&
          frame.lastMove.to.c === c
      );

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

      if (diceEligibleSet.has(key)) {
        sqEl.classList.add('dice-eligible');
        if (gameState.dice?.isDoubles) {
          sqEl.classList.add('dice-eligible-wild');
        }
      }

      if (viewingLive && gameState.status === 'secret_pick') {
        let pickColor = null;
        if (net.mode === 'online') {
          pickColor = net.myColor;
        } else {
          pickColor = !gameState.secretQueens?.w?.picked ? 'w' : 'b';
        }
        const pickRow = pickColor === 'w' ? 6 : 1;
        if (r === pickRow && displayBoard[r][c] === pickColor + 'p') {
          sqEl.classList.add('secret-pickable');
          if (secretPickCol === c) {
            sqEl.classList.add('secret-pick-selected');
          }
        }
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

      const rawCode = displayBoard[r][c];
      const code =
        !isFogSq || (showProjectedPremoves && rawCode && getPieceColor(rawCode) === net.myColor)
          ? rawCode
          : null;

      if (code) {
        const pieceColor = getPieceColor(code);
        const pieceType = getPieceType(code);
        const canMoveThisSq = isDiceLive
          ? diceEligibleSet.has(key)
          : canPlayerMovePiece(pieceColor);
        if (canMoveThisSq || canPlayerPremovePiece(pieceColor)) {
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
          pendingPromotion.from &&
          pendingPromotion.from.r === r &&
          pendingPromotion.from.c === c;
        if (hideForDrag || hideForPromo) {
          img.classList.add('dragging-source');
        }
        sqEl.appendChild(img);

        if (getVariantDef(gameState).secretQueen && frame.secretQueens) {
          const sqObj = frame.secretQueens[pieceColor];
          if (sqObj && sqObj.sq && sqObj.sq.r === r && sqObj.sq.c === c && !sqObj.revealed) {
            const isOwner = net.mode === 'online' && pieceColor === net.myColor;
            if (isOwner) {
              const badge = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              badge.setAttribute('class', 'secret-badge');
              badge.setAttribute('aria-hidden', 'true');
              const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
              use.setAttribute('href', '#icon-variant-secret');
              badge.appendChild(use);
              sqEl.appendChild(badge);
            }
          }
        }
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

function computeMaterialTotals(board, pockets = null, includePockets = false) {
  const totals = { w: 0, b: 0 };
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const code = board[r][c];
      if (!code) continue;
      const val = PIECE_DEFS[getPieceType(code)]?.value || 0;
      totals[getPieceColor(code)] += val;
    }
  }
  if (includePockets && pockets) {
    for (const side of ['w', 'b']) {
      for (const type of pockets[side] || []) {
        totals[side] += PIECE_DEFS[type]?.value || 0;
      }
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

function renderPocketBar(pocketEl, sideColor, pocketPieces) {
  if (!pocketEl) return;
  pocketEl.replaceChildren();

  const counts = {};
  for (const t of pocketPieces || []) {
    counts[t] = (counts[t] || 0) + 1;
  }

  const viewingLive = isViewingLive();
  const canMoveSide = canPlayerMovePiece(sideColor);
  const canPreSide = canPlayerPremovePiece(sideColor);

  for (const type of getDropPieceTypes()) {
    const count = counts[type] || 0;
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'pocket-slot';
    slot.dataset.piece = type;
    slot.dataset.color = sideColor;
    slot.title =
      count > 0
        ? `${PIECE_DEFS[type]?.name || type} (${count} in pocket)`
        : `${PIECE_DEFS[type]?.name || type}`;

    if (count === 0) {
      slot.classList.add('empty');
    } else if (canMoveSide || canPreSide) {
      slot.classList.add('usable');
    }

    if (viewingLive && count > 0) {
      if (selectedPocketType === type && canMoveSide) {
        slot.classList.add('selected');
      } else if (premovePocketType === type && canPreSide) {
        slot.classList.add('premove-selected');
      }
    }

    const img = document.createElement('img');
    img.src = getPieceSvgDataUri(sideColor + type);
    img.alt = `${sideColor === 'w' ? 'White' : 'Black'} ${PIECE_DEFS[type]?.name || type}`;
    img.draggable = false;
    slot.appendChild(img);

    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'pocket-count';
      badge.textContent = String(count);
      slot.appendChild(badge);
    }

    slot.addEventListener('pointerdown', (e) => handlePocketPointerDown(e, sideColor, type));
    pocketEl.appendChild(slot);
  }
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
  const vDef = getVariantDef(gameState);
  const fogActive = isFogActiveNow();
  const showPockets = Boolean(vDef.allowDrops);

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

  if (dom.topPocket) dom.topPocket.classList.toggle('hidden', !showPockets);
  if (dom.bottomPocket) dom.bottomPocket.classList.toggle('hidden', !showPockets);

  if (showPockets) {
    const basePockets = frame.pockets || gameState.pockets || { w: [], b: [] };
    const projPockets =
      isViewingLive() && canUsePremoveMode() && premoveQueue.length > 0
        ? getProjectedPremoveState().pockets
        : null;
    const topPocketList =
      projPockets && topColor === net.myColor ? projPockets[topColor] : basePockets[topColor];
    const bottomPocketList =
      projPockets && bottomColor === net.myColor
        ? projPockets[bottomColor]
        : basePockets[bottomColor];
    renderPocketBar(dom.topPocket, topColor, topPocketList);
    renderPocketBar(dom.bottomPocket, bottomColor, bottomPocketList);
  }

  if (fogActive) {
    dom.topCaptured.replaceChildren();
    dom.bottomCaptured.replaceChildren();
    dom.topMaterial.textContent = '';
    dom.bottomMaterial.textContent = '';
  } else if (showPockets) {
    const basePockets = frame.pockets || gameState.pockets || { w: [], b: [] };
    const totals = computeMaterialTotals(frame.board, basePockets, true);
    dom.topCaptured.replaceChildren();
    dom.bottomCaptured.replaceChildren();
    const topAdv = totals[topColor] - totals[bottomColor];
    const bottomAdv = totals[bottomColor] - totals[topColor];
    dom.topMaterial.textContent = topAdv > 0 ? `+${topAdv}` : '';
    dom.bottomMaterial.textContent = bottomAdv > 0 ? `+${bottomAdv}` : '';
  } else {
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
  }

  renderClockBoxesOnly();
}

function formatTimeSummary(timed, minutes, incrementSec) {
  if (!timed) return 'No Clock';
  return `${minutes}+${incrementSec}`;
}

function renderStatusAndControls() {
  const vDef = getVariantDef(gameState);
  const fogActive = isFogActiveNow();

  dom.gameIdle.classList.toggle('hidden', net.mode !== 'local' && net.mode !== 'joining');
  dom.gameSetup.classList.toggle('hidden', net.mode !== 'setup');
  dom.gameWaiting.classList.toggle('hidden', net.mode !== 'waiting');
  dom.gameConnected.classList.toggle('hidden', net.mode !== 'online');
  if (dom.gameEditor) dom.gameEditor.classList.toggle('hidden', net.mode !== 'editor');
  if (dom.cancelJoinBtn) dom.cancelJoinBtn.classList.toggle('hidden', net.mode !== 'joining');

  if (dom.localVariantBar) {
    dom.localVariantBar.classList.toggle('hidden', net.mode !== 'local');
    for (const btn of dom.localVariantBar.querySelectorAll('.local-variant-btn')) {
      btn.classList.toggle('active', btn.dataset.variant === (gameState.variant || 'standard'));
    }
  }

  dom.localControls.classList.toggle('hidden', net.mode !== 'local');
  dom.onlineControls.classList.toggle('hidden', net.mode !== 'online');

  dom.openSetupBtn.disabled = net.mode === 'joining';
  dom.joinBtn.disabled = net.mode === 'joining';
  dom.joinInput.disabled = net.mode === 'joining';
  if (dom.pasteCodeBtn) dom.pasteCodeBtn.disabled = net.mode === 'joining';

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (dom.shareLinkBtn) dom.shareLinkBtn.classList.toggle('hidden', !canNativeShare);

  const tcSummary = formatTimeSummary(
    clockState.timed,
    clockState.minutes,
    clockState.incrementSec
  );

  const activeVariantKey =
    net.mode === 'setup' || net.mode === 'waiting'
      ? setupConfig.variant || 'standard'
      : gameState.variant || 'standard';
  const pillVDef = getVariantDef(activeVariantKey);

  if (net.mode === 'online') {
    dom.modeBadge.textContent = opponentDisconnected ? 'Offline' : 'Online';
    dom.modeBadge.classList.toggle('online', !opponentDisconnected);
    dom.activeGameCode.textContent = net.roomCode || '-----';
    if (dom.activeVariantTag) {
      dom.activeVariantTag.dataset.variant = gameState.variant || 'standard';
      dom.activeVariantTag.textContent = vDef.name;
    }
    dom.activeTimeTag.textContent = tcSummary;
  } else if (net.mode === 'waiting') {
    dom.modeBadge.textContent = 'Waiting';
    dom.modeBadge.classList.remove('online');
    dom.codeDisplay.textContent = net.roomCode || '-----';
    const desc = clockState.timed
      ? `${clockState.minutes} min + ${clockState.incrementSec}s`
      : 'Unlimited time';
    const setupVDef = getVariantDef(setupConfig.variant);
    dom.waitingSummary.textContent = `${setupVDef.name} • ${desc} • Waiting for opponent`;
  } else if (net.mode === 'joining') {
    dom.modeBadge.textContent = 'Joining';
    dom.modeBadge.classList.remove('online');
  } else if (net.mode === 'editor') {
    dom.modeBadge.textContent = 'Editor';
    dom.modeBadge.classList.remove('online');
    if (dom.mobileModeBadge) dom.mobileModeBadge.textContent = 'Editor';
    syncEditorPanelUI();
  } else {
    dom.modeBadge.textContent = 'Local';
    dom.modeBadge.classList.remove('online');
  }

  if (dom.mobileModeBadge) {
    dom.mobileModeBadge.textContent = dom.modeBadge.textContent;
    dom.mobileModeBadge.classList.toggle('online', dom.modeBadge.classList.contains('online'));
  }

  if (dom.mobileVariantPill) {
    dom.mobileVariantPill.dataset.variant = activeVariantKey;
  }
  if (dom.mobileVariantUse && typeof dom.mobileVariantUse.setAttribute === 'function') {
    dom.mobileVariantUse.setAttribute('href', `#icon-variant-${activeVariantKey}`);
  }
  if (dom.mobileVariantLabel) {
    dom.mobileVariantLabel.textContent = pillVDef.shortName || pillVDef.name;
  }

  const variantLocked =
    net.mode === 'online' || net.mode === 'waiting' || net.mode === 'joining';
  if (dom.mobileVariantGrid) {
    for (const btn of dom.mobileVariantGrid.querySelectorAll('.variant-btn')) {
      btn.classList.toggle('active', btn.dataset.variant === activeVariantKey);
      btn.disabled = variantLocked;
    }
  }
  if (dom.mobileVariantsHint) {
    dom.mobileVariantsHint.textContent = variantLocked
      ? 'Locked during online game'
      : net.mode === 'setup'
        ? 'Tap variant to select • (i) for rules'
        : 'Tap to switch local board • (i) for rules';
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
    const moverAtPly = (viewPly - 1) % 2 === 0 ? 'w' : 'b';
    const sanLabel =
      fogActive && getFogViewerColor() !== moverAtPly ? '?' : gameState.moveHistory[viewPly - 1];
    statusText =
      viewPly === 0
        ? `Viewing start position (0/${gameState.moveHistory.length}) — click >| for live`
        : `Viewing move ${viewPly}/${gameState.moveHistory.length} (${sanLabel}) — click >| for live`;
  } else if (net.mode === 'editor') {
    statusText = 'Custom Board Editor — Tap pieces or drag to set up';
  } else if (net.mode === 'waiting') {
    statusText = 'Share your game code or invite link with a friend.';
  } else if (net.mode === 'joining') {
    statusText = `Connecting to game ${net.roomCode || ''}...`;
  } else if (opponentDisconnected) {
    if (opponentGraceTimer && opponentGraceSecondsLeft > 0) {
      statusText = `Opponent connection lost — waiting ${opponentGraceSecondsLeft}s for reconnect...`;
    } else {
      statusText = 'Opponent disconnected from the game.';
    }
    dom.statusBanner.classList.add('game-over');
  } else if (gameState.status === 'secret_pick') {
    statusText = 'Secret Queen Setup: choose your hidden Queen pawn!';
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
    if (gameState.inCheck && !vDef.royalCaptureWins) {
      statusText += ' — Check!';
      dom.statusBanner.classList.add('in-check');
    }
  } else {
    dom.statusBanner.classList.add('game-over');
    const winLabel = gameState.winner === 'w' ? 'White' : 'Black';
    if (gameState.status === 'checkmate') {
      statusText = `Checkmate — ${winLabel} wins!`;
    } else if (gameState.status === 'king_captured') {
      statusText = `King captured — ${winLabel} wins!`;
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

  const hasActivePremoves =
    net.mode === 'online' &&
    gameState.status === 'playing' &&
    !opponentDisconnected &&
    premoveQueue.length > 0;
  if (dom.premoveCancelBar) {
    dom.premoveCancelBar.classList.toggle('hidden', !hasActivePremoves);
  }
  if (dom.premoveCountLabel && hasActivePremoves) {
    dom.premoveCountLabel.textContent =
      premoveQueue.length === 1 ? '1 premove queued' : `${premoveQueue.length} premoves queued`;
  }
  if (dom.mobileCancelPremoveBtn) {
    dom.mobileCancelPremoveBtn.classList.toggle('hidden', !hasActivePremoves);
    if (hasActivePremoves) {
      dom.mobileCancelPremoveBtn.textContent =
        premoveQueue.length > 1 ? `Clear (${premoveQueue.length})` : 'Clear Premove';
    }
  }

  if (dom.mobileStatusStrip) {
    dom.mobileStatusStrip.classList.toggle(
      'game-over',
      dom.statusBanner.classList.contains('game-over')
    );
    dom.mobileStatusStrip.classList.toggle(
      'in-check',
      dom.statusBanner.classList.contains('in-check')
    );
    dom.mobileStatusStrip.classList.toggle(
      'viewing-past',
      dom.statusBanner.classList.contains('viewing-past')
    );
  }
  if (dom.mobileStatusText) {
    dom.mobileStatusText.textContent = statusText;
  }
  if (dom.mobileDrawBanner) {
    dom.mobileDrawBanner.classList.toggle('hidden', !incomingDraw);
  }

  if (dom.secretPickBar) {
    const inPick = gameState.status === 'secret_pick';
    dom.secretPickBar.classList.toggle('hidden', !inPick);
    if (inPick) {
      if (net.mode === 'online') {
        const mySQ = gameState.secretQueens?.[net.myColor];
        if (mySQ && mySQ.picked) {
          dom.secretPickText.textContent = 'Secret Queen confirmed! Waiting for opponent...';
          dom.secretConfirmBtn.disabled = true;
          dom.secretRandomBtn.disabled = true;
        } else {
          dom.secretPickText.textContent = 'Choose your Secret Queen: tap any pawn';
          dom.secretConfirmBtn.disabled = secretPickCol === null;
          dom.secretRandomBtn.disabled = false;
        }
      } else {
        const whitePicked = Boolean(gameState.secretQueens?.w?.picked);
        if (!whitePicked) {
          dom.secretPickText.textContent = 'White: tap a pawn to choose your Secret Queen';
        } else {
          dom.secretPickText.textContent = 'Black: tap a pawn to choose your Secret Queen';
        }
        dom.secretConfirmBtn.disabled = secretPickCol === null;
        dom.secretRandomBtn.disabled = false;
      }
    }
  }

  // Replay Navigation Buttons (supported in live Fog of War too with each turn's fog preserved!)
  const totalPlies = gameState.moveHistory.length;
  const minReplayPly = getReplayMinPly();
  dom.navFirstBtn.disabled = viewPly <= minReplayPly;
  dom.navPrevBtn.disabled = viewPly <= minReplayPly;
  dom.navNextBtn.disabled = viewPly >= totalPlies;
  dom.navLastBtn.disabled = viewPly >= totalPlies;
  dom.navLastBtn.classList.toggle('live-behind', viewPly < totalPlies);

  if (dom.mobPrevBtn) dom.mobPrevBtn.disabled = viewPly <= minReplayPly;
  if (dom.mobNextBtn) dom.mobNextBtn.disabled = viewPly >= totalPlies;
  if (dom.mobLocalActions) dom.mobLocalActions.classList.toggle('hidden', net.mode !== 'local');
  if (dom.mobOnlineActions) dom.mobOnlineActions.classList.toggle('hidden', net.mode !== 'online');
  if (dom.mobPlayFriendBtn) {
    dom.mobPlayFriendBtn.disabled = net.mode === 'joining';
    dom.mobPlayFriendBtn.textContent =
      net.mode === 'waiting' ? `Code: ${net.roomCode || '-----'}` : 'Play Friend';
  }

  // Online Action Buttons (Offer Draw, Resign, Rematch)
  if (net.mode === 'online') {
    const isPlaying = gameState.status === 'playing' && !opponentDisconnected;
    dom.resignBtn.disabled = !isPlaying;
    if (dom.mobResignBtn) dom.mobResignBtn.disabled = !isPlaying;
    if (!isPlaying) resetResignConfirm();

    if (!isPlaying) {
      dom.drawBtn.disabled = true;
      dom.drawBtn.textContent = 'Offer Draw';
      if (dom.mobDrawBtn) {
        dom.mobDrawBtn.disabled = true;
        dom.mobDrawBtn.textContent = 'Draw';
      }
    } else if (net.drawOfferedBy === net.myColor) {
      dom.drawBtn.disabled = true;
      dom.drawBtn.textContent = 'Draw Sent';
      if (dom.mobDrawBtn) {
        dom.mobDrawBtn.disabled = true;
        dom.mobDrawBtn.textContent = 'Sent';
      }
    } else {
      dom.drawBtn.disabled = false;
      dom.drawBtn.textContent = 'Offer Draw';
      if (dom.mobDrawBtn) {
        dom.mobDrawBtn.disabled = false;
        dom.mobDrawBtn.textContent = 'Draw';
      }
    }

    if (opponentDisconnected || isPlaying) {
      dom.rematchBtn.disabled = true;
      dom.rematchBtn.textContent = 'Rematch';
      if (dom.mobRematchBtn) {
        dom.mobRematchBtn.disabled = true;
        dom.mobRematchBtn.textContent = 'Rematch';
      }
    } else if (net.myRematchWanted) {
      dom.rematchBtn.disabled = true;
      dom.rematchBtn.textContent = 'Sent...';
      if (dom.mobRematchBtn) {
        dom.mobRematchBtn.disabled = true;
        dom.mobRematchBtn.textContent = 'Sent...';
      }
    } else if (net.peerRematchWanted) {
      dom.rematchBtn.disabled = false;
      dom.rematchBtn.textContent = 'Accept Rematch';
      if (dom.mobRematchBtn) {
        dom.mobRematchBtn.disabled = false;
        dom.mobRematchBtn.textContent = 'Accept';
      }
    } else {
      dom.rematchBtn.disabled = false;
      dom.rematchBtn.textContent = 'Rematch';
      if (dom.mobRematchBtn) {
        dom.mobRematchBtn.disabled = false;
        dom.mobRematchBtn.textContent = 'Rematch';
      }
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

  const fogActive = isFogActiveNow();
  const viewerColor = getFogViewerColor();
  const minReplayPly = getReplayMinPly();

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
    wMove.textContent = fogActive && viewerColor !== 'w' ? '?' : moves[i];
    if (wPly >= minReplayPly) {
      wMove.addEventListener('click', () => stepHistoryTo(wPly));
    }

    const bPly = i + 2;
    const bMove = document.createElement('span');
    if (moves[i + 1]) {
      bMove.className = 'move-san' + (viewPly === bPly ? ' active-ply' : '');
      bMove.textContent = fogActive && viewerColor !== 'b' ? '?' : moves[i + 1];
      if (bPly >= minReplayPly) {
        bMove.addEventListener('click', () => stepHistoryTo(bPly));
      }
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

const DIE_PIP_COORDS = {
  1: [[20, 18.25]],
  2: [
    [11.5, 10.25],
    [28.5, 26.25]
  ],
  3: [
    [11.5, 10.25],
    [20, 18.25],
    [28.5, 26.25]
  ],
  4: [
    [11.5, 10.25],
    [28.5, 10.25],
    [11.5, 26.25],
    [28.5, 26.25]
  ],
  5: [
    [11.5, 10.25],
    [28.5, 10.25],
    [20, 18.25],
    [11.5, 26.25],
    [28.5, 26.25]
  ],
  6: [
    [11.5, 9.5],
    [28.5, 9.5],
    [11.5, 18.25],
    [28.5, 18.25],
    [11.5, 27],
    [28.5, 27]
  ]
};

function renderDieFaceSvg(svgEl, val, isDoubles, isDisabled, isUnrolled = false) {
  if (!svgEl) return;
  if (typeof svgEl.setAttribute === 'function') {
    svgEl.setAttribute('viewBox', '0 0 40 40');
  }
  const cleanVal = isUnrolled ? null : Math.max(1, Math.min(6, Number(val) || 1));
  const baseFill = isUnrolled
    ? '#8a8579'
    : isDisabled
      ? '#3a3833'
      : isDoubles
        ? '#b98324'
        : '#beb6a4';
  const faceFill = isUnrolled
    ? '#dcd6c6'
    : isDisabled
      ? '#57544d'
      : isDoubles
        ? '#fff4d4'
        : '#f4efe3';
  const faceStroke = isUnrolled
    ? '#c3bca9'
    : isDisabled
      ? '#44413b'
      : isDoubles
        ? '#e2a93f'
        : '#dfd8c7';

  const children = [];
  children.push(
    createSvgEl('rect', {
      x: 1.5,
      y: 3.5,
      width: 37,
      height: 35,
      rx: 8.5,
      ry: 8.5,
      fill: baseFill
    })
  );
  children.push(
    createSvgEl('rect', {
      x: 1.5,
      y: 1.5,
      width: 37,
      height: 33.5,
      rx: 8.5,
      ry: 8.5,
      fill: faceFill,
      stroke: faceStroke,
      'stroke-width': 1.25
    })
  );

  if (isUnrolled || cleanVal === null) {
    children.push(
      createSvgEl('path', {
        d: 'M16.1 14.3 C16.1 11.7 17.9 10.2 20.1 10.2 C22.5 10.2 24.1 11.6 24.1 13.7 C24.1 15.4 23.0 16.4 21.4 17.3 C20.2 18.0 19.8 18.7 19.8 20.2 L19.8 21.1',
        fill: 'none',
        stroke: '#4f4a3f',
        'stroke-width': 2.5,
        'stroke-linecap': 'round'
      })
    );
    children.push(
      createSvgEl('circle', {
        cx: 19.8,
        cy: 24.8,
        r: 1.65,
        fill: '#4f4a3f'
      })
    );
    svgEl.replaceChildren(...children);
    return;
  }

  const pipFill = isDisabled
    ? '#252320'
    : cleanVal === 1
      ? '#b5332a'
      : isDoubles
        ? '#362105'
        : '#1d1b18';

  const pips = DIE_PIP_COORDS[cleanVal] || DIE_PIP_COORDS[1];
  const r = cleanVal === 1 ? 4.4 : cleanVal === 6 ? 3.15 : 3.4;
  for (const [cx, cy] of pips) {
    children.push(
      createSvgEl('circle', {
        cx,
        cy,
        r,
        fill: pipFill
      })
    );
  }

  svgEl.replaceChildren(...children);
}

function canCurrentUserRollDice() {
  if (!isViewingLive()) return false;
  if (gameState.status !== 'playing' || opponentDisconnected) return false;
  if (!getVariantDef(gameState).diceChess) return false;
  if (
    net.mode === 'waiting' ||
    net.mode === 'setup' ||
    net.mode === 'joining' ||
    net.mode === 'editor'
  ) {
    return false;
  }
  if (!gameState.dice || gameState.dice.rolled !== false) return false;
  if (net.mode === 'online' && gameState.turn !== net.myColor) return false;
  return true;
}

function playDiceOutcomeSounds(diceState) {
  if (!diceState || diceState.rolled === false || !Array.isArray(diceState.values)) return;
  playSound('diceRoll');
  const followKind = diceState.isDoubles
    ? 'diceDoubles'
    : diceState.noLegalMoves
      ? 'diceBlocked'
      : null;
  if (!followKind) return;
  clearDiceAudioSettleTimer();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    diceAudioSettleTimer = setTimeout(() => {
      diceAudioSettleTimer = null;
      playSound(followKind);
    }, 240);
  } else {
    playSound(followKind);
  }
}

function setDiceAutoRoll(enabled) {
  diceAutoRollEnabled = Boolean(enabled);
  if (dom.diceAutoRollToggle) {
    dom.diceAutoRollToggle.checked = diceAutoRollEnabled;
  }
  try {
    localStorage.setItem('chess_dice_autoroll', diceAutoRollEnabled ? '1' : '0');
  } catch (_) {}
  if (diceAutoRollEnabled) {
    scheduleDiceAutoRollIfNeeded();
  } else {
    clearDiceAutoRollTimer();
  }
}

function executeDiceRollRequest() {
  clearDiceAutoRollTimer();
  clearDiceScrambleTimer();
  if (!canCurrentUserRollDice()) return false;

  if (net.mode === 'online' && net.role === 'guest') {
    if (isLogicalConnOpen(net.conn)) {
      sendPacket(net.conn, { type: 'dice_roll_request' });
      return true;
    }
    return false;
  }

  rollDiceForState(gameState);
  clearSelection();
  playDiceOutcomeSounds(gameState.dice);
  if (net.mode === 'online' && net.role === 'host') {
    broadcastHostState();
  }
  renderAll();
  return true;
}

function scheduleDiceAutoRollIfNeeded() {
  if (!diceAutoRollEnabled || !canCurrentUserRollDice()) {
    clearDiceAutoRollTimer();
    return;
  }
  if (typeof window === 'undefined' || diceAutoRollTimer) return;
  diceAutoRollTimer = setTimeout(() => {
    diceAutoRollTimer = null;
    executeDiceRollRequest();
  }, 240);
}

function startDiceScrambleAnimation(targetV1, targetV2, isDoubles, dis1, dis2) {
  clearDiceScrambleTimer();
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    renderDieFaceSvg(dom.dieSvg1, targetV1, isDoubles, dis1, false);
    renderDieFaceSvg(dom.dieSvg2, targetV2, isDoubles, dis2, false);
    return;
  }
  const steps = 4;
  let step = 0;
  const pickTransient = (target, offset) => {
    const candidate = ((target + step + offset) % 6) + 1;
    return candidate === target ? (candidate % 6) + 1 : candidate;
  };
  const tick = () => {
    if (!dom.dieSvg1 || !dom.dieSvg2) {
      clearDiceScrambleTimer();
      return;
    }
    if (step < steps) {
      renderDieFaceSvg(dom.dieSvg1, pickTransient(targetV1, step), false, false, false);
      renderDieFaceSvg(dom.dieSvg2, pickTransient(targetV2, step + 2), false, false, false);
      step += 1;
      diceScrambleTimer = setTimeout(tick, 62);
    } else {
      diceScrambleTimer = null;
      renderDieFaceSvg(dom.dieSvg1, targetV1, isDoubles, dis1, false);
      renderDieFaceSvg(dom.dieSvg2, targetV2, isDoubles, dis2, false);
    }
  };
  tick();
}

function executeDicePassTurn() {
  clearDiceAutoPassTimer();
  if (
    gameState.status !== 'playing' ||
    !getVariantDef(gameState).diceChess ||
    !gameState.dice?.noLegalMoves
  ) {
    return;
  }

  if (net.mode === 'online') {
    if (net.role === 'guest') {
      sendPacket(net.conn, { type: 'dice_pass' });
      return;
    }
    if (net.role === 'host') {
      const activeColor = gameState.turn;
      if (!commitHostClockTurn(activeColor)) {
        reconcileInteractionAfterTurnChange();
        playSound('gameEnd');
        broadcastHostState();
        renderAll();
        return;
      }
      const wasAtLive = isViewingLive();
      gameState = applyDicePassTurn(gameState);
      if (gameState.status !== 'playing') {
        clockState.running = false;
      }
      if (wasAtLive) {
        viewPly = gameState.moveHistory.length;
      }
      clearSelection();
      playSound('turnPass');
      broadcastHostState();
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }
  }

  const wasAtLive = isViewingLive();
  gameState = applyDicePassTurn(gameState);
  if (wasAtLive) {
    viewPly = gameState.moveHistory.length;
  }
  clearSelection();
  playSound('turnPass');
  renderAll();
}

function scheduleDiceAutoPassIfNeeded() {
  clearDiceAutoPassTimerOnly();
  if (typeof window === 'undefined') return;
  if (
    !isViewingLive() ||
    gameState.status !== 'playing' ||
    !getVariantDef(gameState).diceChess ||
    gameState.dice?.rolled === false ||
    !gameState.dice?.noLegalMoves ||
    opponentDisconnected
  ) {
    return;
  }
  if (net.mode === 'waiting' || net.mode === 'setup' || net.mode === 'joining' || net.mode === 'editor') {
    return;
  }
  if (net.mode === 'online' && net.role !== 'host') {
    return;
  }
  diceAutoPassTimer = setTimeout(() => {
    diceAutoPassTimer = null;
    executeDicePassTurn();
  }, 1250);
}

function clearDiceAutoPassTimerOnly() {
  if (diceAutoPassTimer) {
    clearTimeout(diceAutoPassTimer);
    diceAutoPassTimer = null;
  }
}

function handleDieCardClick(dieIndex) {
  if (canCurrentUserRollDice()) {
    executeDiceRollRequest();
    return;
  }
  if (!isViewingLive() || gameState.status !== 'playing') return;
  if (!getVariantDef(gameState).diceChess || gameState.dice?.rolled === false || !gameState.dice?.values) {
    return;
  }
  if (net.mode === 'online' && gameState.turn !== net.myColor) return;

  const val = gameState.dice.values[dieIndex === 2 ? 1 : 0];
  const targetType = DICE_PIECE_MAP[val];
  const isWild = Boolean(gameState.dice.isDoubles);

  const candidates = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const code = gameState.board[r][c];
      if (!code) continue;
      const pCol = getPieceColor(code);
      const pType = getPieceType(code);
      const matchesDie = isWild
        ? pType === targetType && pCol === gameState.turn
        : pCol === gameState.turn && pType === targetType;
      if (matchesDie && getLegalMovesForSquare(gameState, r, c).length > 0) {
        candidates.push({ r, c });
      }
    }
  }

  if (isWild && candidates.length === 0) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (gameState.board[r][c] && getLegalMovesForSquare(gameState, r, c).length > 0) {
          candidates.push({ r, c });
        }
      }
    }
  }

  if (candidates.length === 0) return;

  let nextIdx = 0;
  if (selectedSq) {
    const curIdx = candidates.findIndex((s) => s.r === selectedSq.r && s.c === selectedSq.c);
    if (curIdx >= 0) {
      nextIdx = (curIdx + 1) % candidates.length;
    }
  }
  const chosen = candidates[nextIdx];
  selectSquare(chosen.r, chosen.c);
  renderAll();
}

function renderDiceBar() {
  if (!dom.diceBar) return;
  const vDef = getVariantDef(gameState);
  const showDice = Boolean(
    vDef.diceChess &&
      net.mode !== 'editor' &&
      net.mode !== 'setup' &&
      net.mode !== 'waiting' &&
      net.mode !== 'joining'
  );
  dom.diceBar.classList.toggle('hidden', !showDice);
  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    document.body.classList.toggle('dice-mode', showDice);
  }
  if (!showDice) {
    clearDiceAutoPassTimer();
    return;
  }

  if (dom.diceAutoRollToggle) {
    dom.diceAutoRollToggle.checked = diceAutoRollEnabled;
  }

  const viewingLive = isViewingLive();
  const frame = getDisplayedFrame();
  const diceState = viewingLive ? gameState.dice : frame.dice || createPendingDiceState();
  const turnColor = viewingLive ? gameState.turn : frame.turn || gameState.turn;
  const turnPly = viewingLive ? gameState.moveHistory.length : viewPly;
  const isUnrolled = Boolean(
    !diceState || diceState.rolled === false || !Array.isArray(diceState.values) || diceState.values.length !== 2
  );
  const canRollNow = isUnrolled && canCurrentUserRollDice();

  if (dom.diceFeltWell) {
    dom.diceFeltWell.classList.toggle('can-roll', canRollNow);
  }

  if (isUnrolled) {
    clearDiceScrambleTimer();
    clearDiceAutoPassTimerOnly();
    lastRenderedDiceKey = `${turnPly}:pending:${turnColor}`;

    renderDieFaceSvg(dom.dieSvg1, null, false, false, true);
    renderDieFaceSvg(dom.dieSvg2, null, false, false, true);

    if (dom.dieCard1) {
      dom.dieCard1.classList.add('die-unrolled');
      dom.dieCard1.classList.remove('die-doubles', 'die-disabled', 'die-selected', 'rolling');
    }
    if (dom.dieCard2) {
      dom.dieCard2.classList.add('die-unrolled');
      dom.dieCard2.classList.remove('die-doubles', 'die-disabled', 'die-selected', 'rolling');
    }
    if (dom.diceFeltWell) {
      dom.diceFeltWell.classList.remove('rolling');
    }
    if (dom.diePieceImg1 && typeof dom.diePieceImg1.removeAttribute === 'function') {
      dom.diePieceImg1.removeAttribute('src');
    }
    if (dom.diePieceImg2 && typeof dom.diePieceImg2.removeAttribute === 'function') {
      dom.diePieceImg2.removeAttribute('src');
    }
    if (dom.dieLabel1) dom.dieLabel1.textContent = '?';
    if (dom.dieLabel2) dom.dieLabel2.textContent = '?';

    dom.diceBar.classList.remove('doubles-active', 'no-moves-active');
    if (dom.diceDoublesBadge) dom.diceDoublesBadge.classList.add('hidden');
    if (dom.diceCastleBadge) dom.diceCastleBadge.classList.add('hidden');
    if (dom.diceSkipBadge) dom.diceSkipBadge.classList.add('hidden');
    if (dom.diceSkipBtn) dom.diceSkipBtn.classList.add('hidden');

    if (dom.diceRollBtn) {
      const showBtn = viewingLive && gameState.status === 'playing';
      dom.diceRollBtn.classList.toggle('hidden', !showBtn);
      dom.diceRollBtn.disabled = !canRollNow;
      dom.diceRollBtn.textContent = canRollNow ? 'Roll Dice' : 'Waiting...';
    }

    if (dom.dicePromptText) {
      const sideLabel = turnColor === 'w' ? 'White' : 'Black';
      if (gameState.status !== 'playing') {
        dom.dicePromptText.textContent = 'Game over';
      } else if (!viewingLive) {
        dom.dicePromptText.textContent = `${sideLabel}: before roll`;
      } else if (net.mode === 'online' && turnColor !== net.myColor) {
        dom.dicePromptText.textContent = `Waiting for ${sideLabel} to roll...`;
      } else if (diceAutoRollEnabled) {
        dom.dicePromptText.textContent = `${sideLabel}: auto-rolling...`;
      } else {
        dom.dicePromptText.textContent = `${sideLabel}: click dice to roll`;
      }
    }

    scheduleDiceAutoRollIfNeeded();
    return;
  }

  clearDiceAutoRollTimer();
  const [v1, v2] = diceState.values;
  const t1 = DICE_PIECE_MAP[v1] || 'p';
  const t2 = DICE_PIECE_MAP[v2] || 'p';
  const isDoubles = Boolean(diceState.isDoubles);
  const noMoves = Boolean(diceState.noLegalMoves);

  let hasMoves1 = false;
  let hasMoves2 = false;
  if (viewingLive && gameState.status === 'playing' && !noMoves) {
    if (isDoubles) {
      hasMoves1 = true;
      hasMoves2 = true;
    } else {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const code = gameState.board[r][c];
          if (!code || getPieceColor(code) !== turnColor) continue;
          const pType = getPieceType(code);
          if (pType === t1 && !hasMoves1 && getLegalMovesForSquare(gameState, r, c).length > 0) {
            hasMoves1 = true;
          }
          if (pType === t2 && !hasMoves2 && getLegalMovesForSquare(gameState, r, c).length > 0) {
            hasMoves2 = true;
          }
        }
      }
    }
  }

  const dis1 = viewingLive && gameState.status === 'playing' ? !hasMoves1 : false;
  const dis2 = viewingLive && gameState.status === 'playing' ? !hasMoves2 : false;

  if (dom.dieCard1) dom.dieCard1.classList.remove('die-unrolled');
  if (dom.dieCard2) dom.dieCard2.classList.remove('die-unrolled');
  if (dom.diceRollBtn) {
    dom.diceRollBtn.classList.add('hidden');
    dom.diceRollBtn.disabled = true;
  }

  const rollKey = `${turnPly}:rolled:${v1}-${v2}:${turnColor}`;
  const isNewRoll = viewingLive && rollKey !== lastRenderedDiceKey;
  if (isNewRoll) {
    lastRenderedDiceKey = rollKey;
    if (dom.dieCard1 && dom.dieCard2) {
      dom.dieCard1.classList.remove('rolling');
      dom.dieCard2.classList.remove('rolling');
      if (dom.diceFeltWell) dom.diceFeltWell.classList.remove('rolling');
      if (typeof dom.dieCard1.offsetWidth === 'number') {
        void dom.dieCard1.offsetWidth;
      }
      dom.dieCard1.classList.add('rolling');
      dom.dieCard2.classList.add('rolling');
      if (dom.diceFeltWell) dom.diceFeltWell.classList.add('rolling');
    }
    startDiceScrambleAnimation(v1, v2, isDoubles, dis1, dis2);
  } else if (!diceScrambleTimer) {
    renderDieFaceSvg(dom.dieSvg1, v1, isDoubles, dis1, false);
    renderDieFaceSvg(dom.dieSvg2, v2, isDoubles, dis2, false);
  }

  if (dom.diePieceImg1) {
    dom.diePieceImg1.src = getPieceSvgDataUri(turnColor + t1);
    dom.diePieceImg1.alt = PIECE_DEFS[t1]?.name || t1;
  }
  if (dom.diePieceImg2) {
    dom.diePieceImg2.src = getPieceSvgDataUri(turnColor + t2);
    dom.diePieceImg2.alt = PIECE_DEFS[t2]?.name || t2;
  }
  if (dom.dieLabel1) {
    dom.dieLabel1.textContent = PIECE_DEFS[t1]?.name || 'Pawn';
  }
  if (dom.dieLabel2) {
    dom.dieLabel2.textContent = PIECE_DEFS[t2]?.name || 'Pawn';
  }

  const selCode =
    viewingLive && selectedSq ? gameState.board[selectedSq.r]?.[selectedSq.c] : null;
  const selType = selCode ? getPieceType(selCode) : null;

  if (dom.dieCard1) {
    dom.dieCard1.classList.toggle('die-doubles', isDoubles && !noMoves);
    dom.dieCard1.classList.toggle('die-disabled', dis1);
    dom.dieCard1.classList.toggle('die-selected', Boolean(!dis1 && selType === t1));
  }
  if (dom.dieCard2) {
    dom.dieCard2.classList.toggle('die-doubles', isDoubles && !noMoves);
    dom.dieCard2.classList.toggle('die-disabled', dis2);
    dom.dieCard2.classList.toggle('die-selected', Boolean(!dis2 && selType === t2));
  }

  const canCastleRight = Boolean(
    !noMoves &&
      ((v1 === 6 && v2 === 4) || (v1 === 4 && v2 === 6)) &&
      ((turnColor === 'w' && (gameState.castling?.wK || gameState.castling?.wQ)) ||
        (turnColor === 'b' && (gameState.castling?.bK || gameState.castling?.bQ)))
  );

  dom.diceBar.classList.toggle('doubles-active', Boolean(isDoubles && !noMoves));
  dom.diceBar.classList.toggle('no-moves-active', noMoves);

  if (dom.diceDoublesBadge) {
    dom.diceDoublesBadge.classList.toggle('hidden', !isDoubles);
  }
  if (dom.diceCastleBadge) {
    dom.diceCastleBadge.classList.toggle('hidden', !canCastleRight);
  }
  if (dom.diceSkipBadge) {
    dom.diceSkipBadge.classList.toggle('hidden', !noMoves);
  }
  if (dom.diceSkipBtn) {
    dom.diceSkipBtn.classList.toggle(
      'hidden',
      !(viewingLive && gameState.status === 'playing' && noMoves)
    );
  }

  if (dom.dicePromptText) {
    const sideLabel = turnColor === 'w' ? 'White' : 'Black';
    const n1 = PIECE_DEFS[t1]?.name || 'Pawn';
    const n2 = PIECE_DEFS[t2]?.name || 'Pawn';
    const waitingOpponent =
      viewingLive && net.mode === 'online' && gameState.status === 'playing' && turnColor !== net.myColor;

    if (noMoves) {
      dom.dicePromptText.textContent = 'No legal moves — passing turn...';
    } else if (waitingOpponent) {
      dom.dicePromptText.textContent = isDoubles
        ? `${sideLabel} rolled Doubles — wild move`
        : `${sideLabel} to move ${n1} or ${n2}`;
    } else if (isDoubles) {
      dom.dicePromptText.textContent = 'Doubles — move any piece';
    } else if (hasMoves1 && !hasMoves2 && viewingLive && gameState.status === 'playing') {
      dom.dicePromptText.textContent = `Move a ${n1} (${n2} blocked)`;
    } else if (!hasMoves1 && hasMoves2 && viewingLive && gameState.status === 'playing') {
      dom.dicePromptText.textContent = `Move a ${n2} (${n1} blocked)`;
    } else if (n1 === n2) {
      dom.dicePromptText.textContent = `${sideLabel}: move any ${n1}`;
    } else {
      dom.dicePromptText.textContent = `${sideLabel}: move ${n1} or ${n2}`;
    }
  }

  scheduleDiceAutoPassIfNeeded();
}

function renderAll() {
  if (typeof document === 'undefined') return;
  renderBoard();
  renderDiceBar();
  renderPlayerBars();
  renderStatusAndControls();
  renderMoveHistory();
}

// --- Move History Replay (< / > & Arrow Keys) ---

function stepHistoryTo(targetPly) {
  const maxPly = gameState.moveHistory.length;
  const minPly = getReplayMinPly();
  const clamped = Math.max(minPly, Math.min(maxPly, targetPly));
  if (clamped === viewPly) return;

  const delta = clamped - viewPly;
  const prevPly = viewPly;
  viewPly = clamped;
  cancelActiveDrag();
  clearSelection();
  closePromotionPicker();

  const fogActive = isFogActiveNow();
  const viewerColor = getFogViewerColor();

  if (delta === 1) {
    const frame = getFrameForPly(clamped);
    if (frame?.meta?.isPass) {
      playSound('turnPass');
    } else {
      queueSlideAnimationFromFrame(frame, false);
      const moverColor = (clamped - 1) % 2 === 0 ? 'w' : 'b';
      const hideMetaAudio = fogActive && moverColor !== viewerColor && !frame?.lastMove?.to;
      if (hideMetaAudio) {
        playSound('moveSelf');
      } else if (frame?.inCheck && !getVariantDef(gameState).royalCaptureWins) {
        playSound('check');
      } else if (frame?.meta?.promotion) {
        playSound('promote');
      } else if (frame?.meta?.castleSide) {
        playSound('castle');
      } else if (frame?.meta?.isCapture) {
        playSound('capture');
      } else {
        playSound('moveSelf');
      }
    }
  } else if (delta === -1) {
    const undoneFrame = getFrameForPly(prevPly);
    if (undoneFrame?.meta?.isPass) {
      playSound('turnPass');
    } else {
      queueSlideAnimationFromFrame(undoneFrame, true);
      playSound('moveSelf');
    }
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

  const vDef = getVariantDef(gameState);
  const headers = [];
  if (gameState.variant && gameState.variant !== 'standard') {
    headers.push(`[Variant "${vDef.name}"]`);
  }
  headers.push(
    `[White "${whiteName.replace(/"/g, '')}"]`,
    `[Black "${blackName.replace(/"/g, '')}"]`,
    `[TimeControl "${tc}"]`,
    `[Result "${result}"]`
  );

  const fogActive = isFogActiveNow();
  const viewerColor = getFogViewerColor();

  const moveTokens = [];
  for (let i = 0; i < gameState.moveHistory.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1;
    const w = fogActive && viewerColor !== 'w' ? '?' : gameState.moveHistory[i];
    const bRaw = gameState.moveHistory[i + 1];
    const b = bRaw ? (fogActive && viewerColor !== 'b' ? '?' : bRaw) : null;
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

let activeTooltipDot = null;
let pinnedTooltipDot = null;

function hideVariantTooltip() {
  if (activeTooltipDot) {
    activeTooltipDot.classList.remove('info-active');
  }
  activeTooltipDot = null;
  pinnedTooltipDot = null;
  if (dom.variantTooltip) {
    dom.variantTooltip.classList.add('hidden');
  }
}

function showVariantTooltip(dotEl, variantKey, pin = false) {
  if (!dom.variantTooltip || !dotEl) return;
  const key = variantKey || dotEl.dataset?.variantInfo;
  if (!key || !Object.prototype.hasOwnProperty.call(VARIANT_DEFS, key)) return;
  const vDef = getVariantDef(key);

  if (activeTooltipDot && activeTooltipDot !== dotEl) {
    activeTooltipDot.classList.remove('info-active');
  }
  activeTooltipDot = dotEl;
  dotEl.classList.add('info-active');
  if (pin) {
    pinnedTooltipDot = dotEl;
  }

  const titleEl = document.createElement('strong');
  titleEl.className = 'variant-tooltip-title';
  titleEl.textContent = vDef.name;

  const bodyEl = document.createElement('span');
  bodyEl.className = 'variant-tooltip-body';
  bodyEl.textContent = vDef.description;

  dom.variantTooltip.replaceChildren(titleEl, bodyEl);
  dom.variantTooltip.classList.remove('hidden');

  if (
    typeof dotEl.getBoundingClientRect === 'function' &&
    typeof dom.variantTooltip.getBoundingClientRect === 'function' &&
    typeof window !== 'undefined'
  ) {
    const dotRect = dotEl.getBoundingClientRect();
    const tipRect = dom.variantTooltip.getBoundingClientRect();
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    const tipW = tipRect.width || 228;
    const tipH = tipRect.height || 68;
    const margin = 8;

    let left = dotRect.left + dotRect.width / 2 - tipW / 2;
    left = Math.max(margin, Math.min(vw - tipW - margin, left));

    let top = dotRect.top - tipH - 8;
    if (top < margin) {
      top = Math.min(vh - tipH - margin, dotRect.bottom + 8);
    }

    dom.variantTooltip.style.left = `${Math.round(left)}px`;
    dom.variantTooltip.style.top = `${Math.round(top)}px`;
  }
}

function togglePinnedVariantTooltip(dotEl) {
  if (!dotEl) return;
  if (pinnedTooltipDot === dotEl && dom.variantTooltip && !dom.variantTooltip.classList.contains('hidden')) {
    hideVariantTooltip();
    return;
  }
  showVariantTooltip(dotEl, dotEl.dataset?.variantInfo, true);
}

function bindVariantTooltipEvents() {
  if (typeof document === 'undefined' || !dom.variantTooltip) return;
  const dots = document.querySelectorAll ? document.querySelectorAll('.variant-info-dot') : [];
  for (const dot of dots) {
    if (typeof dot.addEventListener !== 'function') continue;
    dot.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      pinnedTooltipDot = null;
      showVariantTooltip(dot, dot.dataset?.variantInfo, false);
    });
    dot.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      if (pinnedTooltipDot !== dot) {
        hideVariantTooltip();
      }
    });
    dot.addEventListener('focus', () => {
      showVariantTooltip(dot, dot.dataset?.variantInfo, false);
    });
    dot.addEventListener('blur', () => {
      if (pinnedTooltipDot !== dot) {
        hideVariantTooltip();
      }
    });
    dot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        togglePinnedVariantTooltip(dot);
      }
    });
  }

  const dismissOnOutside = (e) => {
    const insideDot = e.target?.closest ? e.target.closest('.variant-info-dot') : null;
    if (!insideDot && dom.variantTooltip && !dom.variantTooltip.classList.contains('hidden')) {
      hideVariantTooltip();
    }
  };
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', dismissOnOutside);
  } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pointerdown', dismissOnOutside);
  }
}

function syncSetupPanelUI() {
  if (dom.setupVariantGrid) {
    for (const btn of dom.setupVariantGrid.querySelectorAll('.variant-btn')) {
      btn.classList.toggle('active', btn.dataset.variant === setupConfig.variant);
    }
  }

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
  if (dom.mobResignBtn) {
    dom.mobResignBtn.textContent = 'Resign';
    dom.mobResignBtn.classList.remove('btn-danger');
  }
}

function handleResignClick() {
  if (net.mode !== 'online' || gameState.status !== 'playing' || opponentDisconnected) return;

  if (!resignConfirmTimer) {
    if (dom.resignBtn) {
      dom.resignBtn.textContent = 'Confirm?';
      dom.resignBtn.classList.add('btn-danger');
    }
    if (dom.mobResignBtn) {
      dom.mobResignBtn.textContent = 'Confirm?';
      dom.mobResignBtn.classList.add('btn-danger');
    }
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
  if (dom.soundOnIcon && dom.soundOffIcon) {
    dom.soundOnIcon.classList.toggle('hidden', !soundEnabled);
    dom.soundOffIcon.classList.toggle('hidden', soundEnabled);
  }
  if (dom.mobileSoundOn && dom.mobileSoundOff) {
    dom.mobileSoundOn.classList.toggle('hidden', !soundEnabled);
    dom.mobileSoundOff.classList.toggle('hidden', soundEnabled);
  }
}

function toggleSoundSetting() {
  soundEnabled = !soundEnabled;
  updateSoundToggleUI();
  try {
    localStorage.setItem('chess_sound_enabled', soundEnabled ? '1' : '0');
  } catch (_) {}
  if (soundEnabled) playSound('moveSelf');
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
    setMobileTab('play');
    joinGameRoom(code);
  }
}

function goHome(force = false) {
  if (!force && net.mode === 'online' && (gameState.status === 'playing' || gameState.status === 'secret_pick')) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmLeave = window.confirm('Leave the active game and return to the main board?');
      if (!confirmLeave) return false;
    }
    sendPacket(net.conn, { type: 'resign' });
  }

  if (net.joinTimer) {
    clearTimeout(net.joinTimer);
    net.joinTimer = null;
  }

  const savedName = net.myName;
  cleanupNetworkSession();
  net.myName = savedName;
  net.mode = 'local';
  boardFlipped = false;
  setupConfig.customState = null;
  editorState.active = false;
  editorSelectedSq = null;
  editorState.selectedTool = null;
  editorState.validationError = null;
  premoveQueue = [];
  clearBoardTransientUI();
  setGameFeedback('');

  if (dom.sidebar) {
    dom.sidebar.dataset.mobileTab = 'play';
  }
  if (dom.mobileTabs) {
    dom.mobileTabs.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === 'play');
    });
  }

  gameState = createInitialState(setupConfig.variant || 'standard');
  viewPly = 0;
  renderAll();
  return true;
}

function cancelJoin() {
  if (net.joinTimer) {
    clearTimeout(net.joinTimer);
    net.joinTimer = null;
  }
  cleanupNetworkSession();
  net.mode = 'local';
  setGameFeedback('');
  renderAll();
}

function openBoardEditor() {
  net.mode = 'editor';
  editorState.active = true;
  editorState.board = cloneBoard(gameState.board || INITIAL_BOARD);
  editorState.turn = gameState.turn || 'w';
  editorState.variant = gameState.variant || setupConfig.variant || 'standard';
  editorState.castling = gameState.castling
    ? { ...gameState.castling }
    : { wK: true, wQ: true, bK: true, bQ: true };
  editorState.pockets = {
    w: gameState.pockets?.w ? gameState.pockets.w.slice() : [],
    b: gameState.pockets?.b ? gameState.pockets.b.slice() : []
  };
  editorState.selectedTool = null;
  editorState.validationError = null;
  editorSelectedSq = null;

  if (dom.editorError) dom.editorError.classList.add('hidden');
  initEditorPaletteIcons();
  syncEditorPanelUI();
  renderAll();

  if (typeof window !== 'undefined' && window.innerWidth <= 900) {
    if (dom.sidebar) dom.sidebar.dataset.mobileTab = 'play';
  }
}

function closeBoardEditor() {
  net.mode = 'local';
  editorState.active = false;
  editorSelectedSq = null;
  editorState.selectedTool = null;
  editorState.validationError = null;
  renderAll();
}

function syncEditorCastlingValidity() {
  if (!dom.editorCastlingWk) return;
  const board = editorState.board;
  const canWk = board[7]?.[4] === 'wk' && board[7]?.[7] === 'wr';
  const canWq = board[7]?.[4] === 'wk' && board[7]?.[0] === 'wr';
  const canBk = board[0]?.[4] === 'bk' && board[0]?.[7] === 'br';
  const canBq = board[0]?.[4] === 'bk' && board[0]?.[0] === 'br';

  if (!canWk) editorState.castling.wK = false;
  if (!canWq) editorState.castling.wQ = false;
  if (!canBk) editorState.castling.bK = false;
  if (!canBq) editorState.castling.bQ = false;

  dom.editorCastlingWk.disabled = !canWk;
  dom.editorCastlingWk.checked = Boolean(editorState.castling.wK);

  dom.editorCastlingWq.disabled = !canWq;
  dom.editorCastlingWq.checked = Boolean(editorState.castling.wQ);

  dom.editorCastlingBk.disabled = !canBk;
  dom.editorCastlingBk.checked = Boolean(editorState.castling.bK);

  dom.editorCastlingBq.disabled = !canBq;
  dom.editorCastlingBq.checked = Boolean(editorState.castling.bQ);
}

function initEditorPaletteIcons() {
  if (!dom.editorPalette) return;
  dom.editorPalette.querySelectorAll('.palette-piece-btn').forEach((btn) => {
    const code = btn.dataset.piece;
    if (code && !btn.querySelector('img')) {
      const img = document.createElement('img');
      img.src = getPieceSvgDataUri(code);
      img.alt = code;
      btn.appendChild(img);
    }
  });
}

function renderEditorPockets() {
  if (!dom.editorWhitePocket || !dom.editorBlackPocket) return;

  const types = ['p', 'n', 'b', 'r', 'q'];
  const renderSide = (side, container) => {
    container.replaceChildren();
    const currentList = editorState.pockets[side] || [];
    for (const t of types) {
      const count = currentList.filter((x) => x === t).length;
      const ctrl = document.createElement('div');
      ctrl.className = 'pocket-chip-control';

      const img = document.createElement('img');
      img.src = getPieceSvgDataUri(side + t);
      img.alt = side + t;
      ctrl.appendChild(img);

      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'pocket-chip-btn';
      minusBtn.textContent = '−';
      minusBtn.title = `Remove ${t.toUpperCase()}`;
      minusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = editorState.pockets[side].indexOf(t);
        if (idx !== -1) {
          editorState.pockets[side].splice(idx, 1);
          renderEditorPockets();
        }
      });
      ctrl.appendChild(minusBtn);

      const countSpan = document.createElement('span');
      countSpan.className = 'pocket-chip-count';
      countSpan.textContent = String(count);
      ctrl.appendChild(countSpan);

      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'pocket-chip-btn';
      plusBtn.textContent = '+';
      plusBtn.title = `Add ${t.toUpperCase()}`;
      plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editorState.pockets[side].length < 32) {
          editorState.pockets[side].push(t);
          renderEditorPockets();
        }
      });
      ctrl.appendChild(plusBtn);

      container.appendChild(ctrl);
    }
  };

  renderSide('w', dom.editorWhitePocket);
  renderSide('b', dom.editorBlackPocket);
}

function syncEditorPanelUI() {
  if (!dom.gameEditor) return;
  if (dom.editorTurnWhite) dom.editorTurnWhite.classList.toggle('active', editorState.turn === 'w');
  if (dom.editorTurnBlack) dom.editorTurnBlack.classList.toggle('active', editorState.turn === 'b');

  if (dom.editorVariantChips) {
    dom.editorVariantChips.querySelectorAll('.editor-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.variant === editorState.variant);
    });
  }

  if (dom.editorPocketsSection) {
    dom.editorPocketsSection.classList.toggle('hidden', editorState.variant !== 'crazyhouse');
    if (editorState.variant === 'crazyhouse') {
      renderEditorPockets();
    }
  }

  if (dom.editorPalette) {
    dom.editorPalette.querySelectorAll('.palette-piece-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.piece === editorState.selectedTool);
    });
  }
  if (dom.editorEraseTool) {
    dom.editorEraseTool.classList.toggle('active', editorState.selectedTool === 'erase');
  }

  syncEditorCastlingValidity();
}

function startLocalGameFromEditor() {
  const validation = validateCustomPosition(
    editorState.board,
    editorState.turn,
    editorState.variant,
    editorState.pockets,
    editorState.castling
  );

  if (!validation.valid) {
    if (dom.editorError) {
      dom.editorError.textContent = validation.error;
      dom.editorError.classList.remove('hidden');
    }
    return false;
  }

  if (dom.editorError) dom.editorError.classList.add('hidden');

  const config = {
    variant: editorState.variant,
    board: editorState.board,
    turn: editorState.turn,
    castling: editorState.castling,
    pockets: editorState.pockets
  };

  gameState = createCustomState(config);
  setupConfig.variant = editorState.variant;
  setupConfig.customState = config;
  net.mode = 'local';
  editorState.active = false;
  editorSelectedSq = null;
  editorState.selectedTool = null;
  viewPly = 0;
  premoveQueue = [];
  clearBoardTransientUI();
  setGameFeedback('');
  playSound('gameStart');
  renderAll();
  return true;
}

function startOnlineGameFromEditor() {
  const validation = validateCustomPosition(
    editorState.board,
    editorState.turn,
    editorState.variant,
    editorState.pockets,
    editorState.castling
  );

  if (!validation.valid) {
    if (dom.editorError) {
      dom.editorError.textContent = validation.error;
      dom.editorError.classList.remove('hidden');
    }
    return false;
  }

  if (dom.editorError) dom.editorError.classList.add('hidden');

  const config = {
    variant: editorState.variant,
    board: editorState.board,
    turn: editorState.turn,
    castling: editorState.castling,
    pockets: editorState.pockets
  };

  setupConfig.variant = editorState.variant;
  setupConfig.customState = config;
  editorState.active = false;
  editorSelectedSq = null;
  editorState.selectedTool = null;
  createGameRoom();
  return true;
}

function initUI() {
  cacheDom();

  // Restore saved preferences (name, theme, sound, dice auto-roll)
  try {
    const savedName = localStorage.getItem('chess_display_name');
    if (savedName) dom.nameInput.value = savedName.slice(0, 18);
    const savedTheme = localStorage.getItem('chess_board_theme');
    if (savedTheme) applyBoardTheme(savedTheme);
    const savedSound = localStorage.getItem('chess_sound_enabled');
    if (savedSound === '0') soundEnabled = false;
    const savedAutoRoll = localStorage.getItem('chess_dice_autoroll');
    if (savedAutoRoll === '1') diceAutoRollEnabled = true;
  } catch (_) {}
  if (dom.diceAutoRollToggle) {
    dom.diceAutoRollToggle.checked = diceAutoRollEnabled;
  }

  syncMyNameFromInput();
  updateSoundToggleUI();
  bindVariantTooltipEvents();
  syncSetupPanelUI();

  // Board & pocket pointer + right-click contextmenu handlers
  dom.board.addEventListener('pointerdown', handleBoardPointerDown);
  dom.boardShell.addEventListener('contextmenu', (e) => e.preventDefault());
  if (dom.topPocket) dom.topPocket.addEventListener('contextmenu', (e) => e.preventDefault());
  if (dom.bottomPocket) dom.bottomPocket.addEventListener('contextmenu', (e) => e.preventDefault());
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
      hideVariantTooltip();
      if (pendingPromotion) {
        closePromotionPicker();
        renderAll();
      } else if (
        premoveQueue.length > 0 ||
        premoveOriginSq ||
        premovePocketType ||
        selectedSq ||
        selectedPocketType ||
        drag.active
      ) {
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

  dom.soundToggleBtn.addEventListener('click', toggleSoundSetting);
  if (dom.mobileSoundBtn) {
    dom.mobileSoundBtn.addEventListener('click', toggleSoundSetting);
  }

  // Mobile Segmented Tabs & Variant Pill
  if (dom.mobileTabs) {
    dom.mobileTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-tab-btn');
      if (!btn) return;
      setMobileTab(btn.dataset.tab);
    });
  }

  if (dom.mobileVariantPill) {
    dom.mobileVariantPill.addEventListener('click', () => {
      setMobileTab('variants');
      if (dom.sidebar && typeof dom.sidebar.scrollIntoView === 'function') {
        dom.sidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  if (dom.mobileVariantGrid) {
    dom.mobileVariantGrid.addEventListener('click', (e) => {
      const infoDot = e.target?.closest ? e.target.closest('.variant-info-dot') : null;
      if (infoDot) {
        e.stopPropagation();
        togglePinnedVariantTooltip(infoDot);
        return;
      }
      if (net.mode === 'online' || net.mode === 'waiting' || net.mode === 'joining') return;
      const btn = e.target?.closest ? e.target.closest('.variant-btn') : null;
      if (!btn) return;
      const v = btn.dataset.variant;
      if (!v || !Object.prototype.hasOwnProperty.call(VARIANT_DEFS, v)) return;
      hideVariantTooltip();
      setupConfig.variant = v;
      setupConfig.customState = null;
      if (net.mode === 'setup') {
        if (gameState.moveHistory.length === 0) {
          clearBoardTransientUI();
          gameState = createInitialState(v);
          viewPly = 0;
        }
        syncSetupPanelUI();
        renderAll();
        setMobileTab('play');
      } else {
        clearBoardTransientUI();
        gameState = createInitialState(v);
        viewPly = 0;
        syncSetupPanelUI();
        renderAll();
        scrollBoardIntoViewOnMobile();
      }
    });
  }

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
    setMobileTab('play');
    syncSetupPanelUI();
    renderAll();
  });

  dom.setupBackBtn.addEventListener('click', () => {
    net.mode = 'local';
    setGameFeedback('');
    if (
      gameState.moveHistory.length === 0 &&
      setupConfig.variant &&
      gameState.variant !== setupConfig.variant &&
      !setupConfig.customState
    ) {
      clearBoardTransientUI();
      gameState = createInitialState(setupConfig.variant);
      viewPly = 0;
    }
    renderAll();
  });

  if (dom.setupVariantGrid) {
    dom.setupVariantGrid.addEventListener('click', (e) => {
      const infoDot = e.target?.closest ? e.target.closest('.variant-info-dot') : null;
      if (infoDot) {
        e.stopPropagation();
        togglePinnedVariantTooltip(infoDot);
        return;
      }
      const btn = e.target?.closest ? e.target.closest('.variant-btn') : null;
      if (!btn) return;
      const v = btn.dataset.variant;
      if (v && Object.prototype.hasOwnProperty.call(VARIANT_DEFS, v)) {
        hideVariantTooltip();
        setupConfig.variant = v;
        if (gameState.moveHistory.length === 0 && !setupConfig.customState) {
          clearBoardTransientUI();
          gameState = createInitialState(v);
          viewPly = 0;
        }
        syncSetupPanelUI();
        renderAll();
      }
    });
  }

  if (dom.localVariantBar) {
    dom.localVariantBar.addEventListener('click', (e) => {
      const infoDot = e.target?.closest ? e.target.closest('.variant-info-dot') : null;
      if (infoDot) {
        e.stopPropagation();
        togglePinnedVariantTooltip(infoDot);
        return;
      }
      if (net.mode !== 'local' && net.mode !== 'setup') return;
      const btn = e.target?.closest ? e.target.closest('.local-variant-btn') : null;
      if (!btn) return;
      const v = btn.dataset.variant;
      if (!v || !Object.prototype.hasOwnProperty.call(VARIANT_DEFS, v)) return;
      hideVariantTooltip();
      net.mode = 'local';
      setupConfig.variant = v;
      setupConfig.customState = null;
      clearBoardTransientUI();
      gameState = createInitialState(v);
      viewPly = 0;
      syncSetupPanelUI();
      renderAll();
    });
  }

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

  if (dom.pasteCodeBtn) {
    dom.pasteCodeBtn.addEventListener('click', async () => {
      if (net.mode === 'joining') return;
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
          dom.joinInput.focus();
          setGameFeedback('Long-press the code box to paste your invite code.');
          return;
        }
        const raw = await navigator.clipboard.readText();
        const clean = extractCleanGameCode(raw);
        if (clean) {
          dom.joinInput.value = clean;
          setGameFeedback('');
          if (clean.length === 5) {
            joinGameRoom(clean);
          } else {
            dom.joinInput.focus();
          }
        } else {
          setGameFeedback('Clipboard did not contain a 5-character game code.');
        }
      } catch (_) {
        dom.joinInput.focus();
        setGameFeedback('Tap and hold the code box to paste.');
      }
    });
  }

  dom.copyCodeBtn.addEventListener('click', () => {
    if (net.roomCode) copyTextWithFeedback(net.roomCode, dom.copyCodeBtn, 'Copy');
  });

  if (dom.shareLinkBtn) {
    dom.shareLinkBtn.addEventListener('click', async () => {
      if (!net.roomCode) return;
      const inviteUrl = buildInviteUrl(net.roomCode);
      const vName = getVariantDef(setupConfig.variant).name;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `${vName} — Chess Invite`,
            text: `Play ${vName} with me! Code: ${net.roomCode}`,
            url: inviteUrl
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      copyTextWithFeedback(inviteUrl, dom.copyLinkBtn, 'Copy Invite Link');
    });
  }

  dom.copyLinkBtn.addEventListener('click', () => {
    if (net.roomCode) {
      copyTextWithFeedback(buildInviteUrl(net.roomCode), dom.copyLinkBtn, 'Copy Invite Link');
    }
  });

  dom.cancelGameBtn.addEventListener('click', () => {
    goHome(true);
  });

  dom.leaveGameBtn.addEventListener('click', () => {
    goHome();
  });

  if (dom.brandHomeBtn) dom.brandHomeBtn.addEventListener('click', () => goHome());
  if (dom.desktopHomeBtn) dom.desktopHomeBtn.addEventListener('click', () => goHome());
  if (dom.mobileBrandHomeBtn) dom.mobileBrandHomeBtn.addEventListener('click', () => goHome());
  if (dom.mobileHomeBtn) dom.mobileHomeBtn.addEventListener('click', () => goHome());
  if (dom.mobLeaveBtn) dom.mobLeaveBtn.addEventListener('click', () => goHome());
  if (dom.cancelJoinBtn) dom.cancelJoinBtn.addEventListener('click', cancelJoin);

  if (dom.customPositionBtn) dom.customPositionBtn.addEventListener('click', openBoardEditor);
  if (dom.mobCustomPositionBtn) dom.mobCustomPositionBtn.addEventListener('click', openBoardEditor);
  if (dom.editorBackBtn) dom.editorBackBtn.addEventListener('click', closeBoardEditor);

  if (dom.editorTurnWhite) {
    dom.editorTurnWhite.addEventListener('click', () => {
      editorState.turn = 'w';
      syncEditorPanelUI();
    });
  }
  if (dom.editorTurnBlack) {
    dom.editorTurnBlack.addEventListener('click', () => {
      editorState.turn = 'b';
      syncEditorPanelUI();
    });
  }

  if (dom.editorVariantChips) {
    dom.editorVariantChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.editor-chip');
      if (!chip) return;
      editorState.variant = chip.dataset.variant || 'standard';
      syncEditorPanelUI();
      renderAll();
    });
  }

  if (dom.editorPalette) {
    dom.editorPalette.addEventListener('click', (e) => {
      const btn = e.target.closest('.palette-piece-btn');
      if (!btn) return;
      const piece = btn.dataset.piece;
      editorState.selectedTool = editorState.selectedTool === piece ? null : piece;
      syncEditorPanelUI();
    });
  }

  if (dom.editorEraseTool) {
    dom.editorEraseTool.addEventListener('click', () => {
      editorState.selectedTool = editorState.selectedTool === 'erase' ? null : 'erase';
      syncEditorPanelUI();
    });
  }

  if (dom.editorCastlingWk) {
    dom.editorCastlingWk.addEventListener('change', () => {
      editorState.castling.wK = dom.editorCastlingWk.checked;
    });
  }
  if (dom.editorCastlingWq) {
    dom.editorCastlingWq.addEventListener('change', () => {
      editorState.castling.wQ = dom.editorCastlingWq.checked;
    });
  }
  if (dom.editorCastlingBk) {
    dom.editorCastlingBk.addEventListener('change', () => {
      editorState.castling.bK = dom.editorCastlingBk.checked;
    });
  }
  if (dom.editorCastlingBq) {
    dom.editorCastlingBq.addEventListener('change', () => {
      editorState.castling.bQ = dom.editorCastlingBq.checked;
    });
  }

  if (dom.editorClearBtn) {
    dom.editorClearBtn.addEventListener('click', () => {
      editorState.board = Array.from({ length: 8 }, () => Array(8).fill(null));
      editorState.castling = { wK: false, wQ: false, bK: false, bQ: false };
      editorState.pockets = { w: [], b: [] };
      editorSelectedSq = null;
      editorState.validationError = null;
      if (dom.editorError) dom.editorError.classList.add('hidden');
      syncEditorPanelUI();
      renderBoard();
    });
  }

  if (dom.editorResetBtn) {
    dom.editorResetBtn.addEventListener('click', () => {
      editorState.board = cloneBoard(INITIAL_BOARD);
      editorState.turn = 'w';
      editorState.castling = { wK: true, wQ: true, bK: true, bQ: true };
      editorState.pockets = { w: [], b: [] };
      editorSelectedSq = null;
      editorState.validationError = null;
      if (dom.editorError) dom.editorError.classList.add('hidden');
      syncEditorPanelUI();
      renderBoard();
    });
  }

  if (dom.editorPlayLocalBtn) {
    dom.editorPlayLocalBtn.addEventListener('click', startLocalGameFromEditor);
  }
  if (dom.editorPlayOnlineBtn) {
    dom.editorPlayOnlineBtn.addEventListener('click', startOnlineGameFromEditor);
  }

  initEditorPaletteIcons();

  // Replay Navigation Buttons + PGN Copy
  dom.navFirstBtn.addEventListener('click', () => stepHistoryTo(0));
  dom.navPrevBtn.addEventListener('click', () => stepHistoryTo(viewPly - 1));
  dom.navNextBtn.addEventListener('click', () => stepHistoryTo(viewPly + 1));
  dom.navLastBtn.addEventListener('click', () => stepHistoryTo(gameState.moveHistory.length));
  if (dom.mobPrevBtn) dom.mobPrevBtn.addEventListener('click', () => stepHistoryTo(viewPly - 1));
  if (dom.mobNextBtn) dom.mobNextBtn.addEventListener('click', () => stepHistoryTo(viewPly + 1));

  dom.copyPgnBtn.addEventListener('click', () => {
    copyTextWithFeedback(buildPGNString(), dom.copyPgnBtn, 'Copy PGN');
  });

  if (dom.cancelPremoveBtn) {
    dom.cancelPremoveBtn.addEventListener('click', () => {
      cancelAllPremoves();
    });
  }
  if (dom.mobileCancelPremoveBtn) {
    dom.mobileCancelPremoveBtn.addEventListener('click', () => {
      cancelAllPremoves();
    });
  }

  // Footer & Mobile Dock Action Controls
  const resetLocalBoard = () => {
    if (net.mode === 'online') return;
    clearBoardTransientUI();
    if (setupConfig.customState) {
      gameState = createCustomState(setupConfig.customState);
    } else {
      const currentVariant = gameState.variant || setupConfig.variant || 'standard';
      gameState = createInitialState(currentVariant);
    }
    viewPly = 0;
    renderAll();
  };

  const toggleBoardFlip = () => {
    boardFlipped = !boardFlipped;
    positionPromotionMenu();
    renderAll();
  };

  dom.resetLocalBtn.addEventListener('click', resetLocalBoard);
  if (dom.mobResetBtn) dom.mobResetBtn.addEventListener('click', resetLocalBoard);

  dom.flipBoardBtn.addEventListener('click', toggleBoardFlip);
  if (dom.mobFlipBtn) dom.mobFlipBtn.addEventListener('click', toggleBoardFlip);

  if (dom.mobPlayFriendBtn) {
    dom.mobPlayFriendBtn.addEventListener('click', () => {
      if (net.mode === 'online' || net.mode === 'joining') return;
      setMobileTab('play');
      if (net.mode === 'local') {
        setGameFeedback('');
        net.mode = 'setup';
        syncSetupPanelUI();
        renderAll();
      }
      if (dom.gameBox && typeof dom.gameBox.scrollIntoView === 'function') {
        dom.gameBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  dom.drawBtn.addEventListener('click', handleOfferDrawClick);
  dom.acceptDrawBtn.addEventListener('click', handleAcceptDraw);
  dom.declineDrawBtn.addEventListener('click', handleDeclineDraw);
  dom.resignBtn.addEventListener('click', handleResignClick);
  dom.rematchBtn.addEventListener('click', handleRematchClick);

  if (dom.mobDrawBtn) dom.mobDrawBtn.addEventListener('click', handleOfferDrawClick);
  if (dom.mobAcceptDrawBtn) dom.mobAcceptDrawBtn.addEventListener('click', handleAcceptDraw);
  if (dom.mobDeclineDrawBtn) dom.mobDeclineDrawBtn.addEventListener('click', handleDeclineDraw);
  if (dom.mobResignBtn) dom.mobResignBtn.addEventListener('click', handleResignClick);
  if (dom.mobRematchBtn) dom.mobRematchBtn.addEventListener('click', handleRematchClick);

  if (dom.secretRandomBtn) {
    dom.secretRandomBtn.addEventListener('click', () => {
      secretPickCol = Math.floor(Math.random() * 8);
      if (dom.secretConfirmBtn) dom.secretConfirmBtn.disabled = false;
      renderBoard();
    });
  }

  if (dom.secretConfirmBtn) {
    dom.secretConfirmBtn.addEventListener('click', () => {
      if (secretPickCol === null) return;
      if (gameState.status !== 'secret_pick') return;

      if (net.mode === 'online') {
        if (net.role === 'host') {
          assignSecretQueen(gameState, net.myColor, secretPickCol);
          secretPickCol = null;
          if (gameState.secretQueens.w.picked && gameState.secretQueens.b.picked) {
            gameState.status = 'playing';
            clockState.running = clockState.timed;
            clockState.lastTick = Date.now();
            clockState.lastSyncPerf = getNowPerf();
            playSound('gameStart');
          }
          broadcastHostState();
          renderAll();
        } else if (net.role === 'guest') {
          sendPacket(net.conn, { type: 'secret_pick', col: secretPickCol });
          if (gameState.secretQueens && gameState.secretQueens[net.myColor]) {
            gameState.secretQueens[net.myColor].picked = true;
            gameState.secretQueens[net.myColor].sq = {
              r: net.myColor === 'w' ? 6 : 1,
              c: secretPickCol
            };
          }
          secretPickCol = null;
          renderAll();
        }
      } else {
        const whitePicked = Boolean(gameState.secretQueens?.w?.picked);
        if (!whitePicked) {
          assignSecretQueen(gameState, 'w', secretPickCol);
          secretPickCol = null;
          renderAll();
        } else {
          assignSecretQueen(gameState, 'b', secretPickCol);
          secretPickCol = null;
          gameState.status = 'playing';
          playSound('gameStart');
          renderAll();
        }
      }
    });
  }

  if (dom.diceAutoRollToggle) {
    dom.diceAutoRollToggle.addEventListener('change', (e) => {
      setDiceAutoRoll(Boolean(e.target?.checked));
    });
  }
  if (dom.diceRollBtn) {
    dom.diceRollBtn.addEventListener('click', () => executeDiceRollRequest());
  }
  if (dom.diceFeltWell) {
    dom.diceFeltWell.addEventListener('click', (e) => {
      if (e.target === dom.diceFeltWell && canCurrentUserRollDice()) {
        executeDiceRollRequest();
      }
    });
  }
  if (dom.dieCard1) {
    dom.dieCard1.addEventListener('click', () => handleDieCardClick(1));
  }
  if (dom.dieCard2) {
    dom.dieCard2.addEventListener('click', () => handleDieCardClick(2));
  }
  if (dom.diceSkipBtn) {
    dom.diceSkipBtn.addEventListener('click', () => executeDicePassTurn());
  }

  // Live 100ms clock refresh
  if (clockState.intervalId) clearInterval(clockState.intervalId);
  clockState.intervalId = setInterval(tickClocksUIAndAuthority, 100);

  renderAll();
  checkAutoJoinFromUrl();

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && net.mode === 'online') {
        if (net.peer && net.peer.disconnected && !net.peer.destroyed) {
          try { net.peer.reconnect(); } catch (_) {}
        }
        if (!isLogicalConnOpen(net.conn)) {
          if (
            net.role === 'guest' &&
            (gameState.status === 'playing' || gameState.status === 'secret_pick')
          ) {
            attemptGuestReconnect();
          }
        } else {
          sendPacket(net.conn, { type: 'ping', t: Date.now() });
          if (net.role === 'host') {
            broadcastHostState();
          }
        }
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
      if (net.peer && net.peer.disconnected && !net.peer.destroyed) {
        try { net.peer.reconnect(); } catch (_) {}
      }
      if (net.mode === 'online') {
        if (net.role === 'guest' && !isLogicalConnOpen(net.conn)) {
          attemptGuestReconnect();
        }
      }
    });
  }
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
    VARIANT_DEFS,
    getVariantDef,
    PIECE_DEFS,
    INITIAL_BOARD,
    createInitialState,
    getLegalMovesForSquare,
    getDisplayedLegalMovesForSquare,
    getLegalDropMoves,
    getAllLegalMoves,
    getPremoveTargetsForSquare,
    getPremoveDropTargets,
    getProjectedPremoveState,
    applyPremoveStepToState,
    doesPremoveRequirePromotion,
    computeVisibleSquares,
    applyMove,
    tryMakeMove,
    tryMakeDrop,
    isInCheck,
    computeDisplayElo,
    sanitizePlayerName,
    extractCleanGameCode,
    extractCleanPartyCode: extractCleanGameCode,
    validateAndHydrateState,
    serializeAuthoritativeState,
    serializeStateForPeer,
    checkSecretQueenPinInteraction,
    revealSecretQueen,
    assignSecretQueen,
    isStandardPawnMove,
    createCustomState,
    validateCustomPosition,
    goHome,
    editorState,
    DICE_PIECE_MAP,
    PIECE_TO_DIE_MAP,
    createPendingDiceState,
    canCastleWithDice,
    setDiceRoll,
    prepareTurnDice,
    rollDiceForState,
    applyDicePassTurn
  };
}
