/* Pointer Input, Drag-and-Drop & Right-Click Tactical Arrow Drawing */
'use strict';

// --- Pointer Input (Click-to-Move, Drag-and-Drop, Pocket Drops, Multi-Premoves & Right-Click Arrows) ---

function clientPointToSquare(clientX, clientY) {
  if (!dom.board) return null;
  const rect = dom.board.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX >= rect.right ||
    clientY < rect.top ||
    clientY >= rect.bottom
  ) {
    return null;
  }
  const visCol = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
  const visRow = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
  return {
    r: boardFlipped ? 7 - visRow : visRow,
    c: boardFlipped ? 7 - visCol : visCol
  };
}

function updateDragHoverSquare(sq) {
  if (!dom.board) return;
  const prev = dom.board.querySelector('.square.drag-target');
  if (prev) prev.classList.remove('drag-target');
  drag.hoverSq = sq;
  if (sq) {
    const el = dom.board.querySelector(`.square[data-r="${sq.r}"][data-c="${sq.c}"]`);
    if (el) el.classList.add('drag-target');
  }
}

function endDragVisuals() {
  if (dom.dragGhost) {
    dom.dragGhost.classList.add('hidden');
    dom.dragGhost.classList.remove('touch-drag');
  }
  if (dom.board) {
    const hiddenPiece = dom.board.querySelector('.piece.dragging-source');
    if (hiddenPiece) hiddenPiece.classList.remove('dragging-source');
  }
  updateDragHoverSquare(null);
}

function toggleRightClickArrowOrMark(originSq, targetSq) {
  if (originSq.r === targetSq.r && originSq.c === targetSq.c) {
    if (cancelAllPremoves()) {
      return;
    }
    const idx = markedSquares.findIndex((s) => s.r === originSq.r && s.c === originSq.c);
    if (idx >= 0) markedSquares.splice(idx, 1);
    else markedSquares.push({ r: originSq.r, c: originSq.c });
    renderBoard();
  } else {
    const idx = drawnArrows.findIndex(
      (a) =>
        a.from.r === originSq.r &&
        a.from.c === originSq.c &&
        a.to.r === targetSq.r &&
        a.to.c === targetSq.c
    );
    if (idx >= 0) drawnArrows.splice(idx, 1);
    else drawnArrows.push({ from: { ...originSq }, to: { ...targetSq } });
    renderArrowsOverlay();
  }
}

function handlePocketPointerDown(e, sideColor, dropType) {
  if (dom.promoBackdrop && !dom.promoBackdrop.classList.contains('hidden')) return;
  if (e.button === 2) {
    e.preventDefault();
    cancelAllPremoves();
    return;
  }
  if (e.button !== undefined && e.button !== 0) return;
  if (!isViewingLive() || !getVariantDef(gameState).allowDrops) return;

  if (drawnArrows.length > 0 || markedSquares.length > 0) {
    clearAnnotations();
  }

  if (canPlayerMovePiece(sideColor)) {
    const pocket = gameState.pockets?.[sideColor] || [];
    if (!pocket.includes(dropType)) return;
    e.preventDefault();
    const alreadySelected = selectedPocketType === dropType;
    selectPocketPiece(dropType);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = false;
    drag.wasAlreadySelected = alreadySelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = null;
    drag.pocketType = dropType;
    drag.pocketColor = sideColor;
    return;
  }

  if (canPlayerPremovePiece(sideColor)) {
    const projPocket = getProjectedPremoveState().pockets?.[sideColor] || [];
    if (!projPocket.includes(dropType)) return;
    e.preventDefault();
    const alreadyPreSelected = premovePocketType === dropType;
    selectPremovePocket(dropType);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = true;
    drag.wasAlreadySelected = alreadyPreSelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = null;
    drag.pocketType = dropType;
    drag.pocketColor = sideColor;
  }
}

