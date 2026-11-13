/* Dice Chess 3D Vector Die Faces, Roll Timing, Auto-Roll & Side Tray Rendering */
'use strict';

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
