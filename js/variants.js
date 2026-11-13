/* Variant Rules & Custom Piece Definitions */
'use strict';

/* ============================================================================
 * VARIANT & PIECE DEFINITIONS (Edit here for Custom Variants!)
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
