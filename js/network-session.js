/* Authoritative Clocks, Host/Guest Sync Protocol, Heartbeats, Reconnect & Room Lifecycle */
'use strict';

function initClockForNewMatch() {
  clockState.timed = Boolean(setupConfig.timed);
  clockState.minutes = setupConfig.minutes;
  clockState.incrementSec = setupConfig.incrementSec;
  const startMs = setupConfig.minutes * 60 * 1000;
  clockState.whiteMs = startMs;
  clockState.blackMs = startMs;
  clockState.running = false;
  clockState.lastSyncPerf = getNowPerf();
  clockState.lowTimeWarned = false;
}

// Deducts elapsed turn time and adds Fischer increment on the Authoritative Host
function commitHostClockTurn(moverColor) {
  if (!clockState.timed) return true;

  const now = getNowPerf();
  if (clockState.running) {
    const elapsed = Math.max(0, now - clockState.lastSyncPerf);
    const key = moverColor === 'w' ? 'whiteMs' : 'blackMs';
    clockState[key] = Math.max(0, clockState[key] - elapsed);

    if (clockState[key] <= 0) {
      clockState.running = false;
      clockState.lastSyncPerf = now;
      gameState.status = 'timeout';
      gameState.winner = moverColor === 'w' ? 'b' : 'w';
      return false;
    }

    clockState[key] += clockState.incrementSec * 1000;
  }

  clockState.running = true;
  clockState.lastSyncPerf = now;
  return true;
}

function tickClocksUIAndAuthority() {
  if (typeof document === 'undefined') return;
  if (!clockState.timed) return;

  // Host monitors active turn flag-fall
  if (net.mode === 'online' && net.role === 'host' && clockState.running && gameState.status === 'playing') {
    const activeColor = gameState.turn;
    const rem = getLiveClockMs(activeColor);
    if (rem <= 0) {
      if (activeColor === 'w') clockState.whiteMs = 0;
      else clockState.blackMs = 0;
      clockState.running = false;
      clockState.lastSyncPerf = getNowPerf();
      gameState.status = 'timeout';
      gameState.winner = activeColor === 'w' ? 'b' : 'w';
      net.drawOfferedBy = null;
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
      broadcastHostState();
      renderAll();
      return;
    }
  }

  // Low-time warning chime once when player's own clock drops below 10.0s
  if (net.mode === 'online' && clockState.running && gameState.status === 'playing') {
    const myRem = getLiveClockMs(net.myColor);
    if (myRem > 0 && myRem <= 10000 && !clockState.lowTimeWarned) {
      clockState.lowTimeWarned = true;
      playSound('lowTime');
    }
  }

  renderClockBoxesOnly();
}

function broadcastHostState() {
  if (net.role !== 'host' || !isLogicalConnOpen(net.conn)) return;
  const guestColor = net.myColor === 'w' ? 'b' : 'w';
  sendPacket(net.conn, {
    type: 'sync_state',
    yourColor: guestColor,
    matchId: net.currentMatchId,
    state: serializeStateForPeer(gameState, guestColor),
    clock: serializeClockPayload(),
    drawOfferedBy: net.drawOfferedBy,
    hostName: net.myName,
    guestName: net.peerName
  });
}

function startNewMatchAsHost(isRematch = false) {
  const matchVariant = isRematch ? gameState.variant || setupConfig.variant : setupConfig.variant;
  if (isRematch) {
    net.myColor = net.myColor === 'w' ? 'b' : 'w';
  } else {
    if (setupConfig.sidePref === 'random') {
      net.myColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      net.myColor = setupConfig.sidePref === 'b' ? 'b' : 'w';
    }
  }

  net.currentMatchId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  net.myRematchWanted = false;
  net.peerRematchWanted = false;
  net.drawOfferedBy = null;
  net.pendingOptimisticPly = null;
  boardFlipped = net.myColor === 'b';

  premoveQueue = [];
  clearBoardTransientUI();
  initClockForNewMatch();

  if (!isRematch && setupConfig.customState) {
    gameState = createCustomState(setupConfig.customState);
  } else {
    gameState = createInitialState(matchVariant);
  }
  if (gameState.status === 'secret_pick') {
    clockState.running = false;
  }
  viewPly = 0;

  sendCurrentMatchStartPacket();

  playSound('gameStart');
  renderAll();
  if (!isRematch) scrollBoardIntoViewOnMobile();
}

