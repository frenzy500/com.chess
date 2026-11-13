/* Board, Clocks, Pockets, Status Controls, Move History Replay & PGN Rendering */
'use strict';

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
  if (typeof updateSchrodingerHint === 'function') updateSchrodingerHint();
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
    } else if (gameState.status === 'no_moves') {
      statusText = `No legal moves — ${winLabel} wins!`;
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
  if (dom.mobWaitingActions) dom.mobWaitingActions.classList.toggle('hidden', net.mode !== 'waiting');
  if (dom.mobJoiningActions) dom.mobJoiningActions.classList.toggle('hidden', net.mode !== 'joining');
  if (dom.mobSetupActions) {
    dom.mobSetupActions.classList.toggle('hidden', net.mode !== 'setup' && net.mode !== 'editor');
  }
  if (dom.mobSetupBackBtn) {
    dom.mobSetupBackBtn.textContent = net.mode === 'editor' ? 'Exit Editor' : 'Back';
  }
  if (dom.mobShareLinkBtn) dom.mobShareLinkBtn.classList.toggle('hidden', !canNativeShare);
  if (dom.mobCopyLinkBtn) {
    dom.mobCopyLinkBtn.textContent = canNativeShare ? 'Copy' : 'Copy Link';
  }
  if (dom.mobOnlineActions) dom.mobOnlineActions.classList.toggle('hidden', net.mode !== 'online');
  if (dom.mobPlayFriendBtn) {
    dom.mobPlayFriendBtn.disabled = net.mode === 'joining';
    dom.mobPlayFriendBtn.textContent = 'Play Friend';
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

  renderChatUI();
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

function renderAll() {
  if (typeof document === 'undefined') return;
  renderBoard();
  renderDiceBar();
  if (typeof renderSchrodingerBar === 'function') renderSchrodingerBar();
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
