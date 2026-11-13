// ============================================================================
// schrodinger.js - Schrödinger's Chess quantum pool solver & state transitions
// ============================================================================

const SCHRODINGER_BASE_SLOTS = ['q', 'r', 'r', 'bL', 'bD', 'n', 'n'];
const SCHRODINGER_SLOT_ROLES = {
  q: ['q'],
  r: ['r'],
  bL: ['bL'],
  bD: ['bD'],
  n: ['n'],
  promoL: ['q', 'r', 'bL', 'n'],
  promoD: ['q', 'r', 'bD', 'n']
};
const SCHRODINGER_ROLE_LIST = ['q', 'r', 'bL', 'bD', 'n'];

const schrodingerAnalysisCache = new Map();

function createInitialSchrodingerSideMeta() {
  return { promoL: 0, promoD: 0, capL: 0, capD: 0 };
}

function createInitialSchrodingerMeta() {
  return {
    w: createInitialSchrodingerSideMeta(),
    b: createInitialSchrodingerSideMeta()
  };
}

function cloneSchrodingerMeta(meta) {
  if (!meta) return null;
  const copySide = (s) => ({
    promoL: Number(s?.promoL) || 0,
    promoD: Number(s?.promoD) || 0,
    capL: Number(s?.capL) || 0,
    capD: Number(s?.capD) || 0
  });
  return {
    w: copySide(meta.w),
    b: copySide(meta.b)
  };
}

function isQuantumType(type) {
  return type === 'qm' || type === 'rq' || type === 'bl' || type === 'bd';
}

function getSchrodingerSquareColor(r, c) {
  return (r + c) % 2 === 0 ? 'L' : 'D';
}

/**
 * Collects all pool-consuming pieces for `color` (board + graveyard) and builds
 * the bipartite pool slots (base 7 + promotions) plus a canonical cache key.
 */