function handleHostIncomingData(data) {
  if (!allowIncomingPacket(data)) return;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return;

  const guestColor = net.myColor === 'w' ? 'b' : 'w';

  lastHeartbeatReceived = Date.now();
  if (data.type === 'ping') {
    sendPacket(net.conn, { type: 'pong', t: data.t });
    return;
  }
  if (data.type === 'pong') {
    if (opponentDisconnected) {
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      showTransientFeedback('Opponent reconnected!');
      renderAll();
    }
    return;
  }

  if (data.type === 'hello' || data.type === 'name_update') {
    net.peerName = sanitizePlayerName(data.name);
    if (opponentDisconnected) {
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      showTransientFeedback('Opponent reconnected!');
    }
    if (data.type === 'hello' && gameState.moveHistory.length === 0) {
      sendCurrentMatchStartPacket();
    }
    broadcastHostState();
    renderAll();
    return;
  }

  if (data.type === 'secret_pick') {
    if (gameState.status !== 'secret_pick') return;
    if (typeof data.col !== 'number' || data.col < 0 || data.col > 7) return;
    assignSecretQueen(gameState, guestColor, data.col);
    if (gameState.secretQueens.w.picked && gameState.secretQueens.b.picked) {
      gameState.status = 'playing';
      clockState.running = clockState.timed;
      clockState.lastTick = Date.now();
      clockState.lastSyncPerf = getNowPerf();
      playSound('gameStart');
    }
    broadcastHostState();
    renderAll();
    return;
  }

  if (data.type === 'dice_roll_request') {
    if (
      gameState.status === 'playing' &&
      getVariantDef(gameState).diceChess &&
      gameState.turn === guestColor &&
      gameState.dice &&
      gameState.dice.rolled === false &&
      !opponentDisconnected
    ) {
      rollDiceForState(gameState);
      clearSelection();
      playDiceOutcomeSounds(gameState.dice);
      broadcastHostState();
      renderAll();
    }
    return;
  }

  if (data.type === 'dice_pass') {
    if (
      gameState.status === 'playing' &&
      getVariantDef(gameState).diceChess &&
      gameState.dice?.noLegalMoves
    ) {
      executeDicePassTurn();
    }
    return;
  }

  if (data.type === 'move_request') {
    if (gameState.status !== 'playing') return;
    if (gameState.turn !== guestColor) {
      broadcastHostState();
      return;
    }

    const prevState = gameState;
    let candidate = null;

    if (data.isDrop) {
      if (
        typeof data.dropType !== 'string' ||
        !Object.prototype.hasOwnProperty.call(PIECE_DEFS, data.dropType) ||
        PIECE_DEFS[data.dropType].isRoyal ||
        !isValidCoordObj(data.to)
      ) {
        return;
      }
      candidate = tryMakeDrop(gameState, data.dropType, data.to);
    } else {
      if (!isValidCoordObj(data.from) || !isValidCoordObj(data.to)) return;
      const promo = typeof data.promotion === 'string' ? data.promotion.slice(0, 4) : null;
      candidate = tryMakeMove(gameState, data.from, data.to, promo);
    }

    if (!candidate) {
      const pinTrigger = checkSecretQueenPinInteraction(gameState, data.from, data.to);
      if (pinTrigger) {
        revealSecretQueen(gameState, pinTrigger.secretColor);
        broadcastHostState();
        playSound('illegal');
        renderAll();
        return;
      }
      broadcastHostState();
      return;
    }

    if (!commitHostClockTurn(guestColor)) {
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
      broadcastHostState();
      renderAll();
      return;
    }

    const wasAtLive = viewPly === prevState.moveHistory.length;
    gameState = candidate;
    if (gameState.status !== 'playing') {
      clockState.running = false;
    }
    net.drawOfferedBy = null;

    if (wasAtLive) {
      viewPly = gameState.moveHistory.length;
      queueSlideAnimationFromFrame(gameState.historyFrames[gameState.historyFrames.length - 1]);
    }

    playMoveFeedbackSound(prevState, gameState, false);
    broadcastHostState();
    reconcileInteractionAfterTurnChange();
    renderAll();
  } else if (data.type === 'draw_offer') {
    if (gameState.status !== 'playing') return;
    if (net.drawOfferedBy === net.myColor) {
      // Both players offered a draw -> mutual agreement
      gameState.status = 'draw_agreement';
      gameState.winner = null;
      clockState.running = false;
      net.drawOfferedBy = null;
      reconcileInteractionAfterTurnChange();
      playSound('gameEnd');
    } else {
      net.drawOfferedBy = guestColor;
    }
    broadcastHostState();
    renderAll();
  } else if (data.type === 'draw_accept') {
    if (gameState.status !== 'playing' || net.drawOfferedBy !== net.myColor) return;
    gameState.status = 'draw_agreement';
    gameState.winner = null;
    clockState.running = false;
    net.drawOfferedBy = null;
    reconcileInteractionAfterTurnChange();
    playSound('gameEnd');
    broadcastHostState();
    renderAll();
  } else if (data.type === 'draw_decline') {
    if (net.drawOfferedBy === net.myColor) {
      net.drawOfferedBy = null;
      broadcastHostState();
      renderAll();
    }
  } else if (data.type === 'resign') {
    if (gameState.status !== 'playing') return;
    gameState.status = 'resigned';
    gameState.winner = net.myColor;
    clockState.running = false;
    net.drawOfferedBy = null;
    reconcileInteractionAfterTurnChange();
    playSound('gameEnd');
    broadcastHostState();
    renderAll();
  } else if (data.type === 'rematch_request') {
    if (gameState.status === 'playing') return;
    net.peerRematchWanted = true;
    if (net.myRematchWanted) {
      startNewMatchAsHost(true);
    } else {
      renderAll();
    }
  } else if (data.type === 'chat_msg') {
    handleIncomingChatPacket(data);
  }
}