function handleBoardPointerDown(e) {
  if (dom.promoBackdrop && !dom.promoBackdrop.classList.contains('hidden')) return;

  const sq = clientPointToSquare(e.clientX, e.clientY);
  if (!sq) return;

  if (net.mode === 'editor') {
    e.preventDefault();
    if (e.button === 2) {
      editorState.board[sq.r][sq.c] = null;
      editorSelectedSq = null;
      syncEditorCastlingValidity();
      renderBoard();
      return;
    }

    if (e.button !== undefined && e.button !== 0) return;

    if (editorState.selectedTool === 'erase') {
      editorState.board[sq.r][sq.c] = null;
      editorSelectedSq = null;
      syncEditorCastlingValidity();
      renderBoard();
      return;
    }

    if (editorState.selectedTool) {
      editorState.board[sq.r][sq.c] = editorState.selectedTool;
      editorSelectedSq = null;
      syncEditorCastlingValidity();
      renderBoard();
      return;
    }

    const occupant = editorState.board[sq.r][sq.c];
    if (editorSelectedSq) {
      if (editorSelectedSq.r === sq.r && editorSelectedSq.c === sq.c) {
        editorSelectedSq = null;
      } else {
        editorState.board[sq.r][sq.c] = editorState.board[editorSelectedSq.r][editorSelectedSq.c];
        editorState.board[editorSelectedSq.r][editorSelectedSq.c] = null;
        editorSelectedSq = null;
        syncEditorCastlingValidity();
      }
      renderBoard();
      return;
    }

    if (occupant) {
      editorSelectedSq = { r: sq.r, c: sq.c };
      drag.active = true;
      drag.moved = false;
      drag.pointerId = e.pointerId;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.originSq = { r: sq.r, c: sq.c };
      drag.from = { r: sq.r, c: sq.c };
      drag.pieceCode = occupant;
      drag.isEditorDrag = true;
      drag.pointerType = e.pointerType;
      renderBoard();
      return;
    }
    return;
  }

  // Right-click (button 2): draw tactical arrows, mark squares, or cancel premoves
  if (e.button === 2) {
    e.preventDefault();
    rcDrag.active = true;
    rcDrag.pointerId = e.pointerId;
    rcDrag.originSq = sq;
    previewArrow = null;
    return;
  }

  if (e.button !== undefined && e.button !== 0) return;

  // Left-click clears any drawn right-click arrows/marks
  if (drawnArrows.length > 0 || markedSquares.length > 0) {
    clearAnnotations();
    renderBoard();
  }

  // If viewing historical move, only allow inspecting board (click >| to play)
  if (!isViewingLive()) return;

  if (gameState.status === 'secret_pick') {
    let pickColor = null;
    if (net.mode === 'online') {
      pickColor = net.myColor;
    } else {
      pickColor = !gameState.secretQueens?.w?.picked ? 'w' : 'b';
    }
    const pickRow = pickColor === 'w' ? 6 : 1;
    if (sq.r === pickRow && gameState.board[sq.r][sq.c] === pickColor + 'p') {
      secretPickCol = sq.c;
      if (dom.secretConfirmBtn) dom.secretConfirmBtn.disabled = false;
      renderBoard();
    }
    return;
  }

  const activeTurnColor = net.mode === 'online' ? net.myColor : gameState.turn;

  // 1A-Drop. Normal turn: Crazyhouse pocket piece is selected and player clicks a legal drop square -> Drop!
  if (selectedPocketType && canPlayerMovePiece(activeTurnColor)) {
    const isLegalDrop = selectedLegalMoves.some((m) => m.to.r === sq.r && m.to.c === sq.c);
    if (isLegalDrop) {
      e.preventDefault();
      submitPlayerDrop(selectedPocketType, sq, false, false);
      return;
    }
  }

  // 1A-Board. Normal turn: if friendly piece is selected and player clicks a legal target -> Move!
  if (selectedSq && canPlayerMovePiece(activeTurnColor)) {
    const isLegalTarget = selectedLegalMoves.some((m) => m.to.r === sq.r && m.to.c === sq.c);
    if (isLegalTarget) {
      e.preventDefault();
      requestOrOpenPromotion(selectedSq, sq, false);
      return;
    }
    const pinTrigger = checkSecretQueenPinInteraction(gameState, selectedSq, sq);
    if (pinTrigger) {
      e.preventDefault();
      revealSecretQueen(gameState, pinTrigger.secretColor);
      setGameFeedback('Illegal move blocked: Secret Queen revealed!');
      playSound('illegal');
      if (net.mode === 'online' && net.role === 'host') {
        broadcastHostState();
      }
      clearSelection();
      renderAll();
      return;
    }
  }

  // 1B-Drop. Opponent's turn (Premove mode): Crazyhouse pocket piece is selected -> Queue premove drop!
  if (premovePocketType && canUsePremoveMode()) {
    const isPreDrop = premoveTargets.some((t) => t.r === sq.r && t.c === sq.c);
    if (isPreDrop) {
      e.preventDefault();
      enqueuePremoveDrop(premovePocketType, sq);
      return;
    }
  }

  // 1B-Board. Opponent's turn (Premove mode): if premove origin is selected and player clicks a premove target -> Queue!
  if (premoveOriginSq && canUsePremoveMode()) {
    const isPreTarget = premoveTargets.some((t) => t.r === sq.r && t.c === sq.c);
    if (isPreTarget) {
      e.preventDefault();
      requestOrQueuePremove(premoveOriginSq, sq, false);
      return;
    }
  }

  const activeBoard = getInteractiveLiveBoard();
  const code = activeBoard[sq.r][sq.c];
  const pieceColor = getPieceColor(code);

  // 2A. Pressing on a movable piece on your turn
  if (code && canPlayerMovePiece(pieceColor)) {
    e.preventDefault();
    const alreadySelected = Boolean(selectedSq && selectedSq.r === sq.r && selectedSq.c === sq.c);
    selectSquare(sq.r, sq.c);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = false;
    drag.wasAlreadySelected = alreadySelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = sq;
    drag.pocketType = null;
    drag.pocketColor = null;
    return;
  }

  // 2B. Pressing on your piece (including projected premoved pieces!) during opponent's turn -> Premove select / drag!
  if (code && canPlayerPremovePiece(pieceColor)) {
    e.preventDefault();
    const alreadyPreSelected = Boolean(
      premoveOriginSq && premoveOriginSq.r === sq.r && premoveOriginSq.c === sq.c
    );
    selectPremoveOrigin(sq.r, sq.c);
    renderAll();

    drag.active = true;
    drag.moved = false;
    drag.isPremoveDrag = true;
    drag.wasAlreadySelected = alreadyPreSelected;
    drag.pointerId = e.pointerId;
    drag.pointerType = e.pointerType || 'mouse';
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.originSq = sq;
    drag.pocketType = null;
    drag.pocketColor = null;
    return;
  }

  // 3. Clicking empty/non-target square clears selection & cancels queued premoves
  if (
    selectedSq ||
    selectedPocketType ||
    premoveOriginSq ||
    premovePocketType ||
    premoveQueue.length > 0
  ) {
    clearSelection();
    premoveQueue = [];
    renderAll();
  }
}

