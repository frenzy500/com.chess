/* Shared Runtime State, Configuration, Timers, DOM Cache & Chat Reaction Constants */
'use strict';

/* ============================================================================
 * SECTION 4: MULTIPLAYER NETWORKING & AUTHORITATIVE CLOCKS (PeerJS WebRTC)
 * ============================================================================ */

const PEER_ID_PREFIX = 'chessgame-v2-room-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 2
};

let heartbeatInterval = null;
let heartbeatWorker = null;
let lastHeartbeatReceived = Date.now();
let opponentGraceTimer = null;
let opponentGraceSecondsLeft = 30;
let guestReconnectAttempts = 0;
let guestReconnectTimer = null;

const setupConfig = {
  variant: 'standard', // 'standard' | 'cannibal' | 'crazyhouse' | 'fog' | 'secret'
  timed: true,
  minutes: 10,         // 1..60 minutes
  incrementSec: 5,     // 0..60 seconds gained per turn
  sidePref: 'w',       // 'w' | 'random' | 'b'
  customState: null    // Custom position configuration if set from editor
};

const clockState = {
  timed: false,
  minutes: 10,
  incrementSec: 5,
  whiteMs: 600000,
  blackMs: 600000,
  running: false,
  lastSyncPerf: 0,
  lowTimeWarned: false,
  intervalId: null
};

const net = {
  mode: 'local',          // 'local' | 'setup' | 'waiting' | 'joining' | 'online'
  role: null,             // 'host' | 'guest' | null
  roomCode: null,
  myColor: 'w',
  myName: 'Guest',
  peerName: 'Opponent',
  roomLocked: false,
  guestClientId: null,
  pendingClaimConn: null,
  pendingClaimAt: 0,
  skipCloseNotify: false,
  peer: null,
  conn: null,
  remotePeerId: null,
  relayOpen: false,
  bcChannel: null,
  bcOpen: false,
  bcPeerId: null,
  localClientId: 'c_' + Math.random().toString(36).slice(2, 10),
  currentMatchId: null,
  joinTimer: null,
  joinRetryTimer: null,
  myRematchWanted: false,
  peerRematchWanted: false,
  drawOfferedBy: null,    // 'w' | 'b' | null
  pendingOptimisticPly: null,
  msgTimestamps: [],
  txSeq: 0,
  rxPktIds: new Set(),
  relayChunks: new Map()
};

// Shared Match & UI Session State
let gameState = createInitialState();
let viewPly = 0;               // Current move index viewed on board (0..moveHistory.length)
let boardFlipped = false;
let selectedSq = null;
let selectedPocketType = null; // Selected Crazyhouse pocket piece on player's turn
let selectedLegalMoves = [];
let premoveOriginSq = null;    // Selected origin square while choosing a premove
let premovePocketType = null;  // Selected Crazyhouse pocket piece while choosing a premove drop
let premoveTargets = [];       // Candidate target squares for premoveOriginSq / premovePocketType
let premoveQueue = [];         // Array of { isDrop?, dropType?, from: {r, c}|null, to: {r, c}, promotion: string|null }
let pendingPromotion = null;   // { from, to, color, viaDrag, isPremove }
let pendingSlideAnim = null;   // { moves: [{ from, to }] }
let drawnArrows = [];          // Array of { from: {r, c}, to: {r, c} }
let markedSquares = [];        // Array of { r, c } right-click square highlights
let previewArrow = null;       // Live arrow while right-click dragging
let resignConfirmTimer = null;
let opponentDisconnected = false;
let secretPickCol = null;

// Peer-to-Peer Chat Session State (persists across rematches in the same room)
const CHAT_MAX_MESSAGES = 120;
const CHAT_MAX_TEXT_LENGTH = 500;

const CHESS_CHAT_BADGES = Object.freeze({
  brilliant: { label: 'Brilliant', symbol: '!!', bg: '#1baca6', ring: '#14847f', text: '!!', fs: 13.5 },
  great: { label: 'Great', symbol: '!', bg: '#5c8bb0', ring: '#446a89', text: '!', fs: 17 },
  best: { label: 'Best', symbol: '*', bg: '#81b64c', ring: '#618f34', icon: 'star' },
  excellent: { label: 'Excellent', symbol: '+', bg: '#96bc4b', ring: '#719232', icon: 'thumb' },
  good: { label: 'Good', symbol: 'ok', bg: '#86a666', ring: '#65804b', icon: 'check' },
  book: { label: 'Book', symbol: 'Book', bg: '#a88865', ring: '#816547', icon: 'book' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', bg: '#f0c15c', ring: '#bf9433', text: '?!', fs: 13 },
  mistake: { label: 'Mistake', symbol: '?', bg: '#e58f2a', ring: '#b36b17', text: '?', fs: 16.5 },
  miss: { label: 'Miss', symbol: 'x', bg: '#ee6b55', ring: '#c14935', icon: 'miss' },
  blunder: { label: 'Blunder', symbol: '??', bg: '#ca3431', ring: '#99221f', text: '??', fs: 13.5 }
});

const CHAT_QUICK_EMOJIS = Object.freeze(
  [
    [0x1F44B],
    [0x1F60A],
    [0x1F602],
    [0x1F62E],
    [0x1F914],
    [0x1F624],
    [0x1F62D],
    [0x1F480],
    [0x1F525],
    [0x1F451],
    [0x265F, 0xFE0F],
    [0x1F3B2],
    [0x1F91D],
    [0x1F389],
    [0x1F3C6],
    [0x1F44F]
  ].map((cps) => String.fromCodePoint(...cps))
);

let chatMessages = [];
let unreadChatCount = 0;
let seenChatIds = new Set();
let chatPickerOpen = false;
let desktopSidebarTab = 'chat'; // 'chat' | 'moves'

const editorState = {
  active: false,
  board: Array.from({ length: 8 }, () => Array(8).fill(null)),
  turn: 'w',
  variant: 'standard',
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  pockets: { w: [], b: [] },
  selectedTool: null,
  validationError: null
};
let editorSelectedSq = null;

/* ============================================================================
 * SECTION 5: USER INTERFACE (Board, Animations, Premoves, Arrows, Replay, PGN)
 * ============================================================================ */

const drag = {
  active: false,
  moved: false,
  isPremoveDrag: false,
  wasAlreadySelected: false,
  justDroppedMove: false,
  pointerId: null,
  pointerType: 'mouse',
  startX: 0,
  startY: 0,
  originSq: null,
  pocketType: null,
  pocketColor: null,
  hoverSq: null
};

const rcDrag = {
  active: false,
  pointerId: null,
  originSq: null
};

const dom = {};

let diceAutoPassTimer = null;
let diceAutoRollTimer = null;
let diceScrambleTimer = null;
let diceAudioSettleTimer = null;
let diceAutoRollEnabled = false;
let lastRenderedDiceKey = '';

// --- Variant-Safe Multi-Premove Projection, Promotion & Seamless Turn Transitions ---

const MAX_PREMOVE_QUEUE = 32;

// --- Controls, Setup Panel, Themes & Event Listeners ---

let gameFeedbackClearTimer = null;

let lastRenderedChatSig = '';

let activeTooltipDot = null;
let pinnedTooltipDot = null;