function clearGuestJoinTimers() {
  if (net.joinTimer) {
    clearTimeout(net.joinTimer);
    net.joinTimer = null;
  }
  if (net.joinRetryTimer) {
    clearInterval(net.joinRetryTimer);
    net.joinRetryTimer = null;
  }
}

function handleGuestIncomingData(data) {
  if (!allowIncomingPacket(data)) return;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return;

  lastHeartbeatReceived = Date.now();
  if (data.type === 'ping') {
    sendPacket(net.conn, { type: 'pong', t: data.t });
    return;
  }
  if (data.type === 'pong') {
    if (opponentDisconnected) {
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      showTransientFeedback('Reconnected to game!');
      renderAll();
    }
    return;
  }

  if (data.type === 'room_locked') {
    net.skipCloseNotify = true;
    cleanupNetworkSession();
    setGameFeedback('That game is already full (2/2 players).');
    renderAll();
    return;
  }

  if (data.type === 'match_start') {
    if (data.yourColor !== 'w' && data.yourColor !== 'b') return;
    const hydrated = validateAndHydrateState(data.state);
    if (!hydrated) return;

    clearGuestJoinTimers();

    // Ignore duplicate match_start for the same active match arriving over a secondary transport
    if (
      net.mode === 'online' &&
      typeof data.matchId === 'string' &&
      net.currentMatchId === data.matchId
    ) {
      net.peerName = sanitizePlayerName(data.hostName || 'Host');
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      renderAll();
      return;
    }

    const wasAlreadyOnline = net.mode === 'online';
    net.currentMatchId = typeof data.matchId === 'string' ? data.matchId : 'm_' + Date.now();
    net.mode = 'online';
    net.myColor = data.yourColor;
    net.peerName = sanitizePlayerName(data.hostName || 'Host');
    net.roomLocked = true;
    net.myRematchWanted = false;
    net.peerRematchWanted = false;
    net.drawOfferedBy = null;
    net.pendingOptimisticPly = null;
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();
    boardFlipped = net.myColor === 'b';

    applyClockPayload(data.clock);
    clockState.lowTimeWarned = false;

    premoveQueue = [];
    clearBoardTransientUI();
    gameState = hydrated;
    viewPly = gameState.moveHistory.length;

    setGameFeedback('');
    playSound('gameStart');
    renderAll();
    if (!wasAlreadyOnline) {
      setMobileTab('play');
      scrollBoardIntoViewOnMobile();
    } else {
      scrollBoardIntoViewOnMobile();
    }
  } else if (data.type === 'sync_state') {
    const hydrated = validateAndHydrateState(data.state);
    if (!hydrated) return;

    // If Guest was still in 'joining' mode and received sync_state first, complete the join transition!
    const wasJoining = net.mode === 'joining';
    if (wasJoining) {
      clearGuestJoinTimers();
      net.mode = 'online';
      if (data.yourColor === 'w' || data.yourColor === 'b') {
        net.myColor = data.yourColor;
        boardFlipped = net.myColor === 'b';
      }
      if (typeof data.matchId === 'string') {
        net.currentMatchId = data.matchId;
      }
      net.roomLocked = true;
      opponentDisconnected = false;
      clearOpponentDisconnectGraceTimer();
      setGameFeedback('');
      playSound('gameStart');
    }

    const prevMoveCount = gameState.moveHistory.length;
    const prevStatus = gameState.status;
    const wasAtLive = wasJoining || viewPly === prevMoveCount;

    if (typeof data.hostName === 'string') {
      net.peerName = sanitizePlayerName(data.hostName);
    }
    net.drawOfferedBy =
      data.drawOfferedBy === 'w' || data.drawOfferedBy === 'b' ? data.drawOfferedBy : null;

    applyClockPayload(data.clock);

    const prevState = gameState;
    const newMoveCount = hydrated.moveHistory.length;

    // Re-stitch earlier historyFrames if Host sent a compact tail window during live play
    // (preserving fog-masked history prefix during live Fog of War too, until full post-game reveal)
    if (
      prevState &&
      prevState.variant === hydrated.variant &&
      Boolean(prevState.fogMasked) === Boolean(hydrated.fogMasked) &&
      Array.isArray(prevState.historyFrames) &&
      newMoveCount + 1 > hydrated.historyFrames.length
    ) {
      const neededPrefix = newMoveCount + 1 - hydrated.historyFrames.length;
      if (prevState.historyFrames.length >= neededPrefix) {
        hydrated.historyFrames = prevState.historyFrames
          .slice(0, neededPrefix)
          .concat(hydrated.historyFrames);
      }
    }

    // 1. Authoritative echo of Guest's own optimistic move -> preserve Guest's active premoves/drag!
    if (
      net.pendingOptimisticPly !== null &&
      newMoveCount === net.pendingOptimisticPly &&
      hydrated.turn === prevState.turn &&
      hydrated.status === prevState.status
    ) {
      net.pendingOptimisticPly = null;
      drag.justDroppedMove = false;
      gameState = hydrated;
      if (wasAtLive) viewPly = newMoveCount;
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }

    // 2. Host rejected Guest's optimistic move (e.g. flag-fall timeout on Host just before packet arrived)
    if (net.pendingOptimisticPly !== null && newMoveCount < prevMoveCount) {
      net.pendingOptimisticPly = null;
      drag.justDroppedMove = false;
      gameState = hydrated;
      viewPly = wasAtLive ? newMoveCount : Math.min(viewPly, newMoveCount);
      if (prevStatus === 'playing' && gameState.status !== 'playing') {
        playSound('gameEnd');
      }
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }

    net.pendingOptimisticPly = null;
    gameState = hydrated;
    if (wasJoining) {
      viewPly = newMoveCount;
    }

    // 3. New move(s) played on board (Opponent's move -> upgrade selection or fire next premove!)
    if (newMoveCount > prevMoveCount && !wasJoining) {
      const latestFrame = gameState.historyFrames[gameState.historyFrames.length - 1];
      const moverWasMe = gameState.turn !== net.myColor;
      if (wasAtLive) {
        viewPly = newMoveCount;
        if (!moverWasMe || !drag.justDroppedMove) {
          queueSlideAnimationFromFrame(latestFrame);
        }
      }
      drag.justDroppedMove = false;
      playMoveFeedbackSound(prevState, gameState, moverWasMe);
      reconcileInteractionAfterTurnChange();
      renderAll();
      return;
    }

    // 4. Same move count (name update, dice roll sync, draw offer/decline, resignation, or timeout)
    const diceJustRolled = Boolean(
      !wasJoining &&
        prevStatus === 'playing' &&
        gameState.status === 'playing' &&
        getVariantDef(gameState).diceChess &&
        (prevState?.dice?.rolled === false || !Array.isArray(prevState?.dice?.values)) &&
        gameState.dice?.rolled !== false &&
        Array.isArray(gameState.dice?.values)
    );
    if (diceJustRolled) {
      playDiceOutcomeSounds(gameState.dice);
    }

    if (prevStatus === 'playing' && gameState.status !== 'playing') {
      playSound('gameEnd');
      reconcileInteractionAfterTurnChange();
    } else if (gameState.status !== 'playing') {
      reconcileInteractionAfterTurnChange();
    }
    renderAll();
  } else if (data.type === 'rematch_request') {
    if (gameState.status === 'playing') return;
    net.peerRematchWanted = true;
    renderAll();
  } else if (data.type === 'chat_msg') {
    handleIncomingChatPacket(data);
  }
}

