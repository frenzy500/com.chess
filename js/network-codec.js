/* Packet Sanitizers, Fog-of-War State Masking, Hydration & Variant Invite URL Helpers */
'use strict';

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

function getInviteVariantSlug() {
  const v =
    net.mode === 'setup' || net.mode === 'waiting'
      ? setupConfig?.variant || gameState?.variant || 'standard'
      : gameState?.variant || setupConfig?.variant || 'standard';
  return Object.prototype.hasOwnProperty.call(VARIANT_DEFS, v) ? v : 'standard';
}

function buildInviteUrl(code) {
  const url = new URL(window.location.href);
  const slug = getInviteVariantSlug();
  let basePath = url.pathname || '/';
  if (/\/invite\/[^/]*\.html$/i.test(basePath)) {
    basePath = basePath.replace(/\/invite\/[^/]*\.html$/i, '/');
  } else if (/\/index\.html$/i.test(basePath)) {
    basePath = basePath.slice(0, -'index.html'.length);
  } else if (!basePath.endsWith('/')) {
    const lastSlash = basePath.lastIndexOf('/');
    basePath = lastSlash >= 0 ? basePath.slice(0, lastSlash + 1) : '/';
  }
  url.pathname = `${basePath}invite/${slug}.html`;
  url.search = '';
  url.hash = '';
  url.searchParams.set('game', code);
  return url.toString();
}
