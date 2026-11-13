/* Web Audio Synthesizer & Move/Dice/Chat Sound Cues */
'use strict';

/* ============================================================================
 * SECTION 3: SOUND ENGINE (Chess.com-style Wooden Audio via Web Audio API)
 * ============================================================================ */

let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
  if (!soundEnabled || typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Synthesizes a realistic damped wooden chess-piece tap (filtered impulse + wood body)
function playWoodTap(ctx, startTime, bodyFreq, clickFreq, gainLevel = 0.28, duration = 0.065) {
  // 1. Short filtered noise click (wood contact transient)
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * 0.028));
  const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.22));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(clickFreq, startTime);
  filter.Q.setValueAtTime(2.4, startTime);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(gainLevel * 0.9, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.028);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(startTime);

  // 2. Resonant low-mid wood body thump
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(bodyFreq * 1.35, startTime);
  osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.68, startTime + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(gainLevel, startTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function playToneNote(ctx, startTime, freq, gainLevel = 0.12, duration = 0.16, type = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function playSound(kind) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t = ctx.currentTime;
  switch (kind) {
    case 'moveSelf':
      playWoodTap(ctx, t, 155, 680, 0.3, 0.062);
      break;
    case 'moveOpponent':
      playWoodTap(ctx, t, 182, 820, 0.28, 0.058);
      break;
    case 'capture':
      playWoodTap(ctx, t, 122, 1150, 0.38, 0.082);
      playWoodTap(ctx, t + 0.012, 210, 1650, 0.22, 0.045);
      break;
    case 'castle':
      playWoodTap(ctx, t, 155, 680, 0.28, 0.058);
      playWoodTap(ctx, t + 0.075, 178, 790, 0.25, 0.055);
      break;
    case 'promote':
      playWoodTap(ctx, t, 160, 760, 0.28, 0.06);
      playToneNote(ctx, t + 0.02, 523.25, 0.11, 0.14, 'triangle');
      playToneNote(ctx, t + 0.09, 659.25, 0.12, 0.18, 'triangle');
      break;
    case 'check':
      playWoodTap(ctx, t, 150, 950, 0.32, 0.065);
      playToneNote(ctx, t + 0.005, 880, 0.13, 0.13, 'triangle');
      break;
    case 'premove':
      playWoodTap(ctx, t, 240, 1200, 0.14, 0.032);
      break;
    case 'gameStart':
      playWoodTap(ctx, t, 175, 760, 0.2, 0.05);
      playToneNote(ctx, t, 392.0, 0.1, 0.14, 'triangle');
      playToneNote(ctx, t + 0.085, 523.25, 0.12, 0.2, 'triangle');
      break;
    case 'gameEnd':
      playWoodTap(ctx, t, 135, 620, 0.28, 0.07);
      playToneNote(ctx, t + 0.01, 440, 0.1, 0.26, 'triangle');
      playToneNote(ctx, t + 0.07, 554.37, 0.1, 0.28, 'triangle');
      playToneNote(ctx, t + 0.13, 659.25, 0.11, 0.34, 'triangle');
      break;
    case 'lowTime':
      playToneNote(ctx, t, 784, 0.11, 0.07, 'sine');
      playToneNote(ctx, t + 0.09, 784, 0.11, 0.07, 'sine');
      break;
    case 'diceRoll':
      playWoodTap(ctx, t, 210, 1280, 0.16, 0.032);
      playWoodTap(ctx, t + 0.044, 245, 1460, 0.18, 0.032);
      playWoodTap(ctx, t + 0.095, 230, 1340, 0.19, 0.035);
      playWoodTap(ctx, t + 0.152, 272, 1520, 0.17, 0.036);
      break;
    case 'diceDoubles':
      playToneNote(ctx, t, 523.25, 0.11, 0.13, 'triangle');
      playToneNote(ctx, t + 0.055, 659.25, 0.12, 0.15, 'triangle');
      playToneNote(ctx, t + 0.11, 783.99, 0.13, 0.18, 'triangle');
      playToneNote(ctx, t + 0.165, 1046.5, 0.11, 0.24, 'sine');
      break;
    case 'diceBlocked':
    case 'dicePass':
      playWoodTap(ctx, t, 118, 560, 0.24, 0.055);
      playToneNote(ctx, t + 0.015, 246.94, 0.11, 0.14, 'triangle');
      playToneNote(ctx, t + 0.105, 185.0, 0.11, 0.18, 'triangle');
      break;
    case 'turnPass':
      playWoodTap(ctx, t, 200, 920, 0.14, 0.03);
      break;
    case 'chat':
      playToneNote(ctx, t, 587.33, 0.08, 0.09, 'sine');
      playToneNote(ctx, t + 0.06, 783.99, 0.09, 0.13, 'triangle');
      break;
    default:
      break;
  }
}

function playMoveFeedbackSound(prevState, nextState, isMyMove) {
  if (nextState.status !== 'playing') {
    playSound('gameEnd');
    return;
  }
  const lastFrame = nextState.historyFrames[nextState.historyFrames.length - 1];
  const meta = lastFrame?.meta;
  if (meta?.isPass) {
    playSound('turnPass');
    return;
  }

  if (getVariantDef(nextState).fogOfWar) {
    if (!isMyMove) {
      const viewer = net.mode === 'online' ? net.myColor : nextState.turn;
      const vis = computeVisibleSquares(nextState, viewer);
      const to = nextState.lastMove?.to;
      if (to && vis.has(`${to.r},${to.c}`) && meta?.isCapture) {
        playSound('capture');
      } else {
        playSound('moveOpponent');
      }
      return;
    }
    if (meta?.promotion) {
      playSound('promote');
    } else if (meta?.castleSide) {
      playSound('castle');
    } else if (meta?.isCapture) {
      playSound('capture');
    } else {
      playSound('moveSelf');
    }
    return;
  }

  if (nextState.inCheck) {
    playSound('check');
  } else if (meta?.promotion) {
    playSound('promote');
  } else if (meta?.castleSide) {
    playSound('castle');
  } else if (meta?.isCapture) {
    playSound('capture');
  } else {
    playSound(isMyMove ? 'moveSelf' : 'moveOpponent');
  }
}
