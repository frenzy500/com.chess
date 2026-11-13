// ============================================================================
// ui-schrodinger.js - Schrödinger's Chess live shared Quantum Pool HUD & hints
// ============================================================================
'use strict';

function buildSchrodingerSlotChip(color, roleKey, pieceCode, badgeText, statusClass, titleText) {
  const chip = document.createElement('div');
  chip.className = `sch-slot-chip ${statusClass}`;
  chip.title = titleText;

  const img = document.createElement('img');
  img.src = getPieceSvgDataUri(pieceCode);
  img.alt = titleText;
  img.draggable = false;
  chip.appendChild(img);

  if (badgeText) {
    const badge = document.createElement('span');
    badge.className = `sch-slot-pip sch-pip-${roleKey}`;
    badge.textContent = badgeText;
    chip.appendChild(badge);
  }

  return chip;
}

function renderSchrodingerSideCard(displayState, sideColor, isBottomSide) {
  const analysis = computeSchrodingerSideAnalysis(displayState, sideColor);
  const vDef = getVariantDef(displayState);
  const activeTurn =
    vDef.schrodinger &&
    gameState.status === 'playing' &&
    displayState.turn === sideColor &&
    isViewingLive() &&
    net.mode !== 'setup' &&
    !editorState.active;

  const card = document.createElement('div');
  card.className =
    'sch-side-card' +
    (activeTurn ? ' active-turn' : '') +
    (isBottomSide ? ' is-bottom' : ' is-top');

  const head = document.createElement('div');
  head.className = 'sch-side-head';

  const labelWrap = document.createElement('div');
  labelWrap.className = 'sch-side-label-wrap';

  const swatch = document.createElement('span');
  swatch.className = `sch-swatch ${sideColor === 'w' ? 'white' : 'black'}`;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'sch-side-name';
  if (net.mode === 'online') {
    nameSpan.textContent = sideColor === net.myColor ? 'Your Pool' : `${net.peerName || 'Opponent'}'s Pool`;
  } else {
    nameSpan.textContent = sideColor === 'w' ? 'White Pool' : 'Black Pool';
  }

  labelWrap.append(swatch, nameSpan);
  head.appendChild(labelWrap);

  const openLeftCount =
    (analysis.counts.board.qmL || 0) +
    (analysis.counts.board.qmD || 0) +
    (analysis.counts.board.rq || 0) +
    (analysis.counts.board.bl || 0) +
    (analysis.counts.board.bd || 0);
  const badge = document.createElement('span');
  badge.className = 'sch-unresolved-count';
  badge.textContent = `${openLeftCount} open`;
  badge.title = 'Unresolved quantum pieces on the board';
  head.appendChild(badge);

  card.appendChild(head);

  // Build slot chips for base 7 slots: Q, R, R, B(L), B(D), N, N + any +Promo slots
  const slotsGrid = document.createElement('div');
  slotsGrid.className = 'sch-slots-grid';

  const boardUsed = analysis.counts.board;
  const capUsed = analysis.counts.captured;

  const baseSpecs = [
    { role: 'q', count: 1, piece: 'q', badge: '', name: 'Queen' },
    { role: 'r', count: 2, piece: 'r', badge: '', name: 'Rook' },
    { role: 'bL', count: 1, piece: 'b', badge: 'L', name: 'Light-Square Bishop' },
    { role: 'bD', count: 1, piece: 'b', badge: 'D', name: 'Dark-Square Bishop' },
    { role: 'n', count: 2, piece: 'n', badge: '', name: 'Knight' }
  ];

  // Track overflow concrete pieces absorbed by promotions so Promo badges show when consumed
  let concreteOverflow = 0;

  for (const spec of baseSpecs) {
    const alive = boardUsed[spec.role] || 0;
    const captured = capUsed[spec.role] || 0;
    const usedTotal = alive + captured;
    const isClaimedSuper = Boolean(analysis.claimedInSuperpos[spec.role]);

    for (let i = 0; i < spec.count; i++) {
      let stateClass = 'slot-open';
      let tip = `${spec.name}: available in pool`;
      if (i < alive) {
        stateClass = 'slot-board';
        tip = `${spec.name}: defined on board`;
      } else if (i < usedTotal) {
        stateClass = 'slot-captured';
        tip = `${spec.name}: captured (slot used)`;
      } else if (isClaimedSuper) {
        stateClass = 'slot-claimed';
        tip = `${spec.name}: claimed in superposition`;
      }
      slotsGrid.appendChild(
        buildSchrodingerSlotChip(sideColor, spec.role, sideColor + spec.piece, spec.badge, stateClass, tip)
      );
    }
    if (usedTotal > spec.count) {
      concreteOverflow += usedTotal - spec.count;
    }
  }

  // Render +Promo slots if pawns promoted
  const totalPromos = (analysis.promoL || 0) + (analysis.promoD || 0);
  if (totalPromos > 0) {
    let promoRenderedUsed = 0;
    for (let i = 0; i < analysis.promoL; i++) {
      const isUsed = promoRenderedUsed < concreteOverflow;
      if (isUsed) promoRenderedUsed++;
      slotsGrid.appendChild(
        buildSchrodingerSlotChip(
          sideColor,
          'promoL',
          sideColor + 'qm',
          '+L',
          isUsed ? 'slot-promo slot-board' : 'slot-promo slot-open',
          'Promoted Light-Square slot (Q, R, Light B, or N)'
        )
      );
    }
    for (let i = 0; i < analysis.promoD; i++) {
      const isUsed = promoRenderedUsed < concreteOverflow;
      if (isUsed) promoRenderedUsed++;
      slotsGrid.appendChild(
        buildSchrodingerSlotChip(
          sideColor,
          'promoD',
          sideColor + 'qm',
          '+D',
          isUsed ? 'slot-promo slot-board' : 'slot-promo slot-open',
          'Promoted Dark-Square slot (Q, R, Dark B, or N)'
        )
      );
    }
  }

  card.appendChild(slotsGrid);

  // Superposition summary pills (R/Q, B/Q, captured ?)
  const pillsRow = document.createElement('div');
  pillsRow.className = 'sch-meta-pills';

  const rqTotal = (boardUsed.rq || 0) + (capUsed.rq || 0);
  const blTotal = (boardUsed.bl || 0) + (capUsed.bl || 0);
  const bdTotal = (boardUsed.bd || 0) + (capUsed.bd || 0);
  const capQm = capUsed.qm || 0;

  const addMetaPill = (text, title) => {
    const pill = document.createElement('span');
    pill.className = 'sch-meta-pill';
    pill.textContent = text;
    pill.title = title;
    pillsRow.appendChild(pill);
  };

  if (rqTotal > 0) addMetaPill(`${rqTotal}x R/Q`, 'Pieces that could be Rook or Queen');
  if (blTotal > 0) addMetaPill(`${blTotal}x B/Q(L)`, 'Light-square Bishop or Queen');
  if (bdTotal > 0) addMetaPill(`${bdTotal}x B/Q(D)`, 'Dark-square Bishop or Queen');
  if (capQm > 0) addMetaPill(`${capQm}x ? cap`, 'Captured unmoved ? (frees 1 unspecified slot)');

  if (pillsRow.childNodes.length > 0) {
    card.appendChild(pillsRow);
  }

  return card;
}