function cleanupNetworkSession() {
  stopHeartbeat();
  clearOpponentDisconnectGraceTimer();
  if (guestReconnectTimer) {
    clearTimeout(guestReconnectTimer);
    guestReconnectTimer = null;
  }
  guestReconnectAttempts = 0;
  clearGuestJoinTimers();

  if (!net.skipCloseNotify && net.remotePeerId && hasActiveSignalingSocket(net.peer)) {
    sendRawSignalingEnvelope(net.remotePeerId, {
      __chessRelay: true,
      kind: 'close'
    });
  }
  if (!net.skipCloseNotify && net.bcChannel && net.bcOpen) {
    sendViaBroadcastChannel({
      __chessRelay: true,
      kind: 'close'
    });
  }
  if (net.bcChannel) {
    try {
      net.bcChannel.close();
    } catch (_) {}
    net.bcChannel = null;
  }

  if (net.pendingClaimConn && net.pendingClaimConn !== net.conn) {
    try {
      net.pendingClaimConn.close();
    } catch (_) {}
  }
  net.pendingClaimConn = null;
  net.pendingClaimAt = 0;

  if (net.conn) {
    try {
      net.conn.removeAllListeners?.();
      net.conn.close();
    } catch (_) {}
    net.conn = null;
  }
  if (net.peer) {
    try {
      net.peer.destroy();
    } catch (_) {}
    net.peer = null;
  }
  net.mode = 'local';
  net.role = null;
  net.roomCode = null;
  net.remotePeerId = null;
  net.relayOpen = false;
  net.bcOpen = false;
  net.bcPeerId = null;
  net.guestClientId = null;
  net.skipCloseNotify = false;
  net.currentMatchId = null;
  net.roomLocked = false;
  net.myRematchWanted = false;
  net.peerRematchWanted = false;
  net.drawOfferedBy = null;
  net.pendingOptimisticPly = null;
  net.msgTimestamps = [];
  net.rxPktIds.clear();
  net.relayChunks.clear();
  chatMessages = [];
  unreadChatCount = 0;
  seenChatIds.clear();
  opponentDisconnected = false;
  clockState.timed = false;
  clockState.running = false;
  premoveQueue = [];
  clearBoardTransientUI();
  closeChatEmojiPicker();
  closeLeaveConfirmModal();
  renderChatUI();
}

