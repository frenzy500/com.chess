/* DOM Element Caching, Global Event Wiring, Bootstrap & CommonJS Exports */
'use strict';

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
  dom.mobileChatPill = document.getElementById('mobile-chat-pill');
  dom.mobileChatPillBadge = document.getElementById('mobile-chat-pill-badge');
  dom.mobileDrawBanner = document.getElementById('mobile-draw-banner');
  dom.mobAcceptDrawBtn = document.getElementById('mob-accept-draw-btn');
  dom.mobDeclineDrawBtn = document.getElementById('mob-decline-draw-btn');
  dom.mobPrevBtn = document.getElementById('mob-prev-btn');
  dom.mobNextBtn = document.getElementById('mob-next-btn');
  dom.mobFlipBtn = document.getElementById('mob-flip-btn');
  dom.mobLocalActions = document.getElementById('mob-local-actions');
  dom.mobResetBtn = document.getElementById('mob-reset-btn');
  dom.mobPlayFriendBtn = document.getElementById('mob-play-friend-btn');
  dom.mobWaitingActions = document.getElementById('mob-waiting-actions');
  dom.mobShareLinkBtn = document.getElementById('mob-share-link-btn');
  dom.mobCopyLinkBtn = document.getElementById('mob-copy-link-btn');
  dom.mobCancelWaitBtn = document.getElementById('mob-cancel-wait-btn');
  dom.mobJoiningActions = document.getElementById('mob-joining-actions');
  dom.mobCancelJoinBtn = document.getElementById('mob-cancel-join-btn');
  dom.mobSetupActions = document.getElementById('mob-setup-actions');
  dom.mobSetupBackBtn = document.getElementById('mob-setup-back-btn');
  dom.mobOnlineActions = document.getElementById('mob-online-actions');
  dom.mobDrawBtn = document.getElementById('mob-draw-btn');
  dom.mobResignBtn = document.getElementById('mob-resign-btn');
  dom.mobRematchBtn = document.getElementById('mob-rematch-btn');

  dom.mobileTabs = document.getElementById('mobile-tabs');
  dom.mobileChatTabBtn = document.getElementById('mobile-chat-tab-btn');
  dom.mobileChatBadge = document.getElementById('mobile-chat-badge');
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
  dom.editorQuantumGroup = document.getElementById('editor-quantum-group');
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

  dom.desktopSidebarTabs = document.getElementById('desktop-sidebar-tabs');
  dom.desktopTabMoves = document.getElementById('desktop-tab-moves');
  dom.desktopTabChat = document.getElementById('desktop-tab-chat');
  dom.desktopChatBadge = document.getElementById('desktop-chat-badge');
  dom.movesSection = document.getElementById('moves-section');
  dom.chatSection = document.getElementById('chat-section');
  dom.chatStatusPill = document.getElementById('chat-status-pill');
  dom.chatMessages = document.getElementById('chat-messages');
  dom.chatEmojiPicker = document.getElementById('chat-emoji-picker');
  dom.chatStatusNote = document.getElementById('chat-status-note');
  dom.chatForm = document.getElementById('chat-form');
  dom.chatEmojiBtn = document.getElementById('chat-emoji-btn');
  dom.chatTextInput = document.getElementById('chat-text-input');
  dom.chatSendBtn = document.getElementById('chat-send-btn');
  dom.leaveConfirmBackdrop = document.getElementById('leave-confirm-backdrop');
  dom.leaveConfirmModal = document.getElementById('leave-confirm-modal');
  dom.leaveConfirmStayBtn = document.getElementById('leave-confirm-stay-btn');
  dom.leaveConfirmYesBtn = document.getElementById('leave-confirm-yes-btn');

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

  dom.schrodingerBar = document.getElementById('schrodinger-bar');
  dom.schrodingerSides = document.getElementById('schrodinger-sides');
  dom.schrodingerHint = document.getElementById('schrodinger-hint');
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
    if (
      e.key === 'Escape' &&
      dom.leaveConfirmBackdrop &&
      !dom.leaveConfirmBackdrop.classList.contains('hidden')
    ) {
      e.preventDefault();
      closeLeaveConfirmModal();
      return;
    }

    if (e.key === 'Escape' && chatPickerOpen) {
      e.preventDefault();
      closeChatEmojiPicker();
      return;
    }

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

  // Mobile Segmented Tabs, Desktop Tabs, Chat Controls & Variant Pill
  if (dom.mobileTabs) {
    dom.mobileTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-tab-btn');
      if (!btn) return;
      setMobileTab(btn.dataset.tab);
    });
  }

  if (dom.desktopTabMoves) {
    dom.desktopTabMoves.addEventListener('click', () => setDesktopTab('moves'));
  }
  if (dom.desktopTabChat) {
    dom.desktopTabChat.addEventListener('click', () => setDesktopTab('chat'));
  }
  if (dom.mobileChatPill) {
    dom.mobileChatPill.addEventListener('click', () => {
      setMobileTab('chat');
      scrollElementIntoViewOnMobile(dom.sidebar);
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

  const exitSetupToLocal = () => {
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
  };

  dom.setupBackBtn.addEventListener('click', exitSetupToLocal);

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
    dom.shareLinkBtn.addEventListener('click', () => {
      shareCurrentInviteLink(dom.copyLinkBtn, 'Copy Invite Link');
    });
  }

  dom.copyLinkBtn.addEventListener('click', () => {
    copyCurrentInviteLink(dom.copyLinkBtn, 'Copy Invite Link');
  });

  if (dom.mobShareLinkBtn) {
    dom.mobShareLinkBtn.addEventListener('click', () => {
      shareCurrentInviteLink(dom.mobCopyLinkBtn, 'Copy');
    });
  }
  if (dom.mobCopyLinkBtn) {
    dom.mobCopyLinkBtn.addEventListener('click', () => {
      const defaultLbl =
        typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? 'Copy' : 'Copy Link';
      copyCurrentInviteLink(dom.mobCopyLinkBtn, defaultLbl);
    });
  }
  if (dom.mobCancelWaitBtn) {
    dom.mobCancelWaitBtn.addEventListener('click', () => goHome(true));
  }
  if (dom.mobCancelJoinBtn) {
    dom.mobCancelJoinBtn.addEventListener('click', cancelJoin);
  }
  if (dom.mobSetupBackBtn) {
    dom.mobSetupBackBtn.addEventListener('click', () => {
      if (net.mode === 'editor') {
        closeBoardEditor();
      } else {
        exitSetupToLocal();
        scrollBoardIntoViewOnMobile();
      }
    });
  }

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
      editorState.board = cloneBoard(
        editorState.variant === 'schrodinger' ? SCHRODINGER_INITIAL_BOARD : INITIAL_BOARD
      );
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

  // P2P Chat & Chess Classification Badge / Emoji Picker + Leave Confirmation Modal
  renderChatEmojiPicker();
  if (dom.chatForm) {
    dom.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChatMessage(dom.chatTextInput ? dom.chatTextInput.value : '');
    });
  }
  if (dom.chatEmojiBtn) {
    dom.chatEmojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (net.mode !== 'online' || opponentDisconnected) return;
      toggleChatEmojiPicker();
    });
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      if (!chatPickerOpen) return;
      if (dom.chatEmojiPicker && dom.chatEmojiPicker.contains && dom.chatEmojiPicker.contains(e.target)) {
        return;
      }
      if (dom.chatEmojiBtn && dom.chatEmojiBtn.contains && dom.chatEmojiBtn.contains(e.target)) {
        return;
      }
      closeChatEmojiPicker();
    });
  }
  if (dom.leaveConfirmStayBtn) {
    dom.leaveConfirmStayBtn.addEventListener('click', closeLeaveConfirmModal);
  }
  if (dom.leaveConfirmYesBtn) {
    dom.leaveConfirmYesBtn.addEventListener('click', confirmLeaveOnlineMatch);
  }
  if (dom.leaveConfirmBackdrop) {
    dom.leaveConfirmBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.leaveConfirmBackdrop) closeLeaveConfirmModal();
    });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', syncChatUnreadState);
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
    applyDicePassTurn,
    getInviteVariantSlug,
    buildInviteUrl,
    CHESS_CHAT_BADGES,
    CHAT_QUICK_EMOJIS,
    tokenizeChatText,
    sanitizeChatText,
    normalizeIncomingChatPacket,
    handleIncomingChatPacket,
    setMobileTab,
    setDesktopTab,
    openLeaveConfirmModal,
    closeLeaveConfirmModal,
    openBoardEditor,
    closeBoardEditor,
    SCHRODINGER_INITIAL_BOARD,
    createInitialSchrodingerMeta,
    isQuantumType,
    getSchrodingerSquareColor,
    computeSchrodingerSideAnalysis,
    resolveSchrodingerState,
    isSchrodingerSideFeasible,
    canSchrodingerPieceMoveAs,
    canCornerCastleInSchrodinger,
    getSchrodingerHintForSquare
  };
}