function collectSchrodingerSideData(state, color) {
  const enemy = color === 'w' ? 'b' : 'w';
  const sideMeta = (state.schrodinger && state.schrodinger[color]) || createInitialSchrodingerSideMeta();
  const items = [];
  const counts = {
    board: { q: 0, r: 0, bL: 0, bD: 0, n: 0, rq: 0, bl: 0, bd: 0, qmL: 0, qmD: 0 },
    captured: { q: 0, r: 0, bL: 0, bD: 0, n: 0, rq: 0, bl: 0, bd: 0, qm: 0 }
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const code = state.board[r][c];
      if (!code || code[0] !== color) continue;
      const type = code.slice(1);
      if (type === 'k' || type === 'p') continue;
      const sqColor = getSchrodingerSquareColor(r, c);

      if (type === 'q' || type === 'r' || type === 'n') {
        counts.board[type] += 1;
        items.push({ kind: type, allowed: [type], source: 'board', r, c, type });
      } else if (type === 'b') {
        const bRole = sqColor === 'L' ? 'bL' : 'bD';
        counts.board[bRole] += 1;
        items.push({ kind: bRole, allowed: [bRole], source: 'board', r, c, type });
      } else if (type === 'rq') {
        counts.board.rq += 1;
        items.push({ kind: 'rq', allowed: ['r', 'q'], source: 'board', r, c, type });
      } else if (type === 'bl') {
        counts.board.bl += 1;
        items.push({ kind: 'bl', allowed: ['bL', 'q'], source: 'board', r, c, type });
      } else if (type === 'bd') {
        counts.board.bd += 1;
        items.push({ kind: 'bd', allowed: ['bD', 'q'], source: 'board', r, c, type });
      } else if (type === 'qm') {
        if (sqColor === 'L') {
          counts.board.qmL += 1;
          items.push({ kind: 'qmL', allowed: ['q', 'r', 'bL', 'n'], source: 'board', r, c, type });
        } else {
          counts.board.qmD += 1;
          items.push({ kind: 'qmD', allowed: ['q', 'r', 'bD', 'n'], source: 'board', r, c, type });
        }
      }
    }
  }

  // state.captured[enemy] stores pieces of `color` captured by `enemy`.
  const capList = (state.captured && state.captured[enemy]) || [];
  let capConcreteB = 0;
  let capQm = 0;
  for (let idx = 0; idx < capList.length; idx++) {
    const type = capList[idx];
    if (!type || type === 'p' || type === 'k') continue;
    if (type === 'q' || type === 'r' || type === 'n') {
      counts.captured[type] += 1;
      items.push({ kind: type, allowed: [type], source: 'captured', capIndex: idx, type });
    } else if (type === 'b') {
      capConcreteB += 1;
    } else if (type === 'rq') {
      counts.captured.rq += 1;
      items.push({ kind: 'rq', allowed: ['r', 'q'], source: 'captured', capIndex: idx, type });
    } else if (type === 'bl') {
      counts.captured.bl += 1;
      items.push({ kind: 'bl', allowed: ['bL', 'q'], source: 'captured', capIndex: idx, type });
    } else if (type === 'bd') {
      counts.captured.bd += 1;
      items.push({ kind: 'bd', allowed: ['bD', 'q'], source: 'captured', capIndex: idx, type });
    } else if (type === 'qm') {
      capQm += 1;
    }
  }

  // Reconcile captured concrete bishops using recorded L/D parity counters.
  let capL = Math.max(0, Math.min(capConcreteB, Number(sideMeta.capL) || 0));
  let capD = Math.max(0, Math.min(capConcreteB - capL, Number(sideMeta.capD) || 0));
  const unaccountedCapB = capConcreteB - capL - capD;
  for (let i = 0; i < capL; i++) {
    counts.captured.bL += 1;
    items.push({ kind: 'bL', allowed: ['bL'], source: 'captured', type: 'b' });
  }
  for (let i = 0; i < capD; i++) {
    counts.captured.bD += 1;
    items.push({ kind: 'bD', allowed: ['bD'], source: 'captured', type: 'b' });
  }
  for (let i = 0; i < unaccountedCapB; i++) {
    items.push({ kind: 'bAny', allowed: ['bL', 'bD'], source: 'captured', type: 'b' });
  }
  for (let i = 0; i < capQm; i++) {
    counts.captured.qm += 1;
    items.push({
      kind: 'capQm',
      allowed: ['q', 'r', 'bL', 'bD', 'n'],
      source: 'captured',
      type: 'qm'
    });
  }

  const promoL = Math.max(0, Number(sideMeta.promoL) || 0);
  const promoD = Math.max(0, Number(sideMeta.promoD) || 0);
  const slots = [];
  for (const s of SCHRODINGER_BASE_SLOTS) {
    slots.push({ slotKind: s, allowed: SCHRODINGER_SLOT_ROLES[s] });
  }
  for (let i = 0; i < promoL; i++) {
    slots.push({ slotKind: 'promoL', allowed: SCHRODINGER_SLOT_ROLES.promoL });
  }
  for (let i = 0; i < promoD; i++) {
    slots.push({ slotKind: 'promoD', allowed: SCHRODINGER_SLOT_ROLES.promoD });
  }

  const keyParts = [
    promoL, promoD, capL, capD, unaccountedCapB,
    counts.board.q, counts.board.r, counts.board.bL, counts.board.bD, counts.board.n,
    counts.board.rq, counts.board.bl, counts.board.bd, counts.board.qmL, counts.board.qmD,
    counts.captured.q, counts.captured.r, counts.captured.n,
    counts.captured.rq, counts.captured.bl, counts.captured.bd, counts.captured.qm
  ];

  return {
    items,
    slots,
    counts,
    promoL,
    promoD,
    cacheKey: keyParts.join(',')
  };
}

/**
 * Standard Kuhn's maximum bipartite matching with optional skipped item/slot.
 * Returns { size, matchLeft, matchRight }.
 */
function runBipartiteMatching(adjLists, numRight, skipLeft = -1, skipRight = -1) {
  const numLeft = adjLists.length;
  const matchRight = new Int16Array(numRight);
  matchRight.fill(-1);
  const matchLeft = new Int16Array(numLeft);
  matchLeft.fill(-1);
  const seenRight = new Uint8Array(numRight);

  function dfs(u) {
    const edges = adjLists[u];
    for (let i = 0; i < edges.length; i++) {
      const v = edges[i];
      if (v === skipRight || seenRight[v]) continue;
      seenRight[v] = 1;
      if (matchRight[v] === -1 || dfs(matchRight[v])) {
        matchRight[v] = u;
        matchLeft[u] = v;
        return true;
      }
    }
    return false;
  }

  let size = 0;
  for (let u = 0; u < numLeft; u++) {
    if (u === skipLeft) continue;
    seenRight.fill(0);
    if (dfs(u)) size++;
  }
  return { size, matchLeft, matchRight };
}

