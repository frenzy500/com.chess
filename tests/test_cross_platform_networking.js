const assert = require('assert');
const { getAppSources, runAppInContext } = require('./load-app');

console.log('Running Cross-Platform, Same-PC & Blocked-WebRTC Hybrid Networking Test Suite...\n');

const { js: jsSource } = getAppSources();

// 1. Verify Clean ICE Servers & Removal of Dead Blackholed openrelay.metered.ca (192.0.2.1)
console.log('1. Checking STUN ICE Configuration & removal of blackholed OpenRelay...');
assert(jsSource.includes('stun.l.google.com'), 'Must include Google STUN');
assert(jsSource.includes('stun.cloudflare.com'), 'Must include Cloudflare STUN');
assert(!jsSource.includes('openrelay.metered.ca'), 'Must NOT include dead blackholed openrelay.metered.ca (192.0.2.1)');
console.log('   PASS: Clean STUN ICE configuration verified (blackholed 192.0.2.1 server removed)!');

// 2. Verify Hybrid Triple-Transport (WebRTC + WSS Signaling Relay + BroadcastChannel)
console.log('2. Checking Hybrid Triple-Transport (WebRTC + WSS Relay + BroadcastChannel)...');
assert(jsSource.includes('__chess_relay__'), 'Must include WSS signaling relay channel over 0.peerjs.com');
assert(jsSource.includes('chessgame-v2-bc-'), 'Must include BroadcastChannel for instant same-browser tabs');
assert(jsSource.includes('receiveDeduplicatedPacket'), 'Must deduplicate packets across parallel transports');
assert(jsSource.includes("kind: 'chunk'"), 'Must chunk large relay payloads to prevent WebSocket 1009 errors');
console.log('   PASS: Hybrid Triple-Transport with deduplication & chunking verified!');

// 3. Verify Unthrottled Web Worker Heartbeat & Signaling Keepalive
console.log('3. Checking Unthrottled Web Worker Heartbeat & Signaling Keepalive...');
assert(jsSource.includes('heartbeatWorker'), 'Must support unthrottled Web Worker heartbeat for background tabs');
assert(jsSource.includes('runHeartbeatTick'), 'Must have runHeartbeatTick');
assert(jsSource.includes('_sendHeartbeat'), 'Must keep PeerJS signaling WebSocket alive in background tabs');
assert(jsSource.includes("type: 'ping'"), 'Must send ping packet');
assert(jsSource.includes("type: 'pong'"), 'Must respond with pong packet');
console.log('   PASS: Unthrottled Web Worker heartbeat & signaling keepalive verified!');

// 4. End-to-End Simulation: Blocked WebRTC (Same-PC mDNS/NAT-Loopback failure & Firewall block)
console.log('4. Simulating Same-PC / Strict-NAT scenario where WebRTC DataChannel COMPLETELY FAILS...');

const signalingSockets = new Map();