function handleGlobalPointerMove(e) {
  if (rcDrag.active && e.pointerId === rcDrag.pointerId) {
    const curSq = clientPointToSquare(e.clientX, e.clientY);
    if (curSq && (curSq.r !== rcDrag.originSq.r || curSq.c !== rcDrag.originSq.c)) {
      previewArrow = { from: rcDrag.originSq, to: curSq };
    } else {
      previewArrow = null;
    }
    renderArrowsOverlay();
    return;
  }

  if (!drag.active || e.pointerId !== drag.pointerId) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const isTouchPointer = (e.pointerType || drag.pointerType) === 'touch';
  const dragThreshold = isTouchPointer ? 9 : 4;

  if (!drag.moved && Math.hypot(dx, dy) >= dragThreshold) {
    drag.moved = true;
    let originCode = null;
    if (drag.pocketType && drag.pocketColor) {
      originCode = drag.pocketColor + drag.pocketType;
    } else if (drag.originSq) {
      const displayBoard =
        net.mode === 'editor'
          ? editorState.board
          : isViewingLive()
          ? getInteractiveLiveBoard()
          : getDisplayedFrame().board;
      originCode = displayBoard[drag.originSq.r]?.[drag.originSq.c] || null;
    }
    if (!originCode) {
      drag.active = false;
      drag.moved = false;
      return;
    }
    const boardRect = dom.board.getBoundingClientRect();
    const piecePx = (boardRect.width / 8) * 0.92;
    dom.dragGhost.style.width = `${piecePx}px`;
    dom.dragGhost.style.height = `${piecePx}px`;
    dom.dragGhost.src = getPieceSvgDataUri(originCode);
    dom.dragGhost.classList.toggle('touch-drag', isTouchPointer);
    dom.dragGhost.classList.remove('hidden');

    if (drag.originSq) {
      const sourceImg = dom.board.querySelector(
        `.square[data-r="${drag.originSq.r}"][data-c="${drag.originSq.c}"] .piece`
      );
      if (sourceImg) sourceImg.classList.add('dragging-source');
    }
  }

  if (drag.moved) {
    dom.dragGhost.style.left = `${e.clientX}px`;
    dom.dragGhost.style.top = `${e.clientY}px`;
    updateDragHoverSquare(clientPointToSquare(e.clientX, e.clientY));
  }
}