function buildItemRoleGraph(items, slots) {
  const roleBit = { q: 1, r: 2, bL: 4, bD: 8, n: 16 };
  const itemMasks = new Uint8Array(items.length);
  const slotMasks = new Uint8Array(slots.length);

  for (let i = 0; i < items.length; i++) {
    let m = 0;
    for (const r of items[i].allowed) m |= roleBit[r];
    itemMasks[i] = m;
  }
  for (let j = 0; j < slots.length; j++) {
    let m = 0;
    for (const r of slots[j].allowed) m |= roleBit[r];
    slotMasks[j] = m;
  }

  const adj = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const edges = [];
    for (let j = 0; j < slots.length; j++) {
      if ((itemMasks[i] & slotMasks[j]) !== 0) {
        edges.push(j);
      }
    }
    adj[i] = edges;
  }
  return { adj, itemMasks, slotMasks, roleBit };
}

/**
 * Computes exact legal roles for every piece-kind present and pool statistics
 * for `color`. Cached by canonical item+slot multiset string.
 */
function computeSchrodingerSideAnalysis(state, color) {
  const data = collectSchrodingerSideData(state, color);
  const cached = schrodingerAnalysisCache.get(data.cacheKey);
  if (cached) {
    return {
      ...cached,
      items: data.items,
      counts: data.counts
    };
  }

  const { items, slots, counts, promoL, promoD } = data;
  const { adj, roleBit } = buildItemRoleGraph(items, slots);
  const baseMatch = runBipartiteMatching(adj, slots.length);
  const feasible = baseMatch.size === items.length && items.length <= slots.length;

  // Group items by item.kind because items of identical kind behave symmetrically.
  const validRolesByKind = {};
  if (feasible) {
    const repIndexByKind = {};
    for (let i = 0; i < items.length; i++) {
      const k = items[i].kind;
      if (repIndexByKind[k] === undefined) repIndexByKind[k] = i;
    }

    for (const [kind, itemIdx] of Object.entries(repIndexByKind)) {
      const item = items[itemIdx];
      const allowedSet = [];
      const pairedSlotIdx = baseMatch.matchLeft[itemIdx];
      const pairedSlot = pairedSlotIdx >= 0 ? slots[pairedSlotIdx] : null;

      for (const role of item.allowed) {
        // Quick accept if base matching already pairs itemIdx with a slot allowing `role`.
        if (pairedSlot && pairedSlot.allowed.includes(role)) {
          allowedSet.push(role);
          continue;
        }
        // Test pinning itemIdx to one representative slot of each distinct slotKind allowing `role`.
        const testedSlotKinds = new Set();
        let ok = false;
        for (let s = 0; s < slots.length; s++) {
          const slot = slots[s];
          if (!slot.allowed.includes(role)) continue;
          if (testedSlotKinds.has(slot.slotKind)) continue;
          testedSlotKinds.add(slot.slotKind);
          const sub = runBipartiteMatching(adj, slots.length, itemIdx, s);
          if (sub.size === items.length - 1) {
            ok = true;
            break;
          }
        }
        if (ok) allowedSet.push(role);
      }
      validRolesByKind[kind] = allowedSet;
    }
  }

  // Also check which roles ANY newly-evaluated `qm` (on board or hypothetical) can still claim
  // given non-qm items currently on board + graveyard.
  const canBoardQmTake = { q: false, r: false, bL: false, bD: false, n: false };
  for (const kind of ['qmL', 'qmD']) {
    const roles = validRolesByKind[kind] || [];
    for (const role of roles) canBoardQmTake[role] = true;
  }

  // Check if all Q-capable slots are saturated even by non-qm pieces alone (e.g. 3 R/Q or 2 same-color B/Q).
  const concreteUsed = {
    q: counts.board.q + counts.captured.q,
    r: counts.board.r + counts.captured.r,
    bL: counts.board.bL + counts.captured.bL,
    bD: counts.board.bD + counts.captured.bD,
    n: counts.board.n + counts.captured.n
  };

  // Determine whether a role is guaranteed forced claimed across all matchings (for HUD).
  const claimedInSuperpos = { q: false, r: false, bL: false, bD: false, n: false };
  if (feasible && (counts.board.qmL + counts.board.qmD > 0)) {
    for (const role of SCHRODINGER_ROLE_LIST) {
      if (!canBoardQmTake[role]) claimedInSuperpos[role] = true;
    }
  } else if (feasible) {
    // No board qm left: check whether appending one hypothetical qm of that role is impossible.
    const nonCapQmItems = items;
    for (const role of SCHRODINGER_ROLE_LIST) {
      const testItems = [...nonCapQmItems, { kind: '_probe', allowed: [role] }];
      const { adj: testAdj } = buildItemRoleGraph(testItems, slots);
      const testRes = runBipartiteMatching(testAdj, slots.length);
      if (testRes.size < testItems.length) {
        claimedInSuperpos[role] = true;
      }
    }
  }

  const baseResult = {
    feasible,
    validRolesByKind,
    canBoardQmTake,
    claimedInSuperpos,
    concreteUsed,
    promoL,
    promoD,
    totalBaseUsedOrPromoted: items.length,
    totalPoolSlots: slots.length
  };

  if (schrodingerAnalysisCache.size > 1024) {
    schrodingerAnalysisCache.clear();
  }
  schrodingerAnalysisCache.set(data.cacheKey, baseResult);

  return {
    ...baseResult,
    items,
    counts
  };
}

