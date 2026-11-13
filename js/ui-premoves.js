/* View/Fog State, Move Submission, Multi-Premove Projection & Turn Transition Handling */
'use strict';

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

  for (const type of getPromotionTypes(gameState)) {
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
    if (getPromotionTypes(gameState).length === 1) {
      submitPlayerMove(from, to, legal[0].promotion, viaDrag, false);
      return true;
    }
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
    const isCastleCornerPiece = (piece) =>
      piece === color + 'r' || (baseState.variant === 'schrodinger' && piece === color + 'qm');
    if (isCastleCornerPiece(baseState.board[homeRow][0]) && !(step.from.r === homeRow && step.from.c === 0)) {
      soloBoard[homeRow][0] = baseState.board[homeRow][0];
    }
    if (isCastleCornerPiece(baseState.board[homeRow][7]) && !(step.from.r === homeRow && step.from.c === 7)) {
      soloBoard[homeRow][7] = baseState.board[homeRow][7];
    }
    const soloState = {
      variant: baseState.variant || 'standard',
      board: soloBoard,
      turn: color,
      castling: baseState.castling,
      enPassant: null,
      _schrodingerSourceState: baseState
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
  const nextCaptured = {
    w: (baseState.captured?.w || []).slice(),
    b: (baseState.captured?.b || []).slice()
  };
  let nextSchrodinger =
    baseState.variant === 'schrodinger'
      ? cloneSchrodingerMeta(baseState.schrodinger) || createInitialSchrodingerMeta()
      : null;

  const existingDestCode = nextBoard[step.to.r]?.[step.to.c];
  if (nextSchrodinger && existingDestCode) {
    const capColor = getPieceColor(existingDestCode);
    const capType = getPieceType(existingDestCode);
    const trayOwner = capColor === 'w' ? 'b' : 'w';
    nextCaptured[trayOwner].push(capType);
    if (capType === 'b') {
      const capSqColor = getSchrodingerSquareColor(step.to.r, step.to.c);
      if (capSqColor === 'L') nextSchrodinger[capColor].capL += 1;
      else nextSchrodinger[capColor].capD += 1;
    }
  }

  nextBoard[step.from.r][step.from.c] = null;

  if (matchedMove && matchedMove.isEnPassant && matchedMove.captureSq) {
    nextBoard[matchedMove.captureSq.r][matchedMove.captureSq.c] = null;
  }

  if (matchedMove && matchedMove.rookMove) {
    const rm = matchedMove.rookMove;
    const rCode = nextBoard[rm.from.r][rm.from.c];
    if (rCode && getPieceColor(rCode) === color) {
      nextBoard[rm.from.r][rm.from.c] = null;
      nextBoard[rm.to.r][rm.to.c] =
        baseState.variant === 'schrodinger' && rCode === color + 'qm' ? color + 'r' : rCode;
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
    captured: nextCaptured,
    schrodinger: nextSchrodinger,
    pockets: {
      w: (baseState.pockets?.w || []).slice(),
      b: (baseState.pockets?.b || []).slice()
    }
  };

  if (nextProj.variant === 'schrodinger') {
    if (step.promotion) {
      const promoSqColor = getSchrodingerSquareColor(step.to.r, step.to.c);
      if (promoSqColor === 'L') nextProj.schrodinger[color].promoL += 1;
      else nextProj.schrodinger[color].promoD += 1;
    } else if (isQuantumType(moverType)) {
      nextProj.board[step.to.r][step.to.c] = applySchrodingerMoveTransition(
        nextProj,
        color,
        movingCode,
        { from: step.from, to: step.to }
      );
    }
    resolveSchrodingerState(nextProj);
  }

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
    captured: {
      w: (state.captured?.w || []).slice(),
      b: (state.captured?.b || []).slice()
    },
    schrodinger: cloneSchrodingerMeta(state.schrodinger),
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
    captured: {
      w: (gameState.captured?.w || []).slice(),
      b: (gameState.captured?.b || []).slice()
    },
    schrodinger: cloneSchrodingerMeta(gameState.schrodinger),
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
  if (getPromotionTypes(projState).length === 0) return false;

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
    const promoTypes = getPromotionTypes(projState);
    if (promoTypes.length === 1) {
      enqueuePremove(from, to, promoTypes[0]);
      return true;
    }
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