function createBlockedWebRtcBrowserTab(name) {
  const elements = new Map();
  function makeEl(id) {
    const classes = new Set();
    const listeners = {};
    return {
      id,
      value: '',
      textContent: '',
      disabled: false,
      dataset: {},
      style: {},
      children: [],
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, f) => (f === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : f ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c)
      },
      appendChild(ch) { this.children.push(ch); return ch; },
      append(...nodes) { this.children.push(...nodes); },
      removeChild(ch) { this.children = this.children.filter((x) => x !== ch); },
      replaceChildren(...nodes) { this.children = [...nodes]; },
      setAttribute() {},
      getAttribute() { return null; },
      addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
      click() { (listeners.click || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {} })); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400 }; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
  }

  class BlockedWebRtcConn {
    constructor(peerId) {
      this.peer = peerId;
      this.open = false; // WebRTC DataChannel NEVER opens!
      this.listeners = {};
    }
    on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    emit(ev, arg) { (this.listeners[ev] || []).forEach((fn) => fn(arg)); }
    send() {
      throw new Error('WebRTC DataChannel is blocked!');
    }
    close() {
      this.open = false;
      this.emit('close');
    }
  }

  class SignalingOnlyPeer {
    constructor(idOrOpts) {
      this.id = typeof idOrOpts === 'string' ? idOrOpts : 'guest-' + Math.random().toString(36).slice(2, 8);
      this.destroyed = false;
      this.disconnected = false;
      this.listeners = {};
      this.socket = {
        _wsOpen: () => true,
        _sendHeartbeat: () => {},
        send: (msg) => {
          setImmediate(() => {
            const targetPeer = signalingSockets.get(msg.dst);
            if (targetPeer && !targetPeer.destroyed) {
              targetPeer._handleMessage({
                type: msg.type,
                src: this.id,
                dst: msg.dst,
                payload: msg.payload
              });
            }
          });
        }
      };
      signalingSockets.set(this.id, this);
      setImmediate(() => {
        if (!this.destroyed) this.emit('open', this.id);
      });
    }
    _handleMessage(msg) {
      if (msg.type === 'OPEN') this.emit('open', this.id);
    }
    on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    emit(ev, arg) { (this.listeners[ev] || []).forEach((fn) => fn(arg)); }
    connect(targetId) {
      const guestConn = new BlockedWebRtcConn(targetId);
      const hostPeer = signalingSockets.get(targetId);
      setImmediate(() => {
        if (hostPeer) {
          const hostConn = new BlockedWebRtcConn(this.id);
          hostPeer.emit('connection', hostConn);
          // Simulate WebRTC ICE failing 15ms later on both sides!
          setTimeout(() => {
            guestConn.emit('error', new Error('ICE failed'));
            guestConn.emit('close');
            hostConn.emit('error', new Error('ICE failed'));
            hostConn.emit('close');
          }, 15);
        }
      });
      return guestConn;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      signalingSockets.delete(this.id);
    }
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URLSearchParams,
    performance: { now: () => Date.now() },
    Peer: SignalingOnlyPeer,
    BroadcastChannel: undefined, // Force pure WSS Signaling Relay across different browser profiles/PCs!
    navigator: {},
    window: {
      location: { search: '', href: 'https://frenzy500.github.io/com.chess/' },
      addEventListener() {},
      matchMedia: () => ({ matches: false })
    },
    document: {
      readyState: 'complete',
      documentElement: { setAttribute() {} },
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      createElement(tag) { return makeEl(tag); },
      createElementNS(ns, tag) { return makeEl(tag); },
      createDocumentFragment() { return makeEl('fragment'); },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    module: { exports: {} },
    exports: {}
  };
  sandbox.window.document = sandbox.document;
  runAppInContext(
    sandbox,
    ';globalThis.__testHook = { createGameRoom, joinGameRoom, getNet: () => net, getGameState: () => gameState, makeMove: (from, to) => submitPlayerMove(from, to, null, false) };'
  );
  sandbox.document.getElementById('player-name-input').value = name;
  return sandbox.__testHook;
}

(async () => {
  const host = createBlockedWebRtcBrowserTab('HostPC');
  const guest = createBlockedWebRtcBrowserTab('GuestPC');

  host.createGameRoom();
  const roomCode = host.getNet().roomCode;
  assert.strictEqual(roomCode.length, 5, 'Host generated 5-char room code');

  await new Promise((r) => setTimeout(r, 10));
  guest.joinGameRoom(roomCode);

  // Wait 60ms (note: WebRTC ICE fails at 15ms, so WSS Signaling Relay must carry the entire session!)
  await new Promise((r) => setTimeout(r, 60));

  assert.strictEqual(host.getNet().mode, 'online', 'Host transitioned to online via WSS Signaling Relay despite WebRTC failure');
  assert.strictEqual(guest.getNet().mode, 'online', 'Guest transitioned to online via WSS Signaling Relay despite WebRTC failure');
  assert.strictEqual(host.getNet().relayOpen, true, 'Host relayOpen is true');
  assert.strictEqual(guest.getNet().relayOpen, true, 'Guest relayOpen is true');

  // Make a move on Host (White: 1. e4 -> (6,4) to (4,4)) and verify Guest receives it over WSS Relay
  host.makeMove({ r: 6, c: 4 }, { r: 4, c: 4 });

  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(guest.getGameState().moveHistory.length, 1, 'Guest received 1. e4 over WSS Signaling Relay');
  assert.strictEqual(guest.getGameState().board[4][4], 'wp', 'Guest board shows White pawn on e4');

  // Make a reply move on Guest (Black: 1... e5 -> (1,4) to (3,4)) and verify Host receives it over WSS Relay
  guest.makeMove({ r: 1, c: 4 }, { r: 3, c: 4 });

  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(host.getGameState().moveHistory.length, 2, 'Host received 1... e5 over WSS Signaling Relay');
  assert.strictEqual(host.getGameState().board[3][4], 'bp', 'Host board shows Black pawn on e5');

  console.log('   PASS: Full match start & bidirectional moves succeeded with WebRTC 100% blocked!');

  // 5. Verify Static Security
  console.log('5. Checking Static Security & innerHTML prohibition...');
  assert(!jsSource.includes('.innerHTML'), 'Must never contain innerHTML');
  assert(!jsSource.includes('.outerHTML'), 'Must never contain outerHTML');
  assert(!jsSource.includes('insertAdjacentHTML'), 'Must never contain insertAdjacentHTML');
  console.log('   PASS: Strict XSS & innerHTML prohibition maintained!');

  console.log('\nALL CROSS-PLATFORM, SAME-PC & BLOCKED-WEBRTC NETWORKING TESTS PASSED!');
  process.exit(0);
})();