/**
 * Returns the legal role tags for a specific board square `(r, c)`.
 */
function getValidRolesAtSquare(analysis, code, r, c) {
  if (!analysis || !analysis.feasible || !code) return [];
  const type = code.slice(1);
  if (type === 'q' || type === 'r' || type === 'n') return [type];
  if (type === 'b') return [getSchrodingerSquareColor(r, c) === 'L' ? 'bL' : 'bD'];
  if (type === 'rq' || type === 'bl' || type === 'bd') {
    return analysis.validRolesByKind[type] || [];
  }
  if (type === 'qm') {
    const kind = getSchrodingerSquareColor(r, c) === 'L' ? 'qmL' : 'qmD';
    return analysis.validRolesByKind[kind] || [];
  }
  return [];
}

/**
 * Checks whether a Schrödinger piece at `(r, c)` may legally perform a move
 * of category `'knight' | 'straight' | 'diagonal'`.
 */
function canSchrodingerPieceMoveAs(state, color, r, c, category, precomputedAnalysis = null) {
  const code = state.board[r] && state.board[r][c];
  if (!code || code[0] !== color) return false;
  const type = code.slice(1);
  const analysis = precomputedAnalysis || computeSchrodingerSideAnalysis(state, color);
  if (!analysis.feasible) return false;

  const roles = getValidRolesAtSquare(analysis, code, r, c);
  if (roles.length === 0) return false;

  if (type === 'qm') {
    if (category === 'knight') return roles.includes('n');
    if (category === 'straight') return roles.includes('r') || roles.includes('q');
    if (category === 'diagonal') {
      const bRole = getSchrodingerSquareColor(r, c) === 'L' ? 'bL' : 'bD';
      return roles.includes(bRole) || roles.includes('q');
    }
    return false;
  }

  if (type === 'rq') {
    if (category === 'straight') return roles.includes('r') || roles.includes('q');
    if (category === 'diagonal') return roles.includes('q');
    return false;
  }

  if (type === 'bl' || type === 'bd') {
    const bRole = type === 'bl' ? 'bL' : 'bD';
    if (category === 'diagonal') return roles.includes(bRole) || roles.includes('q');
    if (category === 'straight') return roles.includes('q');
    return false;
  }

  return false;
}

/**
 * Castling corner check in Schrödinger's Chess:
 * Allows corner rook (`color + 'r'`) or unmoved corner `?` (`color + 'qm'`)
 * if `'r'` is a valid role for that corner piece.
 */
function canCornerCastleInSchrodinger(state, color, homeRow, rookCol, precomputedAnalysis = null) {
  const code = state.board[homeRow] && state.board[homeRow][rookCol];
  if (!code || code[0] !== color) return false;
  const type = code.slice(1);
  if (type === 'r') return true;
  if (type !== 'qm') return false;
  const analysis = precomputedAnalysis || computeSchrodingerSideAnalysis(state, color);
  const roles = getValidRolesAtSquare(analysis, code, homeRow, rookCol);
  return roles.includes('r');
}

function schrodingerRoleToPieceType(role) {
  if (role === 'bL' || role === 'bD') return 'b';
  return role;
}

/**
 * Collapses any quantum pieces (board `qm`/`rq`/`bl`/`bd` and captured `rq`/`bl`/`bd`)
 * for `color` whose only valid pool role has narrowed to a single concrete piece type.
 */