function handleGlobalPointerUp(e) {
  if (rcDrag.active && e.pointerId === rcDrag.pointerId) {
    const origin = rcDrag.originSq;
    rcDrag.active = false;
    rcDrag.pointerId = null;
    rcDrag.originSq = null;
    previewArrow = null;

    const dropSq = clientPointToSquare(e.clientX, e.clientY);
    if (dropSq && origin) {
      toggleRightClickArrowOrMark(origin, dropSq);
    } else {
      renderArrowsOverlay();
    }
    return;
  }

  if (!drag.active || e.pointerId !== drag.pointerId) return;

  if (drag.isEditorDrag) {
    const origin = drag.from || drag.originSq;
    const pieceCode = drag.pieceCode;
    const wasDragging = drag.moved;
    drag.active = false;
    drag.moved = false;
    drag.isEditorDrag = false;
    drag.pointerId = null;
    drag.originSq = null;
    drag.from = null;
    drag.pieceCode = null;
    endDragVisuals();

    const dropSq = clientPointToSquare(e.clientX, e.clientY);
    if (wasDragging) {
      if (dropSq) {
        if (origin && (dropSq.r !== origin.r || dropSq.c !== origin.c)) {
          editorState.board[dropSq.r][dropSq.c] = pieceCode;
          editorState.board[origin.r][origin.c] = null;
        }
      } else {
        if (origin) {
          editorState.board[origin.r][origin.c] = null;
        }
      }
      editorSelectedSq = null;
      syncEditorCastlingValidity();
    }
    renderBoard();
    return;
  }

  const wasDragging = drag.moved;
  const isPremove = drag.isPremoveDrag;
  const origin = drag.originSq;
  const pocketType = drag.pocketType;
  const wasSelected = drag.wasAlreadySelected;

  drag.active = false;
  drag.moved = false;
  drag.isPremoveDrag = false;
  drag.pointerId = null;
  drag.originSq = null;
  drag.pocketType = null;
  drag.pocketColor = null;
  endDragVisuals();

  const dropSq = clientPointToSquare(e.clientX, e.clientY);

  // Pocket Piece Drag / Click Release
  if (pocketType) {
    if (wasDragging) {
      if (dropSq) {
        if (isPremove) {
          const validPreDrop = premoveTargets.some((t) => t.r === dropSq.r && t.c === dropSq.c);
          if (validPreDrop) {
            enqueuePremoveDrop(pocketType, dropSq);
          } else {
            renderAll();
          }
        } else {
          const validDrop = selectedLegalMoves.some(
            (m) => m.to.r === dropSq.r && m.to.c === dropSq.c
          );
          if (validDrop) {
            submitPlayerDrop(pocketType, dropSq, true, false);
          } else {
            renderAll();
          }
        }
      } else {
        renderAll();
      }
    } else if (wasSelected) {
      clearSelection();
      renderAll();
    }
    return;
  }

  if (wasDragging) {
    if (dropSq && origin && (dropSq.r !== origin.r || dropSq.c !== origin.c)) {
      if (isPremove) {
        const validPre = premoveTargets.some((t) => t.r === dropSq.r && t.c === dropSq.c);
        if (validPre) {
          requestOrQueuePremove(origin, dropSq, true);
        } else {
          renderBoard();
        }
      } else {
        const moved = requestOrOpenPromotion(origin, dropSq, true);
        if (!moved) renderBoard();
      }
    } else if (dropSq && origin && dropSq.r === origin.r && dropSq.c === origin.c && wasSelected) {
      clearSelection();
      renderBoard();
    } else {
      renderBoard();
    }
  } else {
    if (wasSelected && dropSq && origin && dropSq.r === origin.r && dropSq.c === origin.c) {
      clearSelection();
      renderBoard();
    }
  }
}