function getDisplaySchrodingerState() {
  const frame = typeof getDisplayedFrame === 'function' ? getDisplayedFrame() : null;
  if (!frame || isViewingLive()) return gameState;
  return {
    ...gameState,
    board: frame.board,
    turn: frame.turn,
    captured: frame.captured || { w: [], b: [] },
    schrodinger: frame.schrodinger || gameState.schrodinger
  };
}

function updateSchrodingerHint() {
  if (!dom.schrodingerHint) return;
  const vDef = getVariantDef(gameState);
  if (!vDef.schrodinger || editorState.active || net.mode === 'setup') return;

  const activeSq = selectedSq || premoveOriginSq;
  if (isViewingLive() && activeSq) {
    const hint = getSchrodingerHintForSquare(gameState, activeSq.r, activeSq.c);
    if (hint) {
      const alg = coordToAlgebraic(activeSq.r, activeSq.c);
      const opts = [];
      if (hint.canKnight) opts.push('L-shape = N');
      if (hint.canStraight) {
        opts.push(hint.type === 'bl' || hint.type === 'bd' ? 'Straight = Queen' : 'Straight = R/Q');
      }
      if (hint.canDiag) {
        if (hint.type === 'rq') opts.push('Diag = Queen');
        else opts.push(`Diag = ${getSchrodingerSquareColor(activeSq.r, activeSq.c) === 'L' ? 'Light' : 'Dark'} B/Q`);
      }
      const prefix =
        hint.type === 'qm' ? `? on ${alg}` : hint.type === 'rq' ? `R/Q on ${alg}` : `B/Q on ${alg}`;
      dom.schrodingerHint.textContent =
        opts.length > 0 ? `${prefix}: ${opts.join(' • ')}` : `${prefix}: no legal pool moves`;
      dom.schrodingerHint.classList.add('has-selection');
      return;
    }
  }

  dom.schrodingerHint.classList.remove('has-selection');
  if (gameState.status !== 'playing') {
    dom.schrodingerHint.textContent = 'Game over — use < / > to inspect each wave collapse.';
  } else {
    const turnName = gameState.turn === 'w' ? 'White' : 'Black';
    dom.schrodingerHint.textContent =
      `${turnName} to move • Click any ? to see legal collapse options.`;
  }
}

function renderSchrodingerBar() {
  if (typeof document !== 'undefined' && document.body) {
    const vDef = getVariantDef(gameState);
    const activeSchrodingerMode = Boolean(
      vDef.schrodinger && net.mode !== 'setup' && !editorState.active
    );
    document.body.classList.toggle('schrodinger-mode', activeSchrodingerMode);
  }
  if (!dom.schrodingerBar || !dom.schrodingerSides) return;

  const vDef = getVariantDef(gameState);
  if (!vDef.schrodinger || net.mode === 'setup' || editorState.active) {
    dom.schrodingerBar.classList.add('hidden');
    return;
  }

  dom.schrodingerBar.classList.remove('hidden');
  const displayState = getDisplaySchrodingerState();
  const bottomColor = boardFlipped ? 'b' : 'w';
  const topColor = bottomColor === 'w' ? 'b' : 'w';

  dom.schrodingerSides.replaceChildren(
    renderSchrodingerSideCard(displayState, topColor, false),
    renderSchrodingerSideCard(displayState, bottomColor, true)
  );
  updateSchrodingerHint();
}