function resolveSchrodingerSide(state, color) {
  if (!state.schrodinger) state.schrodinger = createInitialSchrodingerMeta();
  const analysis = computeSchrodingerSideAnalysis(state, color);
  if (!analysis.feasible) return analysis;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const code = state.board[r][c];
      if (!code || code[0] !== color) continue;
      const type = code.slice(1);
      if (!isQuantumType(type)) continue;

      const roles = getValidRolesAtSquare(analysis, code, r, c);
      if (roles.length === 1) {
        state.board[r][c] = color + schrodingerRoleToPieceType(roles[0]);
      }
    }
  }

  const enemy = color === 'w' ? 'b' : 'w';
  const capList = state.captured && state.captured[enemy];
  if (Array.isArray(capList) && capList.length > 0) {
    for (let idx = 0; idx < capList.length; idx++) {
      const type = capList[idx];
      if (type !== 'rq' && type !== 'bl' && type !== 'bd') continue;
      const roles = analysis.validRolesByKind[type] || [];
      if (roles.length === 1) {
        const collapsed = schrodingerRoleToPieceType(roles[0]);
        capList[idx] = collapsed;
        if (collapsed === 'b') {
          if (type === 'bl') state.schrodinger[color].capL += 1;
          else if (type === 'bd') state.schrodinger[color].capD += 1;
        }
      }
    }
  }

  return computeSchrodingerSideAnalysis(state, color);
}

function resolveSchrodingerState(state) {
  if (!state || state.variant !== 'schrodinger') return;
  if (!state.schrodinger) state.schrodinger = createInitialSchrodingerMeta();
  resolveSchrodingerSide(state, 'w');
  resolveSchrodingerSide(state, 'b');
}

function isSchrodingerSideFeasible(state, color) {
  return computeSchrodingerSideAnalysis(state, color).feasible;
}

/**
 * Applies quantum piece state transformation when `pieceType` moves from
 * `(from.r, from.c)` to `(to.r, to.c)` (before `resolveSchrodingerState`).
 */
function applySchrodingerMoveTransition(state, color, preMoveCode, move) {
  if (!preMoveCode) return preMoveCode;
  const type = preMoveCode.slice(1);
  if (!isQuantumType(type)) return preMoveCode;

  const dr = Math.abs(move.to.r - move.from.r);
  const dc = Math.abs(move.to.c - move.from.c);
  const isKnight = (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
  const isStraight = (dr === 0 || dc === 0) && (dr + dc > 0);
  const isDiag = dr === dc && dr > 0;

  if (type === 'qm') {
    if (isKnight) return color + 'n';
    if (isStraight) return color + 'rq';
    if (isDiag) {
      return color + (getSchrodingerSquareColor(move.from.r, move.from.c) === 'L' ? 'bl' : 'bd');
    }
    return preMoveCode;
  }

  if (type === 'rq') {
    return isDiag ? color + 'q' : preMoveCode;
  }

  if (type === 'bl' || type === 'bd') {
    return isStraight ? color + 'q' : preMoveCode;
  }

  return preMoveCode;
}

/**
 * Returns user-friendly move/identity hint metadata for a square in Schrödinger's Chess.
 */
function getSchrodingerHintForSquare(state, r, c) {
  if (!state || state.variant !== 'schrodinger') return null;
  const code = state.board[r] && state.board[r][c];
  if (!code) return null;
  const color = code[0];
  const type = code.slice(1);
  if (!isQuantumType(type)) return null;

  const analysis = computeSchrodingerSideAnalysis(state, color);
  const roles = getValidRolesAtSquare(analysis, code, r, c);
  const canKnight = type === 'qm' && roles.includes('n');
  const canStraight =
    type === 'qm'
      ? roles.includes('r') || roles.includes('q')
      : type === 'rq'
        ? roles.includes('r') || roles.includes('q')
        : roles.includes('q');
  const sqB = getSchrodingerSquareColor(r, c) === 'L' ? 'bL' : 'bD';
  const canDiag =
    type === 'qm'
      ? roles.includes(sqB) || roles.includes('q')
      : type === 'rq'
        ? roles.includes('q')
        : roles.includes(type === 'bl' ? 'bL' : 'bD') || roles.includes('q');

  return {
    color,
    type,
    roles,
    canKnight,
    canStraight,
    canDiag
  };
}