function runHeartbeatTick() {
  if (net.peer && !net.peer.destroyed) {
    if (net.peer.disconnected) {
      try {
        net.peer.reconnect();
      } catch (_) {}
    } else if (net.peer.socket && typeof net.peer.socket._sendHeartbeat === 'function') {
      try {
        net.peer.socket._sendHeartbeat();
      } catch (_) {}
    }
  }
  if (isLogicalConnOpen(net.conn)) {
    sendPacket(net.conn, { type: 'ping', t: Date.now() });
  }
  if (
    net.mode === 'online' &&
    (gameState.status === 'playing' || gameState.status === 'secret_pick') &&
    !opponentDisconnected &&
    Date.now() - lastHeartbeatReceived > 25000
  ) {
    handleTransientDisconnect();
  }
}

function startHeartbeat() {
  stopHeartbeat();
  lastHeartbeatReceived = Date.now();
  if (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    net.peer &&
    net.peer.socket
  ) {
    try {
      const blob = new Blob(
        ['var t=setInterval(function(){postMessage("tick");},3000);onmessage=function(e){if(e.data==="stop")clearInterval(t);};'],
        { type: 'application/javascript' }
      );
      const url = URL.createObjectURL(blob);
      heartbeatWorker = new Worker(url);
      URL.revokeObjectURL(url);
      heartbeatWorker.onmessage = () => runHeartbeatTick();
      return;
    } catch (_) {
      heartbeatWorker = null;
    }
  }
  heartbeatInterval = setInterval(runHeartbeatTick, 3000);
}

