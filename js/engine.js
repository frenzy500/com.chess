/* Pure Chess & Variant Engine (Move Gen, Dice, Secret Queen, Fog, SAN & Validation) */
'use strict';

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

function getPromotionTypes(state = null) {
  if (state && getVariantDef(state).schrodinger) {
    return ['qm'];
  }
  const ordered = PROMOTION_ORDER.filter(
    (k) => PIECE_DEFS[k] && PIECE_DEFS[k].canPromoteTo && !PIECE_DEFS[k].isQuantum
  );
  for (const key of Object.keys(PIECE_DEFS)) {
    if (PIECE_DEFS[key].canPromoteTo && !PIECE_DEFS[key].isQuantum && !ordered.includes(key)) {
      ordered.push(key);
    }
  }
  return ordered;
}

function getDropPieceTypes() {
  const ordered = POCKET_PIECE_ORDER.filter(
    (k) => PIECE_DEFS[k] && !PIECE_DEFS[k].isRoyal && !PIECE_DEFS[k].isQuantum
  );
  for (const key of Object.keys(PIECE_DEFS)) {
    if (!PIECE_DEFS[key].isRoyal && !PIECE_DEFS[key].isQuantum && !ordered.includes(key)) {
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
    schrodinger: cloneSchrodingerMeta(state.schrodinger),
    fogVisible,
    fogVis,
    meta: meta ? { ...meta } : null
  };
}

function createInitialState(variant = 'standard', options = {}) {
  const cleanVariant = Object.prototype.hasOwnProperty.call(VARIANT_DEFS, variant)
    ? variant
    : 'standard';
  const startBoard =
    cleanVariant === 'schrodinger' ? cloneBoard(SCHRODINGER_INITIAL_BOARD) : cloneBoard(INITIAL_BOARD);
  const canCornerCastle = (row, col, color) => {
    const piece = startBoard[row]?.[col];
    return piece === color + 'r' || (cleanVariant === 'schrodinger' && piece === color + 'qm');
  };
  const state = {
    variant: cleanVariant,
    board: startBoard,
    turn: 'w',
    castling: {
      wK: startBoard[7][4] === 'wk' && canCornerCastle(7, 7, 'w'),
      wQ: startBoard[7][4] === 'wk' && canCornerCastle(7, 0, 'w'),
      bK: startBoard[0][4] === 'bk' && canCornerCastle(0, 7, 'b'),
      bQ: startBoard[0][4] === 'bk' && canCornerCastle(0, 0, 'b')
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
    dice: null,
    schrodinger:
      cleanVariant === 'schrodinger'
        ? cloneSchrodingerMeta(options.schrodinger) || createInitialSchrodingerMeta()
        : null
  };
  if (cleanVariant === 'dice') {
    prepareTurnDice(state, options.diceValues || null);
  }
  if (cleanVariant === 'schrodinger') {
    resolveSchrodingerState(state);
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
  const defaultBoard =
    cleanVariant === 'schrodinger' ? SCHRODINGER_INITIAL_BOARD : INITIAL_BOARD;
  const customBoard = config.board ? cloneBoard(config.board) : cloneBoard(defaultBoard);
  const turn = config.turn === 'b' ? 'b' : 'w';

  const canCornerCastle = (row, col, color) => {
    const piece = customBoard[row]?.[col];
    return piece === color + 'r' || (cleanVariant === 'schrodinger' && piece === color + 'qm');
  };
  const castlingInput = config.castling || {};
  const castling = {
    wK: Boolean(castlingInput.wK && customBoard[7]?.[4] === 'wk' && canCornerCastle(7, 7, 'w')),
    wQ: Boolean(castlingInput.wQ && customBoard[7]?.[4] === 'wk' && canCornerCastle(7, 0, 'w')),
    bK: Boolean(castlingInput.bK && customBoard[0]?.[4] === 'bk' && canCornerCastle(0, 7, 'b')),
    bQ: Boolean(castlingInput.bQ && customBoard[0]?.[4] === 'bk' && canCornerCastle(0, 0, 'b'))
  };

  const pockets = {
    w: Array.isArray(config.pockets?.w) ? config.pockets.w.slice() : [],
    b: Array.isArray(config.pockets?.b) ? config.pockets.b.slice() : []
  };
  const captured = {
    w: Array.isArray(config.captured?.w) ? config.captured.w.slice() : [],
    b: Array.isArray(config.captured?.b) ? config.captured.b.slice() : []
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
    captured,
    pockets,
    promoted: [],
    positionCounts: {},
    historyFrames: [],
    fogMasked: false,
    fogVisible: null,
    fogLegalMoves: null,
    secretQueens,
    dice: null,
    schrodinger:
      cleanVariant === 'schrodinger'
        ? cloneSchrodingerMeta(config.schrodinger) || createInitialSchrodingerMeta()
        : null
  };

  if (cleanVariant === 'schrodinger') {
    resolveSchrodingerState(state);
  }

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
        if (cleanVariant === 'schrodinger') {
          state.status = 'no_moves';
          state.winner = turn === 'w' ? 'b' : 'w';
        } else if (state.inCheck) {
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
      schrodinger: cloneSchrodingerMeta(f.schrodinger),
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
    dice: cloneDiceState(state.dice),
    schrodinger: cloneSchrodingerMeta(state.schrodinger)
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
  if (vDef.schrodinger && state.schrodinger) {
    const sw = state.schrodinger.w || {};
    const sb = state.schrodinger.b || {};
    const capW = (state.captured?.b || []).slice().sort().join(',');
    const capB = (state.captured?.w || []).slice().sort().join(',');
    extra += ` [SCH:${sw.promoL || 0},${sw.promoD || 0},${sw.capL || 0},${sw.capD || 0}|${sb.promoL || 0},${sb.promoD || 0},${sb.capL || 0},${sb.capD || 0}|${capW}|${capB}]`;
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
  const analysisState = state._schrodingerSourceState || state;
  const isQuantumPiece = Boolean(vDef.schrodinger && isQuantumType(type));
  const schAnalysis =
    vDef.schrodinger && (isQuantumPiece || type === 'k')
      ? computeSchrodingerSideAnalysis(analysisState, color)
      : null;

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

  if (
    def.leapOffsets &&
    (!isQuantumPiece || canSchrodingerPieceMoveAs(analysisState, color, r, c, 'knight', schAnalysis))
  ) {
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
    const canSlideStraight =
      !isQuantumPiece || canSchrodingerPieceMoveAs(analysisState, color, r, c, 'straight', schAnalysis);
    const canSlideDiag =
      !isQuantumPiece || canSchrodingerPieceMoveAs(analysisState, color, r, c, 'diagonal', schAnalysis);
    for (const [dr, dc] of def.slideDirs) {
      if (isQuantumPiece) {
        const isDiag = dr !== 0 && dc !== 0;
        if (isDiag && !canSlideDiag) continue;
        if (!isDiag && !canSlideStraight) continue;
      }
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
      canCastleCorner: vDef.schrodinger
        ? (_st, col, hr, rc) => canCornerCastleInSchrodinger(analysisState, col, hr, rc, schAnalysis)
        : null,
      getPromotionTypes: () => getPromotionTypes(state),
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
  const isCastleCornerPiece = (piece) =>
    piece === color + 'r' || (state.variant === 'schrodinger' && piece === color + 'qm');
  if (isCastleCornerPiece(state.board[homeRow][0]) && !(r === homeRow && c === 0)) {
    soloBoard[homeRow][0] = state.board[homeRow][0];
  }
  if (isCastleCornerPiece(state.board[homeRow][7]) && !(r === homeRow && c === 7)) {
    soloBoard[homeRow][7] = state.board[homeRow][7];
  }

  const soloState = {
    variant: state.variant || 'standard',
    board: soloBoard,
    turn: color,
    castling: state.castling,
    enPassant: null,
    _schrodingerSourceState: state
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
  secretQueens = null,
  schrodinger = null
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
      if (variant !== 'schrodinger' && isQuantumType(getPieceType(code))) {
        return { valid: false, error: 'Quantum pieces can only be used in Schrödinger\'s Chess.' };
      }
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

  if (variant === 'schrodinger') {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const code = board[r][c];
        if (!code) continue;
        const t = getPieceType(code);
        const sqC = getSchrodingerSquareColor(r, c);
        if ((t === 'bl' && sqC !== 'L') || (t === 'bd' && sqC !== 'D')) {
          return { valid: false, error: 'Bishop/Queen piece color does not match its square color.' };
        }
      }
    }
    const probeSch = {
      variant: 'schrodinger',
      board,
      turn,
      captured: { w: [], b: [] },
      schrodinger: cloneSchrodingerMeta(schrodinger) || createInitialSchrodingerMeta()
    };
    if (!isSchrodingerSideFeasible(probeSch, 'w')) {
      return {
        valid: false,
        error: 'White pieces exceed Schrödinger pool limits (1Q, 2R, 1 Light B, 1 Dark B, 2N).'
      };
    }
    if (!isSchrodingerSideFeasible(probeSch, 'b')) {
      return {
        valid: false,
        error: 'Black pieces exceed Schrödinger pool limits (1Q, 2R, 1 Light B, 1 Dark B, 2N).'
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
  const preType = type;
  const moverColor = getPieceColor(movingCode);
  if (
    type === 'p' &&
    nextState.secretQueens?.[moverColor]?.revealed &&
    !prevState.secretQueens?.[moverColor]?.revealed
  ) {
    type = 'q';
  } else if (vDef.schrodinger && isQuantumType(type)) {
    const destCode = nextState.board[move.to.r]?.[move.to.c];
    if (destCode) type = getPieceType(destCode);
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

    const targetCode = moverColor + (vDef.schrodinger ? preType : type);
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

        if (vDef.schrodinger && next.schrodinger && capturedType === 'b') {
          if (!next.schrodinger[capColor]) {
            next.schrodinger[capColor] = createInitialSchrodingerSideMeta();
          }
          const capSqColor = getSchrodingerSquareColor(move.captureSq.r, move.captureSq.c);
          if (capSqColor === 'L') next.schrodinger[capColor].capL += 1;
          else next.schrodinger[capColor].capD += 1;
        }

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

    if (vDef.schrodinger) {
      if (!next.schrodinger) next.schrodinger = createInitialSchrodingerMeta();
      if (!next.schrodinger[pieceColor]) {
        next.schrodinger[pieceColor] = createInitialSchrodingerSideMeta();
      }
      if (move.rookMove) {
        const destRook = next.board[move.rookMove.to.r]?.[move.rookMove.to.c];
        if (destRook === pieceColor + 'qm') {
          next.board[move.rookMove.to.r][move.rookMove.to.c] = pieceColor + 'r';
        }
      }
      if (move.promotion) {
        const promoSqColor = getSchrodingerSquareColor(move.to.r, move.to.c);
        if (promoSqColor === 'L') next.schrodinger[pieceColor].promoL += 1;
        else next.schrodinger[pieceColor].promoD += 1;
      } else if (isQuantumType(moverType)) {
        next.board[move.to.r][move.to.c] = applySchrodingerMoveTransition(
          next,
          pieceColor,
          movingCode,
          move
        );
      }
      resolveSchrodingerState(next);
    }

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
        if (vDef.schrodinger) {
          next.status = 'no_moves';
          next.winner = turnColor;
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
    const validPromos = getPromotionTypes(state);
    const wantedPromo =
      promotion && validPromos.includes(promotion)
        ? promotion
        : validPromos.length === 1
          ? validPromos[0]
          : null;
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
