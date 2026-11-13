/* Viewport Tab Switching, Feedback Banner, Invite Share & P2P Chat (Badges + Emojis) */
'use strict';

function sanitizeChatText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, CHAT_MAX_TEXT_LENGTH);
}

function tokenizeChatText(raw) {
  const str = typeof raw === 'string' ? raw : '';
  const tokens = [];
  const re = /:([a-z]{2,14}):/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(str)) !== null) {
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(CHESS_CHAT_BADGES, key)) {
      continue;
    }
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: str.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'badge', key });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < str.length) {
    tokens.push({ type: 'text', value: str.slice(lastIndex) });
  }
  return tokens;
}

function isStickerOnlyChatTokens(tokens) {
  let badgeCount = 0;
  for (const tok of tokens) {
    if (tok.type === 'badge') {
      badgeCount++;
    } else if (tok.type === 'text' && tok.value.trim().length > 0) {
      return false;
    }
  }
  return badgeCount >= 1 && badgeCount <= 3;
}

function normalizeIncomingChatPacket(data) {
  if (!data || typeof data !== 'object' || data.type !== 'chat_msg') return null;
  const text = sanitizeChatText(data.text);
  if (!text) return null;
  const rawId = typeof data.id === 'string' ? data.id.slice(0, 80) : '';
  const id = rawId || `peer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ts = Number.isFinite(data.ts) && data.ts > 0 ? Math.floor(data.ts) : Date.now();
  const senderName = sanitizePlayerName(data.senderName || net.peerName || 'Opponent');
  return { id, ts, text, senderName };
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 900;
}

function scrollBoardIntoViewOnMobile() {
  if (isMobileViewport() && typeof window.scrollTo === 'function') {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }
}

function scrollElementIntoViewOnMobile(el) {
  if (isMobileViewport() && el && typeof el.scrollIntoView === 'function') {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (_) {
      el.scrollIntoView(false);
    }
  }
}

function isChatCurrentlyVisible() {
  if (isMobileViewport()) {
    return dom.sidebar?.dataset.mobileTab === 'chat';
  }
  return desktopSidebarTab === 'chat';
}

function syncChatUnreadState() {
  if (isChatCurrentlyVisible() && unreadChatCount > 0) {
    unreadChatCount = 0;
  }
  renderChatBadges();
}

function setDesktopTab(tabName) {
  desktopSidebarTab = tabName === 'chat' ? 'chat' : 'moves';
  if (dom.desktopTabMoves) {
    const isMoves = desktopSidebarTab === 'moves';
    dom.desktopTabMoves.classList.toggle('active', isMoves);
    if (typeof dom.desktopTabMoves.setAttribute === 'function') {
      dom.desktopTabMoves.setAttribute('aria-selected', String(isMoves));
    }
  }
  if (dom.desktopTabChat) {
    const isChat = desktopSidebarTab === 'chat';
    dom.desktopTabChat.classList.toggle('active', isChat);
    if (typeof dom.desktopTabChat.setAttribute === 'function') {
      dom.desktopTabChat.setAttribute('aria-selected', String(isChat));
    }
  }
  if (dom.movesSection) {
    dom.movesSection.classList.toggle('hidden', desktopSidebarTab === 'chat');
  }
  if (dom.chatSection) {
    dom.chatSection.classList.toggle('hidden', desktopSidebarTab !== 'chat');
  }
  if (desktopSidebarTab === 'chat') {
    unreadChatCount = 0;
    renderChatBadges();
    scrollChatToBottom();
  }
}

function setMobileTab(tabName) {
  const valid = ['play', 'variants', 'moves', 'chat'].includes(tabName) ? tabName : 'play';
  if (dom.sidebar) {
    dom.sidebar.dataset.mobileTab = valid;
  }
  if (dom.mobileTabs) {
    for (const btn of dom.mobileTabs.querySelectorAll('.mobile-tab-btn')) {
      btn.classList.toggle('active', btn.dataset.tab === valid);
    }
  }
  if (valid === 'chat') {
    unreadChatCount = 0;
    renderChatBadges();
    scrollChatToBottom();
  }
}

function setGameFeedback(msg) {
  if (gameFeedbackClearTimer) {
    clearTimeout(gameFeedbackClearTimer);
    gameFeedbackClearTimer = null;
  }
  if (!dom.gameFeedback) return;
  if (!msg) {
    dom.gameFeedback.textContent = '';
    dom.gameFeedback.classList.add('hidden');
  } else {
    dom.gameFeedback.textContent = msg;
    dom.gameFeedback.classList.remove('hidden');
  }
}

function showTransientFeedback(msg, durationMs = 3000) {
  setGameFeedback(msg);
  if (!msg) return;
  gameFeedbackClearTimer = setTimeout(() => {
    gameFeedbackClearTimer = null;
    if (dom.gameFeedback && dom.gameFeedback.textContent === msg) {
      setGameFeedback('');
    }
  }, durationMs);
}

async function copyTextWithFeedback(text, btnEl, defaultLabel) {
  try {
    await navigator.clipboard.writeText(text);
    if (btnEl) {
      btnEl.textContent = 'Copied!';
      setTimeout(() => {
        btnEl.textContent = defaultLabel;
      }, 1500);
    }
  } catch (_) {
    setGameFeedback(text);
  }
}

async function shareCurrentInviteLink(fallbackBtnEl, fallbackDefaultLabel) {
  if (!net.roomCode) return;
  const inviteUrl = buildInviteUrl(net.roomCode);
  const vName = getVariantDef(getInviteVariantSlug()).name;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `${vName} — Chess Invite`,
        text: `Play ${vName} with me! Code: ${net.roomCode}`,
        url: inviteUrl
      });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  copyTextWithFeedback(inviteUrl, fallbackBtnEl, fallbackDefaultLabel);
}

function copyCurrentInviteLink(btnEl, defaultLabel) {
  if (!net.roomCode) return;
  copyTextWithFeedback(buildInviteUrl(net.roomCode), btnEl, defaultLabel);
}

function formatChatTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function scrollChatToBottom() {
  if (dom.chatMessages) {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }
}

function renderChatBadges() {
  const countText = unreadChatCount > 99 ? '99+' : String(unreadChatCount);
  const hasUnread = unreadChatCount > 0;

  if (dom.desktopChatBadge) {
    dom.desktopChatBadge.textContent = countText;
    dom.desktopChatBadge.classList.toggle('hidden', !hasUnread);
  }
  if (dom.mobileChatBadge) {
    dom.mobileChatBadge.textContent = countText;
    dom.mobileChatBadge.classList.toggle('hidden', !hasUnread);
  }
  if (dom.mobileChatPillBadge) {
    dom.mobileChatPillBadge.textContent = countText;
    dom.mobileChatPillBadge.classList.toggle('hidden', !hasUnread);
  }
  if (dom.mobileChatPill) {
    const showPill = net.mode === 'online' || chatMessages.length > 0;
    dom.mobileChatPill.classList.toggle('hidden', !showPill);
    dom.mobileChatPill.classList.toggle('has-unread', hasUnread);
  }
}

function createSvgChild(tag, attrs = {}) {
  const el =
    typeof document.createElementNS === 'function'
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
  if (el && typeof el.setAttribute === 'function') {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
  }
  return el;
}

function createChessBadgeElement(key, className = 'chess-inline-badge') {
  const def = Object.prototype.hasOwnProperty.call(CHESS_CHAT_BADGES, key)
    ? CHESS_CHAT_BADGES[key]
    : null;
  if (!def) return document.createTextNode(`:${key}:`);

  const svg = createSvgChild('svg', {
    viewBox: '0 0 32 32',
    class: className,
    role: 'img',
    'aria-label': `${def.label} (${def.symbol})`
  });
  if (typeof svg.setAttribute === 'function') {
    svg.setAttribute('title', `${def.label} (${def.symbol})`);
  }

  svg.appendChild(
    createSvgChild('circle', {
      cx: 16,
      cy: 16,
      r: 14.5,
      fill: def.bg,
      stroke: def.ring,
      'stroke-width': 1.4
    })
  );
  svg.appendChild(
    createSvgChild('path', {
      d: 'M7.5 11.2a11.5 11.5 0 0 1 17 0',
      fill: 'none',
      stroke: 'rgba(255,255,255,0.28)',
      'stroke-width': 1.4,
      'stroke-linecap': 'round'
    })
  );

  if (def.text) {
    const txt = createSvgChild('text', {
      x: 16,
      y: 21.5,
      'text-anchor': 'middle',
      fill: '#ffffff',
      'font-family': 'system-ui, -apple-system, Segoe UI, Arial, sans-serif',
      'font-weight': '900',
      'font-size': def.fs || 15,
      'letter-spacing': def.text.length > 1 ? '-0.6' : '0'
    });
    txt.textContent = def.text;
    svg.appendChild(txt);
  } else if (def.icon === 'star') {
    svg.appendChild(
      createSvgChild('polygon', {
        points: '16,6.8 18.8,12.5 25.2,13.4 20.6,17.9 21.7,24.2 16,21.2 10.3,24.2 11.4,17.9 6.8,13.4 13.2,12.5',
        fill: '#ffffff'
      })
    );
  } else if (def.icon === 'thumb') {
    svg.appendChild(
      createSvgChild('path', {
        d: 'M14.3 8.4c.6 0 1.1.4 1.2 1l.4 3.2h4.4c1.3 0 2.3 1.2 1.9 2.5l-1.3 5.2c-.3 1-1.2 1.7-2.2 1.7H13V12.8l1.2-3.9c.1-.3.1-.5.1-.5zM9 13h2.6v9H9v-9z',
        fill: '#ffffff'
      })
    );
  } else if (def.icon === 'check') {
    svg.appendChild(
      createSvgChild('path', {
        d: 'M9.6 16.6l4.2 4.2 8.6-9.1',
        fill: 'none',
        stroke: '#ffffff',
        'stroke-width': 3.2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      })
    );
  } else if (def.icon === 'book') {
    svg.appendChild(
      createSvgChild('path', {
        d: 'M7.5 10.6c2.7-.9 5.5-.6 7.7.7v11.4c-2.2-1.2-5-1.5-7.7-.6V10.6zm17 0c-2.7-.9-5.5-.6-7.7.7v11.4c2.2-1.2 5-1.5 7.7-.6V10.6z',
        fill: '#ffffff'
      })
    );
  } else if (def.icon === 'miss') {
    svg.appendChild(
      createSvgChild('path', {
        d: 'M10.8 10.8l10.4 10.4M21.2 10.8L10.8 21.2',
        fill: 'none',
        stroke: '#ffffff',
        'stroke-width': 3.2,
        'stroke-linecap': 'round'
      })
    );
  }

  return svg;
}

function renderChatEmojiPicker() {
  if (!dom.chatEmojiPicker) return;

  const badgeSection = document.createElement('div');
  badgeSection.className = 'chat-picker-section';
  const badgeLabel = document.createElement('span');
  badgeLabel.className = 'chat-picker-label';
  badgeLabel.textContent = 'Chess.com Reactions';
  badgeSection.appendChild(badgeLabel);

  const badgeGrid = document.createElement('div');
  badgeGrid.className = 'chat-badge-grid';
  for (const [key, def] of Object.entries(CHESS_CHAT_BADGES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chess-badge-btn';
    btn.dataset.chatBadge = key;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('title', `${def.label} (${def.symbol}) — inserts :${key}:`);
      btn.setAttribute('aria-label', `${def.label} ${def.symbol}`);
    }
    btn.appendChild(createChessBadgeElement(key, 'chess-inline-badge'));
    const nameEl = document.createElement('span');
    nameEl.className = 'chat-badge-name';
    nameEl.textContent = def.label;
    btn.appendChild(nameEl);
    btn.addEventListener('click', () => insertChatToken(`:${key}:`, true));
    badgeGrid.appendChild(btn);
  }
  badgeSection.appendChild(badgeGrid);

  const emojiSection = document.createElement('div');
  emojiSection.className = 'chat-picker-section';
  const emojiLabel = document.createElement('span');
  emojiLabel.className = 'chat-picker-label';
  emojiLabel.textContent = 'Emojis';
  emojiSection.appendChild(emojiLabel);

  const emojiGrid = document.createElement('div');
  emojiGrid.className = 'chat-emoji-grid';
  for (const emoji of CHAT_QUICK_EMOJIS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-emoji-item';
    btn.textContent = emoji;
    btn.dataset.chatEmoji = emoji;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-label', `Insert ${emoji}`);
    }
    btn.addEventListener('click', () => insertChatToken(emoji, false));
    emojiGrid.appendChild(btn);
  }
  emojiSection.appendChild(emojiGrid);

  dom.chatEmojiPicker.replaceChildren(badgeSection, emojiSection);
}

function setChatEmojiPickerOpen(open) {
  chatPickerOpen = Boolean(open) && net.mode === 'online' && !opponentDisconnected;
  if (dom.chatEmojiPicker) {
    dom.chatEmojiPicker.classList.toggle('hidden', !chatPickerOpen);
  }
  if (dom.chatEmojiBtn) {
    dom.chatEmojiBtn.classList.toggle('active', chatPickerOpen);
    if (typeof dom.chatEmojiBtn.setAttribute === 'function') {
      dom.chatEmojiBtn.setAttribute('aria-expanded', String(chatPickerOpen));
    }
  }
}

function openChatEmojiPicker() {
  if (dom.chatEmojiPicker && !dom.chatEmojiPicker.children?.length) {
    renderChatEmojiPicker();
  }
  setChatEmojiPickerOpen(true);
}

function closeChatEmojiPicker() {
  setChatEmojiPickerOpen(false);
}

function toggleChatEmojiPicker() {
  if (chatPickerOpen) {
    closeChatEmojiPicker();
  } else {
    openChatEmojiPicker();
  }
}

function insertChatToken(token, padWithSpaces = false) {
  if (!dom.chatTextInput || dom.chatTextInput.disabled) return;
  const cur = dom.chatTextInput.value || '';
  const start =
    typeof dom.chatTextInput.selectionStart === 'number' ? dom.chatTextInput.selectionStart : cur.length;
  const end =
    typeof dom.chatTextInput.selectionEnd === 'number' ? dom.chatTextInput.selectionEnd : start;
  const before = cur.slice(0, start);
  const after = cur.slice(end);
  const lead = padWithSpaces && before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trail = padWithSpaces ? ' ' : '';
  const inserted = `${lead}${token}${trail}`;
  const nextVal = (before + inserted + after).slice(0, CHAT_MAX_TEXT_LENGTH);
  dom.chatTextInput.value = nextVal;
  const caret = Math.min(nextVal.length, before.length + inserted.length);
  if (typeof dom.chatTextInput.setSelectionRange === 'function' && !isMobileViewport()) {
    dom.chatTextInput.focus();
    dom.chatTextInput.setSelectionRange(caret, caret);
  }
}

function setChatStatusNote(noteText) {
  if (dom.chatStatusNote) {
    dom.chatStatusNote.textContent = noteText;
    dom.chatStatusNote.classList.toggle('hidden', !noteText);
  }
}

function renderChatMessages(forceRebuild = false) {
  if (!dom.chatMessages) return;
  const lastId = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].id : '';
  const sig = `${chatMessages.length}:${lastId}:${net.myName || ''}`;
  if (!forceRebuild && sig === lastRenderedChatSig) return;
  lastRenderedChatSig = sig;

  if (chatMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent =
      net.mode === 'online'
        ? 'No messages yet. Say hi or send a Chess.com badge!'
        : 'Connect with a friend online to chat peer-to-peer.';
    dom.chatMessages.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const msg of chatMessages) {
    const bubble = document.createElement('div');
    bubble.className = `chat-msg ${msg.mine ? 'mine' : 'peer'}`;

    const meta = document.createElement('div');
    meta.className = 'chat-msg-meta';
    const who = document.createElement('span');
    who.textContent = msg.mine ? net.myName || 'You' : msg.senderName || 'Opponent';
    const timeEl = document.createElement('span');
    timeEl.textContent = formatChatTimestamp(msg.ts);
    meta.append(who, timeEl);
    bubble.appendChild(meta);

    if (msg.text) {
      const tokens = tokenizeChatText(msg.text);
      const stickerOnly = isStickerOnlyChatTokens(tokens);
      const p = document.createElement('p');
      p.className = stickerOnly ? 'chat-msg-text sticker-only' : 'chat-msg-text';
      const badgeClass = stickerOnly ? 'chess-sticker-badge' : 'chess-inline-badge';
      for (const tok of tokens) {
        if (tok.type === 'badge') {
          p.appendChild(createChessBadgeElement(tok.key, badgeClass));
        } else if (!stickerOnly && tok.value) {
          p.appendChild(document.createTextNode(tok.value));
        }
      }
      bubble.appendChild(p);
    }

    frag.appendChild(bubble);
  }

  dom.chatMessages.replaceChildren(frag);
  scrollChatToBottom();
}

function renderChatUI() {
  const onlineReady = net.mode === 'online' && !opponentDisconnected;
  if (dom.chatStatusPill) {
    dom.chatStatusPill.textContent = onlineReady
      ? `Connected • ${net.peerName || 'Opponent'}`
      : net.mode === 'online'
        ? 'Reconnecting...'
        : 'Offline';
    dom.chatStatusPill.classList.toggle('live', onlineReady);
  }

  if (dom.chatTextInput) dom.chatTextInput.disabled = !onlineReady;
  if (dom.chatEmojiBtn) dom.chatEmojiBtn.disabled = !onlineReady;
  if (dom.chatSendBtn) dom.chatSendBtn.disabled = !onlineReady;
  if (!onlineReady && chatPickerOpen) {
    closeChatEmojiPicker();
  }

  if (!onlineReady) {
    setChatStatusNote(
      net.mode === 'online'
        ? 'Connection paused — chat resumes when your opponent reconnects.'
        : 'Join or create an online game to chat.'
    );
  } else {
    setChatStatusNote('');
  }

  renderChatBadges();
  renderChatMessages();
}

function appendChatMessage(entry, fromPeer) {
  if (!entry || !entry.id) return false;
  if (seenChatIds.has(entry.id)) return false;
  seenChatIds.add(entry.id);
  if (seenChatIds.size > 400) {
    const oldest = seenChatIds.values().next().value;
    if (oldest !== undefined) seenChatIds.delete(oldest);
  }

  chatMessages.push({
    id: entry.id,
    ts: entry.ts || Date.now(),
    mine: Boolean(entry.mine),
    senderName: entry.senderName || (entry.mine ? net.myName || 'You' : net.peerName || 'Opponent'),
    text: entry.text || ''
  });
  if (chatMessages.length > CHAT_MAX_MESSAGES) {
    chatMessages = chatMessages.slice(-CHAT_MAX_MESSAGES);
  }

  if (fromPeer) {
    playSound('chat');
    if (!isChatCurrentlyVisible()) {
      unreadChatCount++;
    }
  }
  renderChatUI();
  return true;
}

function handleIncomingChatPacket(data) {
  const normalized = normalizeIncomingChatPacket(data);
  if (!normalized) return false;
  return appendChatMessage(
    {
      ...normalized,
      mine: false
    },
    true
  );
}

function sendChatMessage(rawText) {
  if (net.mode !== 'online' || opponentDisconnected || !isLogicalConnOpen(net.conn)) {
    setChatStatusNote('Chat is available while connected to an online opponent.');
    return false;
  }
  const text = sanitizeChatText(rawText);
  if (!text) return false;

  const id = `c_${net.localClientId}_${Date.now()}_${++net.txSeq}`;
  const ts = Date.now();
  const payload = {
    type: 'chat_msg',
    id,
    ts,
    senderName: net.myName || 'Guest',
    text
  };

  appendChatMessage(
    {
      id,
      ts,
      mine: true,
      senderName: net.myName || 'You',
      text
    },
    false
  );
  closeChatEmojiPicker();
  if (dom.chatTextInput) dom.chatTextInput.value = '';
  sendPacket(net.conn, payload);
  return true;
}