function stopHeartbeat() {
  if (heartbeatWorker) {
    try {
      heartbeatWorker.postMessage('stop');
      heartbeatWorker.terminate();
    } catch (_) {}
    heartbeatWorker = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startOpponentDisconnectGrace() {
  clearOpponentDisconnectGraceTimer();
  opponentGraceSecondsLeft = 30;
  opponentDisconnected = true;
  // Clock continues running: switching apps (e.g. to Discord) does not pause the match timer
  renderAll();

  opponentGraceTimer = setInterval(() => {
    opponentGraceSecondsLeft--;
    if (opponentGraceSecondsLeft <= 0) {
      clearOpponentDisconnectGraceTimer();
      if (
        net.mode === 'online' &&
        (gameState.status === 'playing' || gameState.status === 'secret_pick')
      ) {
        gameState.status = 'resigned';
        gameState.winner = net.myColor;
        setGameFeedback('Opponent disconnected and did not return.');
        playSound('gameEnd');
        renderAll();
      }
    } else {
      renderStatusAndControls();
    }
  }, 1000);
}

function clearOpponentDisconnectGraceTimer() {
  if (opponentGraceTimer) {
    clearInterval(opponentGraceTimer);
    opponentGraceTimer = null;
  }
}

function handleTransientDisconnect() {
  if (net.mode !== 'online') return;
  const isMatchActive = gameState.status === 'playing' || gameState.status === 'secret_pick';
  if (!isMatchActive) {
    opponentDisconnected = true;
    clockState.running = false;
    renderAll();
    return;
  }

  if (!opponentGraceTimer) {
    startOpponentDisconnectGrace();
  }

  if (net.role === 'guest') {
    attemptGuestReconnect();
  }
}

function attemptGuestReconnect() {
  if (net.role !== 'guest' || !net.roomCode || net.mode !== 'online') return;
  if (guestReconnectAttempts >= 20) return;
  if (guestReconnectTimer) return;

  guestReconnectAttempts++;
  guestReconnectTimer = setTimeout(() => {
    guestReconnectTimer = null;
    if (net.role !== 'guest' || net.mode !== 'online' || isLogicalConnOpen(net.conn)) return;

    if (!net.peer || net.peer.destroyed) {
      const guestPeerId =
        PEER_ID_PREFIX + net.roomCode + '-g-' + Math.random().toString(36).slice(2, 8);
      const peer = new Peer(guestPeerId, { config: PEER_ICE_CONFIG });
      net.peer = peer;
      setupPeerRelayHook(peer);
      setupBroadcastChannelForRoom(net.roomCode, peer);
      peer.on('open', () => {
        if (net.peer !== peer || net.mode !== 'online' || isLogicalConnOpen(net.conn)) return;
        connectToHostForReconnect(peer);
      });
      peer.on('disconnected', () => {
        if (net.mode !== 'local' && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch (_) {}
        }
      });
      return;
    }

    if (net.peer.disconnected) {
      try {
        net.peer.reconnect();
      } catch (_) {}
    }

    connectToHostForReconnect(net.peer);
  }, 1800);
}

function connectToHostForReconnect(peer) {
  try {
    const hostPeerId = PEER_ID_PREFIX + net.roomCode;
    net.remotePeerId = hostPeerId;
    setupPeerRelayHook(peer);

    if (hasActiveSignalingSocket(peer)) {
      sendRawSignalingEnvelope(
        hostPeerId,
        {
          __chessRelay: true,
          kind: 'open',
          name: net.myName,
          clientId: net.localClientId,
          reconnect: true
        },
        peer
      );
    }
    if (net.bcChannel) {
      sendViaBroadcastChannel({
        __chessRelay: true,
        kind: 'open',
        name: net.myName,
        clientId: net.localClientId,
        reconnect: true
      });
    }

    if (net.conn) {
      try {
        net.conn.close();
      } catch (_) {}
    }
    const newConn = peer.connect(hostPeerId, {
      metadata: { clientId: net.localClientId, reconnect: true }
    });
    net.conn = newConn;

    const onReconnected = () => {
      if (net.conn !== newConn) return;
      const wasDisconnected = opponentDisconnected;
      guestReconnectAttempts = 0;
      clearOpponentDisconnectGraceTimer();
      opponentDisconnected = false;
      startHeartbeat();
      if (wasDisconnected) {
        showTransientFeedback('Reconnected to game!');
      }
      sendPacket(newConn, {
        type: 'hello',
        name: net.myName,
        clientId: net.localClientId,
        reconnect: true
      });
      renderAll();
    };

    if (newConn.open) onReconnected();
    else newConn.on('open', onReconnected);

    newConn.on('data', (data) => {
      if (net.conn === newConn) {
        receiveDeduplicatedPacket(data, data && data._pktId);
      }
    });

    newConn.on('close', () => {
      if (net.conn === newConn && !isLogicalConnOpen(newConn)) {
        handleTransientDisconnect();
      }
    });

    newConn.on('error', () => {
      if (net.conn === newConn && !isLogicalConnOpen(newConn)) {
        handleTransientDisconnect();
      }
    });
  } catch (_) {
    attemptGuestReconnect();
  }
}

function createGameRoom(retryCount = 0) {
  if (typeof Peer === 'undefined') {
    setGameFeedback('Networking library failed to load. Check your internet connection.');
    return;
  }

  syncMyNameFromInput();
  const savedName = net.myName;
  cleanupNetworkSession();
  net.myName = savedName;
  setGameFeedback('');

  const code = generateGameCode();
  net.mode = 'waiting';
  net.role = 'host';
  net.roomCode = code;
  net.myColor = setupConfig.sidePref === 'b' ? 'b' : 'w';
  boardFlipped = net.myColor === 'b';
  initClockForNewMatch();
  if (setupConfig.customState) {
    gameState = createCustomState(setupConfig.customState);
  } else {
    gameState = createInitialState(setupConfig.variant);
  }
  viewPly = 0;
  renderAll();

  const peer = new Peer(PEER_ID_PREFIX + code, { config: PEER_ICE_CONFIG });
  net.peer = peer;
  setupPeerRelayHook(peer);
  setupBroadcastChannelForRoom(code, peer);

  peer.on('connection', (incomingConn) => {
    const incomingPeerId = incomingConn && typeof incomingConn.peer === 'string' ? incomingConn.peer : null;
    const incomingClientId =
      incomingConn &&
      incomingConn.metadata &&
      typeof incomingConn.metadata.clientId === 'string' &&
      incomingConn.metadata.clientId
        ? incomingConn.metadata.clientId
        : null;

    const isSameClient = Boolean(
      net.guestClientId && incomingClientId && net.guestClientId === incomingClientId
    );
    const isSameRemotePeer = Boolean(incomingPeerId && net.remotePeerId && incomingPeerId === net.remotePeerId);
    const isPendingPeer = Boolean(
      incomingPeerId && net.pendingClaimConn && net.pendingClaimConn.peer === incomingPeerId
    );
    const isClaimedOwner = isSameClient || (!incomingClientId && (isSameRemotePeer || isPendingPeer));

    const isGameActive =
      net.mode === 'online' &&
      (gameState.status === 'playing' || gameState.status === 'secret_pick');
    const isStalePending = Boolean(
      net.mode === 'waiting' &&
        !net.guestClientId &&
        net.pendingClaimConn &&
        !net.pendingClaimConn.open &&
        Date.now() - net.pendingClaimAt > 6000
    );
    const slotTakenByAnother = Boolean(
      (net.roomLocked || net.pendingClaimConn || net.guestClientId || isLogicalConnOpen(net.conn)) &&
        !isClaimedOwner &&
        !isStalePending
    );

    if (slotTakenByAnother) {
      const rejectIntruder = () => {
        sendPacket(incomingConn, { type: 'room_locked' });
        setTimeout(() => {
          try {
            incomingConn.close();
          } catch (_) {}
        }, 150);
      };
      if (incomingConn.open) rejectIntruder();
      else incomingConn.on('open', rejectIntruder);
      return;
    }

    if (net.conn && net.conn !== incomingConn) {
      try {
        net.conn.close();
      } catch (_) {}
    }
    const wasDisconnected = opponentDisconnected;
    net.conn = incomingConn;
    net.pendingClaimConn = incomingConn;
    net.pendingClaimAt = Date.now();
    net.roomLocked = true;
    if (incomingPeerId) net.remotePeerId = incomingPeerId;
    if (incomingClientId && !net.guestClientId) net.guestClientId = incomingClientId;
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();

    const activateGuest = () => {
      if (net.conn !== incomingConn) return;
      if (net.pendingClaimConn === incomingConn) {
        net.pendingClaimConn = null;
      }
      onHostGuestChannelReady(wasDisconnected);
    };

    if (incomingConn.open) activateGuest();
    else incomingConn.on('open', activateGuest);

    incomingConn.on('data', (data) => {
      if (net.conn === incomingConn) {
        if (
          data &&
          typeof data === 'object' &&
          data.type === 'hello' &&
          typeof data.clientId === 'string' &&
          data.clientId
        ) {
          if (!net.guestClientId) {
            net.guestClientId = data.clientId;
          } else if (data.clientId !== net.guestClientId) {
            sendPacket(incomingConn, { type: 'room_locked' });
            setTimeout(() => {
              try {
                incomingConn.close();
              } catch (_) {}
            }, 150);
            return;
          }
        }
        receiveDeduplicatedPacket(data, data && data._pktId);
      }
    });

    const handleConnEnd = () => {
      if (net.conn !== incomingConn || isLogicalConnOpen(incomingConn)) return;
      if (net.pendingClaimConn === incomingConn) {
        net.pendingClaimConn = null;
      }
      if (net.mode === 'waiting') {
        net.conn = null;
        net.remotePeerId = null;
        net.guestClientId = null;
        net.roomLocked = false;
      } else {
        handleTransientDisconnect();
      }
    };

    incomingConn.on('close', handleConnEnd);
    incomingConn.on('error', handleConnEnd);
  });

  peer.on('disconnected', () => {
    if (net.mode !== 'local' && !peer.destroyed) {
      try {
        peer.reconnect();
      } catch (_) {}
    }
  });

  peer.on('error', (err) => {
    if (err && err.type === 'unavailable-id' && retryCount < 4) {
      createGameRoom(retryCount + 1);
      return;
    }
    if (net.mode !== 'online' && !isLogicalConnOpen(net.conn)) {
      cleanupNetworkSession();
      setGameFeedback('Could not create game room. Please check your connection and try again.');
      renderAll();
    }
  });
}

function joinGameRoom(rawCode) {
  const code = extractCleanGameCode(rawCode);
  if (code.length !== 5) {
    setGameFeedback('Please enter a valid 5-character game code.');
    return;
  }
  if (typeof Peer === 'undefined') {
    setGameFeedback('Networking library failed to load. Check your internet connection.');
    return;
  }

  syncMyNameFromInput();
  const savedName = net.myName;
  cleanupNetworkSession();
  net.myName = savedName;
  setGameFeedback('');

  net.mode = 'joining';
  net.role = 'guest';
  net.roomCode = code;
  const hostPeerId = PEER_ID_PREFIX + code;
  net.remotePeerId = hostPeerId;
  if (dom.joinInput) dom.joinInput.value = code;
  renderAll();

  const guestPeerId = PEER_ID_PREFIX + code + '-g-' + Math.random().toString(36).slice(2, 8);
  const peer = new Peer(guestPeerId, { config: PEER_ICE_CONFIG });
  net.peer = peer;
  setupPeerRelayHook(peer);
  setupBroadcastChannelForRoom(code, peer);

  if (net.bcChannel) {
    sendViaBroadcastChannel({
      __chessRelay: true,
      kind: 'open',
      name: net.myName,
      clientId: net.localClientId,
      reconnect: false
    });
  }

  net.joinTimer = setTimeout(() => {
    if (net.mode === 'joining') {
      cleanupNetworkSession();
      setGameFeedback(`Could not connect to game ${code}. Check the code and try again.`);
      renderAll();
    }
  }, 15000);

  peer.on('disconnected', () => {
    if (net.mode !== 'local' && !peer.destroyed) {
      try {
        peer.reconnect();
      } catch (_) {}
    }
  });

  let initialJoinStarted = false;
  peer.on('open', () => {
    if (net.peer !== peer || initialJoinStarted || net.mode !== 'joining') return;
    initialJoinStarted = true;

    const attemptRelayAndHello = () => {
      if (net.peer !== peer || net.mode !== 'joining') return;
      if (hasActiveSignalingSocket(peer)) {
        sendRawSignalingEnvelope(
          hostPeerId,
          {
            __chessRelay: true,
            kind: 'open',
            name: net.myName,
            clientId: net.localClientId,
            reconnect: false
          },
          peer
        );
      }
      if (net.bcChannel) {
        sendViaBroadcastChannel({
          __chessRelay: true,
          kind: 'open',
          name: net.myName,
          clientId: net.localClientId,
          reconnect: false
        });
      }
    };

    attemptRelayAndHello();
    if (hasActiveSignalingSocket(peer) || net.bcChannel) {
      net.joinRetryTimer = setInterval(attemptRelayAndHello, 1200);
    }

    const conn = peer.connect(hostPeerId, {
      metadata: { clientId: net.localClientId, reconnect: false }
    });
    net.conn = conn;

    const sendHello = () => {
      sendPacket(conn, {
        type: 'hello',
        name: net.myName,
        clientId: net.localClientId,
        reconnect: false
      });
      startHeartbeat();
    };

    if (conn.open) sendHello();
    else conn.on('open', sendHello);

    conn.on('data', (data) => {
      if (net.conn === conn) {
        receiveDeduplicatedPacket(data, data && data._pktId);
      }
    });

    conn.on('close', () => {
      if (net.conn === conn && !isLogicalConnOpen(conn)) {
        if (net.mode === 'joining') {
          cleanupNetworkSession();
          setGameFeedback(`Connection to game ${code} closed.`);
        } else {
          handleTransientDisconnect();
        }
      }
    });

    conn.on('error', () => {
      if (net.conn === conn && !isLogicalConnOpen(conn)) {
        if (net.mode === 'joining') {
          cleanupNetworkSession();
          setGameFeedback(`Failed to connect to game ${code}.`);
        } else {
          handleTransientDisconnect();
        }
      }
    });
  });

  peer.on('error', (err) => {
    if (net.peer !== peer) return;
    if (net.mode === 'online' && isLogicalConnOpen(net.conn)) return;
    const notFound = err && err.type === 'peer-unavailable';
    cleanupNetworkSession();
    setGameFeedback(
      notFound
        ? `Game ${code} was not found. Make sure the host still has the room open.`
        : 'Network error while joining game. Please try again.'
    );
    renderAll();
  });
}
