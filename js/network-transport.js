/* Hybrid Triple-Transport (WebRTC + WSS Signaling Relay + BroadcastChannel) & Chunking */
'use strict';

function hasActiveSignalingSocket(peer = net.peer) {
  return Boolean(
    peer &&
      !peer.destroyed &&
      !peer.disconnected &&
      peer.socket &&
      typeof peer.socket.send === 'function'
  );
}

function isLogicalConnOpen(conn = net.conn) {
  if (conn && conn.open) return true;
  if (net.relayOpen && hasActiveSignalingSocket(net.peer)) return true;
  if (net.bcOpen && net.bcChannel) return true;
  return false;
}

function sendRawSignalingEnvelope(dstPeerId, envelopeObj, peer = net.peer) {
  if (!dstPeerId || !hasActiveSignalingSocket(peer)) return false;
  try {
    const serialized = JSON.stringify(envelopeObj);
    if (serialized.length <= 7000) {
      peer.socket.send({
        type: 'CANDIDATE',
        dst: dstPeerId,
        payload: {
          candidate: {
            candidate: serialized,
            sdpMid: '0',
            sdpMLineIndex: 0
          },
          type: 'data',
          connectionId: '__chess_relay__'
        }
      });
    } else {
      const chunkId = net.localClientId + '_c' + ++net.txSeq;
      const chunkSize = 6500;
      const total = Math.ceil(serialized.length / chunkSize);
      for (let idx = 0; idx < total; idx++) {
        const part = JSON.stringify({
          __chessRelay: true,
          kind: 'chunk',
          id: chunkId,
          idx,
          total,
          chunk: serialized.slice(idx * chunkSize, (idx + 1) * chunkSize)
        });
        peer.socket.send({
          type: 'CANDIDATE',
          dst: dstPeerId,
          payload: {
            candidate: {
              candidate: part,
              sdpMid: '0',
              sdpMLineIndex: 0
            },
            type: 'data',
            connectionId: '__chess_relay__'
          }
        });
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

function sendViaBroadcastChannel(envelopeObj) {
  if (!net.bcChannel) return false;
  try {
    net.bcChannel.postMessage({
      ...envelopeObj,
      srcClientId: net.localClientId
    });
    return true;
  } catch (_) {
    return false;
  }
}

function receiveDeduplicatedPacket(data, pktId) {
  if (!data || typeof data !== 'object') return;
  const id = typeof pktId === 'string' ? pktId : typeof data._pktId === 'string' ? data._pktId : null;
  if (id) {
    if (net.rxPktIds.has(id)) return;
    net.rxPktIds.add(id);
    if (net.rxPktIds.size > 600) {
      const first = net.rxPktIds.values().next().value;
      if (first !== undefined) net.rxPktIds.delete(first);
    }
  }
  lastHeartbeatReceived = Date.now();
  if (net.role === 'host') {
    handleHostIncomingData(data);
  } else if (net.role === 'guest') {
    handleGuestIncomingData(data);
  }
}

function sendPacket(conn, payload) {
  if (!payload || typeof payload !== 'object') return;

  // Intruder rejection on a non-primary connection
  if (conn && conn !== net.conn) {
    if (conn.open) {
      try {
        conn.send(payload);
      } catch (_) {}
    } else if (conn.peer && hasActiveSignalingSocket(net.peer)) {
      sendRawSignalingEnvelope(conn.peer, {
        __chessRelay: true,
        kind: 'pkt',
        pktId: net.localClientId + ':' + ++net.txSeq,
        data: payload
      });
    }
    return;
  }

  const useHybrid = hasActiveSignalingSocket(net.peer) || Boolean(net.bcChannel);
  if (!useHybrid) {
    if (conn && conn.open) {
      conn.send(payload);
    }
    return;
  }

  const pktId = net.localClientId + ':' + ++net.txSeq;
  const taggedPayload = { ...payload, _pktId: pktId };

  if (conn && conn.open) {
    try {
      conn.send(taggedPayload);
    } catch (_) {}
  }

  const targetPeerId = net.remotePeerId || (conn && conn.peer) || null;
  if (targetPeerId && hasActiveSignalingSocket(net.peer)) {
    sendRawSignalingEnvelope(targetPeerId, {
      __chessRelay: true,
      kind: 'pkt',
      pktId,
      data: taggedPayload
    });
  }

  if (net.bcChannel && net.bcOpen) {
    sendViaBroadcastChannel({
      __chessRelay: true,
      kind: 'pkt',
      pktId,
      data: taggedPayload
    });
  }
}

function sendCurrentMatchStartPacket() {
  if (net.role !== 'host') return;
  const guestColor = net.myColor === 'w' ? 'b' : 'w';
  if (!net.currentMatchId) {
    net.currentMatchId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }
  sendPacket(net.conn, {
    type: 'match_start',
    matchId: net.currentMatchId,
    yourColor: guestColor,
    hostName: net.myName,
    guestName: net.peerName,
    state: serializeStateForPeer(gameState, guestColor),
    clock: serializeClockPayload()
  });
}

function onHostGuestChannelReady(wasActuallyDisconnected = false) {
  if (net.role !== 'host') return;
  if (net.mode === 'waiting') {
    net.mode = 'online';
    net.roomLocked = true;
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();
    startHeartbeat();
    setGameFeedback('');
    startNewMatchAsHost(false);
    return;
  }
  if (net.mode === 'online') {
    const shouldAnnounceReconnect = Boolean(opponentDisconnected || wasActuallyDisconnected);
    opponentDisconnected = false;
    clearOpponentDisconnectGraceTimer();
    startHeartbeat();
    if (shouldAnnounceReconnect) {
      showTransientFeedback('Opponent reconnected!');
    }
    if (gameState.moveHistory.length === 0) {
      sendCurrentMatchStartPacket();
    }
    broadcastHostState();
    renderAll();
  }
}

function handleDecodedRelayEnvelope(srcId, env, via) {
  if (!env || typeof env !== 'object' || !env.__chessRelay) return;
  if (env.targetClientId && env.targetClientId !== net.localClientId) return;

  if (env.kind === 'chunk') {
    if (typeof env.id !== 'string' || typeof env.chunk !== 'string') return;
    const total = Number(env.total);
    const idx = Number(env.idx);
    if (!Number.isInteger(total) || total < 1 || total > 64 || !Number.isInteger(idx) || idx < 0 || idx >= total) {
      return;
    }
    let entry = net.relayChunks.get(env.id);
    if (!entry) {
      if (net.relayChunks.size > 30) {
        const oldestKey = net.relayChunks.keys().next().value;
        if (oldestKey !== undefined) net.relayChunks.delete(oldestKey);
      }
      entry = { parts: new Array(total).fill(null), received: 0, total };
      net.relayChunks.set(env.id, entry);
    }
    if (entry.parts[idx] === null) {
      entry.parts[idx] = env.chunk;
      entry.received++;
    }
    if (entry.received === entry.total) {
      net.relayChunks.delete(env.id);
      try {
        const fullEnv = JSON.parse(entry.parts.join(''));
        handleDecodedRelayEnvelope(srcId, fullEnv, via);
      } catch (_) {}
    }
    return;
  }

  if (env.kind === 'open') {
    if (net.role !== 'host') return;
    const incomingClientId =
      (typeof env.clientId === 'string' && env.clientId) ||
      (typeof env.srcClientId === 'string' && env.srcClientId) ||
      null;
    const sameLockedClient = Boolean(
      net.guestClientId && incomingClientId && net.guestClientId === incomingClientId
    );
    const legacySameTransportPeer = Boolean(
      !net.guestClientId &&
        !incomingClientId &&
        ((via === 'relay' && net.remotePeerId && net.remotePeerId === srcId) ||
          (via === 'bc' && net.bcPeerId && net.bcPeerId === srcId))
    );
    const isClaimedSameGuest = sameLockedClient || legacySameTransportPeer;

    const isWaitingAndFree =
      net.mode === 'waiting' &&
      !net.roomLocked &&
      !net.guestClientId &&
      !net.pendingClaimConn;
    const isStalePendingClaim = Boolean(
      net.mode === 'waiting' &&
        !net.guestClientId &&
        net.pendingClaimConn &&
        !net.pendingClaimConn.open &&
        Date.now() - net.pendingClaimAt > 6000
    );
    const isOnlineMatch = net.mode === 'online';

    const canEnter =
      isWaitingAndFree ||
      isStalePendingClaim ||
      (isClaimedSameGuest && (isOnlineMatch || net.mode === 'waiting'));

    if (!canEnter) {
      const lockEnv = {
        __chessRelay: true,
        kind: 'pkt',
        pktId: net.localClientId + ':' + ++net.txSeq,
        targetClientId: incomingClientId || undefined,
        data: { type: 'room_locked' }
      };
      if (via === 'relay') sendRawSignalingEnvelope(srcId, lockEnv);
      else if (via === 'bc') sendViaBroadcastChannel(lockEnv);
      return;
    }

    if (incomingClientId && !net.guestClientId) {
      net.guestClientId = incomingClientId;
    }
    net.roomLocked = true;
    if (isStalePendingClaim && net.pendingClaimConn) {
      try {
        net.pendingClaimConn.close();
      } catch (_) {}
      net.pendingClaimConn = null;
    }

    if (via === 'relay') {
      net.remotePeerId = srcId;
      net.relayOpen = true;
    } else if (via === 'bc') {
      net.bcPeerId = srcId;
      net.bcOpen = true;
    }
    if (typeof env.name === 'string') {
      net.peerName = sanitizePlayerName(env.name);
    }

    const ackEnv = {
      __chessRelay: true,
      kind: 'open_ack',
      targetClientId: incomingClientId || undefined,
      hostName: net.myName,
      matchId: net.currentMatchId
    };
    if (via === 'relay') sendRawSignalingEnvelope(srcId, ackEnv);
    else if (via === 'bc') sendViaBroadcastChannel(ackEnv);

    onHostGuestChannelReady(Boolean(opponentDisconnected));
    return;
  }

  if (env.kind === 'open_ack') {
    if (net.role !== 'guest') return;
    if (via === 'relay') {
      net.remotePeerId = srcId || net.remotePeerId;
      net.relayOpen = true;
    } else if (via === 'bc') {
      net.bcPeerId = srcId || net.bcPeerId;
      net.bcOpen = true;
    }
    lastHeartbeatReceived = Date.now();
    if (opponentDisconnected) {
      guestReconnectAttempts = 0;
      clearOpponentDisconnectGraceTimer();
      opponentDisconnected = false;
      showTransientFeedback('Reconnected to game!');
    }
    startHeartbeat();
    sendPacket(net.conn, {
      type: 'hello',
      name: net.myName,
      clientId: net.localClientId,
      reconnect: net.mode === 'online'
    });
    return;
  }

  if (env.kind === 'close') {
    const matchesClient = Boolean(
      net.guestClientId && env.srcClientId && env.srcClientId === net.guestClientId
    );
    const matchesRemote =
      matchesClient ||
      (via === 'relay' && srcId === net.remotePeerId) ||
      (via === 'bc' && srcId === net.bcPeerId);
    if (!matchesRemote) return;
    if (via === 'relay') net.relayOpen = false;
    if (via === 'bc') net.bcOpen = false;
    if (!isLogicalConnOpen(net.conn)) {
      handleTransientDisconnect();
    }
    return;
  }

  if (env.kind === 'pkt' && env.data) {
    if (net.role === 'host') {
      const pktClientId =
        (typeof env.srcClientId === 'string' && env.srcClientId) ||
        (typeof env.data.clientId === 'string' && env.data.clientId) ||
        null;
      if (net.roomLocked && net.guestClientId && pktClientId && pktClientId !== net.guestClientId) {
        return;
      }
      const isKnownTransport =
        (via === 'relay' && net.remotePeerId === srcId) ||
        (via === 'bc' && net.bcPeerId === srcId) ||
        (net.guestClientId && pktClientId === net.guestClientId);
      if (net.roomLocked && !isKnownTransport && (!net.guestClientId || pktClientId !== net.guestClientId)) {
        return;
      }
    }
    if (via === 'relay') {
      net.remotePeerId = net.remotePeerId || srcId;
      net.relayOpen = true;
    } else if (via === 'bc') {
      net.bcPeerId = net.bcPeerId || srcId;
      net.bcOpen = true;
    }
    receiveDeduplicatedPacket(env.data, env.pktId);
  }
}

function setupPeerRelayHook(peer) {
  if (!peer || !peer.socket || typeof peer._handleMessage !== 'function' || peer._chessRelayHooked) {
    return;
  }
  peer._chessRelayHooked = true;
  const origHandleMessage = peer._handleMessage.bind(peer);
  peer._handleMessage = function (msg) {
    if (
      msg &&
      msg.type === 'CANDIDATE' &&
      msg.payload &&
      msg.payload.connectionId === '__chess_relay__'
    ) {
      const rawStr = msg.payload.candidate && msg.payload.candidate.candidate;
      if (typeof rawStr === 'string') {
        try {
          const env = JSON.parse(rawStr);
          handleDecodedRelayEnvelope(msg.src, env, 'relay');
        } catch (_) {}
      }
      return;
    }
    if (msg && msg.type === 'LEAVE' && msg.src && msg.src === net.remotePeerId) {
      net.relayOpen = false;
      origHandleMessage(msg);
      if (!isLogicalConnOpen(net.conn)) {
        handleTransientDisconnect();
      }
      return;
    }
    return origHandleMessage(msg);
  };
}

function setupBroadcastChannelForRoom(code, peer) {
  if (!peer || !peer.socket) return;
  if (typeof BroadcastChannel === 'undefined') return;
  if (net.bcChannel) {
    try {
      net.bcChannel.close();
    } catch (_) {}
    net.bcChannel = null;
  }
  try {
    const bc = new BroadcastChannel('chessgame-v2-bc-' + code);
    net.bcChannel = bc;
    bc.onmessage = (ev) => {
      const env = ev && ev.data;
      if (!env || typeof env !== 'object' || !env.__chessRelay) return;
      if (env.srcClientId === net.localClientId) return;
      handleDecodedRelayEnvelope(env.srcClientId || 'bc_peer', env, 'bc');
    };
  } catch (_) {
    net.bcChannel = null;
  }
}