// --- SVG Tactical Arrow Renderer (Automatically Flips with Board!) ---

function createSvgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function buildArrowElement(arrow, opacity = 0.82) {
  const fromCol = boardFlipped ? 7 - arrow.from.c : arrow.from.c;
  const fromRow = boardFlipped ? 7 - arrow.from.r : arrow.from.r;
  const toCol = boardFlipped ? 7 - arrow.to.c : arrow.to.c;
  const toRow = boardFlipped ? 7 - arrow.to.r : arrow.to.r;

  const x1 = fromCol * 100 + 50;
  const y1 = fromRow * 100 + 50;
  const x2 = toCol * 100 + 50;
  const y2 = toRow * 100 + 50;

  const dCol = toCol - fromCol;
  const dRow = toRow - fromRow;
  const isKnightL =
    (Math.abs(dCol) === 1 && Math.abs(dRow) === 2) ||
    (Math.abs(dCol) === 2 && Math.abs(dRow) === 1);

  const color = `rgba(248, 170, 35, ${opacity})`;
  const g = createSvgEl('g', {});

  if (isKnightL) {
    // Chess.com-style bent L-arrow for Knight jumps
    const cornerX = Math.abs(dRow) === 2 ? x1 : x2;
    const cornerY = Math.abs(dRow) === 2 ? y2 : y1;
    const ux = Math.sign(x2 - cornerX);
    const uy = Math.sign(y2 - cornerY);
    const neckX = x2 - ux * 36;
    const neckY = y2 - uy * 36;

    const polyLine = createSvgEl('polyline', {
      points: `${x1},${y1} ${cornerX},${cornerY} ${neckX},${neckY}`,
      fill: 'none',
      stroke: color,
      'stroke-width': 22,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });

    const px = -uy;
    const py = ux;
    const tipX = x2 - ux * 6;
    const tipY = y2 - uy * 6;
    const head = createSvgEl('polygon', {
      points: `${tipX},${tipY} ${neckX + px * 28},${neckY + py * 28} ${neckX - px * 28},${neckY - py * 28}`,
      fill: color
    });

    g.appendChild(polyLine);
    g.appendChild(head);
    return g;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return g;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const startX = x1 + ux * 18;
  const startY = y1 + uy * 18;
  const neckX = x2 - ux * 36;
  const neckY = y2 - uy * 36;
  const tipX = x2 - ux * 6;
  const tipY = y2 - uy * 6;

  const shaftHalf = 11;
  const headHalf = 28;

  const pts = [
    `${startX + px * shaftHalf},${startY + py * shaftHalf}`,
    `${neckX + px * shaftHalf},${neckY + py * shaftHalf}`,
    `${neckX + px * headHalf},${neckY + py * headHalf}`,
    `${tipX},${tipY}`,
    `${neckX - px * headHalf},${neckY - py * headHalf}`,
    `${neckX - px * shaftHalf},${neckY - py * shaftHalf}`,
    `${startX - px * shaftHalf},${startY - py * shaftHalf}`
  ].join(' ');

  g.appendChild(createSvgEl('polygon', { points: pts, fill: color }));
  return g;
}

function renderArrowsOverlay() {
  if (!dom.boardArrows) return;
  dom.boardArrows.replaceChildren();

  for (const arrow of drawnArrows) {
    dom.boardArrows.appendChild(buildArrowElement(arrow, 0.82));
  }
  if (previewArrow) {
    dom.boardArrows.appendChild(buildArrowElement(previewArrow, 0.55));
  }
}
