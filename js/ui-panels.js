/* Variant Tooltips, Match Setup, Leave Modal, Home Navigation & Custom Board Editor */
'use strict';

function syncMyNameFromInput() {
  if (!dom.nameInput) return;
  net.myName = sanitizePlayerName(dom.nameInput.value);
  setEloElement(dom.eloPreview, net.myName);
  try {
    localStorage.setItem('chess_display_name', dom.nameInput.value.slice(0, 18));
  } catch (_) {}
}

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
  const rawVariant = params.get('variant');

  if (rawVariant && Object.prototype.hasOwnProperty.call(VARIANT_DEFS, rawVariant) && !rawCode) {
    try {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}
    setupConfig.variant = rawVariant;
    setupConfig.customState = null;
    clearBoardTransientUI();
    gameState = createInitialState(rawVariant);
    viewPly = 0;
    syncSetupPanelUI();
    renderAll();
    return;
  }

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

function openLeaveConfirmModal() {
  if (!dom.leaveConfirmBackdrop) return false;
  dom.leaveConfirmBackdrop.classList.remove('hidden');
  if (dom.leaveConfirmStayBtn && typeof dom.leaveConfirmStayBtn.focus === 'function') {
    dom.leaveConfirmStayBtn.focus();
  }
  return true;
}

function closeLeaveConfirmModal() {
  if (dom.leaveConfirmBackdrop) {
    dom.leaveConfirmBackdrop.classList.add('hidden');
  }
}

function confirmLeaveOnlineMatch() {
  closeLeaveConfirmModal();
  if (
    net.mode === 'online' &&
    (gameState.status === 'playing' || gameState.status === 'secret_pick')
  ) {
    sendPacket(net.conn, { type: 'resign' });
  }
  return goHome(true);
}

function goHome(force = false) {
  if (!force && net.mode === 'online' && (gameState.status === 'playing' || gameState.status === 'secret_pick')) {
    if (dom.leaveConfirmBackdrop) {
      openLeaveConfirmModal();
      return false;
    }
    sendPacket(net.conn, { type: 'resign' });
  }
  closeLeaveConfirmModal();

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
    setMobileTab('play');
  }
  setDesktopTab('chat');

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
  setMobileTab('play');
  renderAll();
  scrollElementIntoViewOnMobile(dom.gameEditor);
}

function closeBoardEditor() {
  net.mode = 'local';
  editorState.active = false;
  editorSelectedSq = null;
  editorState.selectedTool = null;
  editorState.validationError = null;
  renderAll();
  scrollBoardIntoViewOnMobile();
}

function syncEditorCastlingValidity() {
  if (!dom.editorCastlingWk) return;
  const board = editorState.board;
  const isSch = editorState.variant === 'schrodinger';
  const isCorner = (r, c, color) =>
    board[r]?.[c] === color + 'r' || (isSch && board[r]?.[c] === color + 'qm');
  const canWk = board[7]?.[4] === 'wk' && isCorner(7, 7, 'w');
  const canWq = board[7]?.[4] === 'wk' && isCorner(7, 0, 'w');
  const canBk = board[0]?.[4] === 'bk' && isCorner(0, 7, 'b');
  const canBq = board[0]?.[4] === 'bk' && isCorner(0, 0, 'b');

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

  if (dom.editorQuantumGroup) {
    dom.editorQuantumGroup.classList.toggle('hidden', editorState.variant !== 'schrodinger');
    if (
      editorState.variant !== 'schrodinger' &&
      (editorState.selectedTool === 'wqm' || editorState.selectedTool === 'bqm')
    ) {
      editorState.selectedTool = null;
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
  scrollBoardIntoViewOnMobile();
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
  setMobileTab('play');
  createGameRoom();
  return true;
}
