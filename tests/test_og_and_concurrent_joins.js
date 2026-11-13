'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { getAppSources, runAppInContext } = require('./load-app');

const { repoDir, html: indexHtml, js: jsSource, expectedVersion } = getAppSources();

console.log('Running OG Embeds & Concurrent Invite-Join Hardening Verification Suite...\n');

// ---------------------------------------------------------------------------
// Helper: Parse JPEG SOF0/SOF2 dimensions without external deps
// ---------------------------------------------------------------------------
function readJpegDimensions(buf) {
  assert.strictEqual(buf[0], 0xff, 'JPEG SOI marker byte 0');
  assert.strictEqual(buf[1], 0xd8, 'JPEG SOI marker byte 1');
  let offset = 2;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segLen = buf.readUInt16BE(offset);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      return { width, height };
    }
    offset += segLen;
  }
  throw new Error('Could not find JPEG SOF marker');
}

// ---------------------------------------------------------------------------
// 1. Verify Root Index OG Tags & All 6 Variant Invite Pages + 1200x630 Banners
// ---------------------------------------------------------------------------
console.log('1. Checking root index.html has NO embed tags, while 6 invite/*.html pages keep 1200x630 assets/og/*.jpg...');
assert(!/property="og:/i.test(indexHtml), 'index.html must not contain OpenGraph tags so website URL sends no embed');
assert(!/name="twitter:/i.test(indexHtml), 'index.html must not contain Twitter card tags so website URL sends no embed');
assert(!/name="description"/i.test(indexHtml), 'index.html must not contain meta description embed text');
assert(
  indexHtml.includes(`css/base.css?v=${expectedVersion}`) && indexHtml.includes(`js/main.js?v=${expectedVersion}`),
  `index.html cache-bust updated to ${expectedVersion}`
);

const variants = [
  { slug: 'standard', nameMatch: 'Standard Chess' },
  { slug: 'cannibal', nameMatch: 'Cannibal Chess' },
  { slug: 'crazyhouse', nameMatch: 'Crazyhouse' },
  { slug: 'fog', nameMatch: 'Fog of War' },
  { slug: 'secret', nameMatch: 'Secret Queen' },
  { slug: 'dice', nameMatch: 'Dice Chess' },
  { slug: 'schrodinger', nameMatch: "Schrödinger's Chess" },
];

for (const v of variants) {
  const imgPath = path.join(repoDir, 'assets', 'og', `${v.slug}.jpg`);
  assert(fs.existsSync(imgPath), `Missing ${imgPath}`);
  const imgBuf = fs.readFileSync(imgPath);
  const dims = readJpegDimensions(imgBuf);
  assert.strictEqual(dims.width, 1200, `${v.slug}.jpg width must be 1200`);
  assert.strictEqual(dims.height, 630, `${v.slug}.jpg height must be 630`);

  const htmlPath = path.join(repoDir, 'invite', `${v.slug}.html`);
  assert(fs.existsSync(htmlPath), `Missing ${htmlPath}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(html.includes(`<meta property="og:image" content="https://frenzy500.github.io/com.chess/assets/og/${v.slug}.jpg?v=20261113g">`), `${v.slug}.html points to its variant banner with cache-buster`);
  assert(html.includes('<meta property="og:image:width" content="1200">'), `${v.slug}.html declares width=1200`);
  assert(html.includes('<meta property="og:image:height" content="630">'), `${v.slug}.html declares height=630`);
  assert(html.includes(`<meta property="og:url" content="https://frenzy500.github.io/com.chess/invite/${v.slug}.html">`), `${v.slug}.html declares canonical og:url`);
  assert(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${v.slug}.html declares summary_large_image`);
  assert(html.includes(v.nameMatch), `${v.slug}.html titles mention ${v.nameMatch}`);

  // Execute inline redirect script across valid code, lowercase code, and malicious input
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert(scriptMatch, `${v.slug}.html contains inline redirect script`);

  function runRedirect(search) {
    let replacedUrl = null;
    const fakeDoc = {
      addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') fn(); },
      getElementById() { return { setAttribute() {} }; }
    };
    const ctx = {
      URL,
      URLSearchParams,
      document: fakeDoc,
      window: {
        location: {
          search,
          replace(u) { replacedUrl = u; }
        }
      }
    };
    vm.runInContext(scriptMatch[1], vm.createContext(ctx));
    return replacedUrl;
  }

  assert.strictEqual(runRedirect('?game=5p79z'), '../?game=5P79Z', `${v.slug}.html normalizes ?game=5p79z`);
  assert.strictEqual(runRedirect('?code=Ab92K'), '../?game=AB92K', `${v.slug}.html accepts ?code=`);
  assert.strictEqual(runRedirect('?game=https://evil.example/phish'), `../?variant=${v.slug}`, `${v.slug}.html blocks non-5-char/open redirect`);
  assert.strictEqual(runRedirect(''), `../?variant=${v.slug}`, `${v.slug}.html falls back cleanly when no code`);
}
console.log('   PASS: All 6 1200x630 banners, OG tags, and safe redirects verified!');

// ---------------------------------------------------------------------------
// 2. Build Multi-Transport Tab Simulator (WebRTC + WSS Relay + BroadcastChannel)
// ---------------------------------------------------------------------------
function createNetworkWorld({ webrtcMode = 'open', enableBroadcastChannel = true, relayDelayMs = 0 } = {}) {
  const signalingSockets = new Map();
  const peerConns = new Map();
  const bcRegistry = new Map(); // channelName -> Set<instance>

  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      if (!bcRegistry.has(name)) bcRegistry.set(name, new Set());
      bcRegistry.get(name).add(this);
    }
    postMessage(data) {
      if (this.closed) return;
      const peers = bcRegistry.get(this.name);
      if (!peers) return;
      const cloned = JSON.parse(JSON.stringify(data));
      for (const ch of [...peers]) {
        if (ch === this || ch.closed) continue;
        setImmediate(() => {
          if (!ch.closed && typeof ch.onmessage === 'function') {
            ch.onmessage({ data: JSON.parse(JSON.stringify(cloned)) });
          }
        });
      }
    }
    close() {
      this.closed = true;
      const set = bcRegistry.get(this.name);
      if (set) set.delete(this);
    }
  }

  class MockConn {
    constructor(peerId, metadata) {
      this.peer = peerId;
      this.metadata = metadata || {};
      this.open = false;
      this.destroyed = false;
      this.listeners = {};
      this.remote = null;
    }
    on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    emit(ev, arg) { (this.listeners[ev] || []).forEach((fn) => fn(arg)); }
    send(data) {
      if (!this.open || this.destroyed || !this.remote || this.remote.destroyed) return;
      const cloned = JSON.parse(JSON.stringify(data));
      setImmediate(() => {
        if (this.remote && !this.remote.destroyed && this.remote.open) {
          this.remote.emit('data', cloned);
        }
      });
    }
    close() {
      if (this.destroyed) return;
      this.open = false;
      this.destroyed = true;
      const remote = this.remote;
      this.emit('close');
      if (remote && !remote.destroyed) {
        remote.open = false;
        remote.destroyed = true;
        setImmediate(() => remote.emit('close'));
      }
    }
  }

  let seq = 0;
  class MockPeer {
    constructor(idOrOpts, opts) {
      seq++;
      this.id = typeof idOrOpts === 'string' ? idOrOpts : `guest-peer-${seq}-${Math.random().toString(36).slice(2, 6)}`;
      this.destroyed = false;
      this.disconnected = false;
      this.listeners = {};
      this.socket = {
        _wsOpen: () => !this.destroyed,
        _sendHeartbeat: () => {},
        send: (msg) => {
          const deliver = () => {
            const dst = signalingSockets.get(msg.dst);
            if (dst && !dst.destroyed) {
              dst._handleMessage({
                type: msg.type,
                src: this.id,
                dst: msg.dst,
                payload: msg.payload ? JSON.parse(JSON.stringify(msg.payload)) : msg.payload
              });
            }
          };
          if (relayDelayMs > 0) setTimeout(deliver, relayDelayMs);
          else setImmediate(deliver);
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
    connect(targetId, opts) {
      const metadata = (opts && opts.metadata) || {};
      const guestConn = new MockConn(targetId, metadata);
      const hostPeer = signalingSockets.get(targetId);
      setTimeout(() => {
        if (!hostPeer || hostPeer.destroyed || guestConn.destroyed) return;
        const hostConn = new MockConn(this.id, metadata);
        guestConn.remote = hostConn;
        hostConn.remote = guestConn;
        peerConns.set(guestConn, hostConn);
        hostPeer.emit('connection', hostConn);

        if (webrtcMode === 'open') {
          setTimeout(() => {
            if (!guestConn.destroyed && !hostConn.destroyed) {
              guestConn.open = true;
              hostConn.open = true;
              guestConn.emit('open');
              hostConn.emit('open');
            }
          }, 8);
        } else if (webrtcMode === 'blocked') {
          setTimeout(() => {
            guestConn.emit('error', new Error('ICE failed'));
            guestConn.close();
          }, 12);
        }
      }, 2);
      return guestConn;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      signalingSockets.delete(this.id);
    }
  }

  function createTab(name, initialSearch = '') {
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

    const sandbox = {
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL,
      URLSearchParams,
      performance: { now: () => Date.now() },
      Peer: MockPeer,
      BroadcastChannel: enableBroadcastChannel ? MockBroadcastChannel : undefined,
      navigator: {},
      window: {
        location: {
          search: initialSearch,
          href: 'https://frenzy500.github.io/com.chess/' + initialSearch
        },
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
      `\n;globalThis.__testHook = {
        buildInviteUrl, extractCleanGameCode, checkAutoJoinFromUrl,
        createGameRoom, joinGameRoom, connectToHostForReconnect, handleTransientDisconnect,
        getNet: () => net,
        getGameState: () => gameState,
        isOpponentDisconnected: () => opponentDisconnected,
        hasGraceTimer: () => opponentGraceTimer !== null,
        setGameStateVariant: (v) => { gameState.variant = v; },
        getFeedback: () => document.getElementById('game-feedback').textContent,
        makeMove: (from, to) => submitPlayerMove(from, to, null, false)
      };`
    );
    sandbox.document.getElementById('player-name-input').value = name;
    return sandbox.__testHook;
  }

  return { createTab };
}

(async () => {
  // -------------------------------------------------------------------------
  // 3. Test buildInviteUrl & extractCleanGameCode across all 6 variants
  // -------------------------------------------------------------------------
  console.log('2. Checking buildInviteUrl, extractCleanGameCode & ?variant= auto-selection...');
  {
    const w = createNetworkWorld();
    const tab = w.createTab('Host');
    for (const v of variants) {
      tab.setGameStateVariant(v.slug);
      const url = tab.buildInviteUrl('5P79Z');
      assert.strictEqual(
        url,
        `https://frenzy500.github.io/com.chess/invite/${v.slug}.html?game=5P79Z`,
        `Expected variant invite URL for ${v.slug}`
      );
      assert.strictEqual(tab.extractCleanGameCode(url), '5P79Z', `extractCleanGameCode works on ${v.slug} invite URL`);
    }

    const diceTab = w.createTab('Browser', '?variant=dice');
    diceTab.checkAutoJoinFromUrl();
    assert.strictEqual(diceTab.getGameState().variant, 'dice', 'checkAutoJoinFromUrl applies ?variant=dice');
  }
  console.log('   PASS: Variant invite URL builder, code parser & ?variant= pre-selection verified!');

  // -------------------------------------------------------------------------
  // 4. Scenario A: Two guests click invite link at the exact same tick (WebRTC)
  // -------------------------------------------------------------------------
  console.log('3. Scenario A: Simultaneous double-clickers over WebRTC + WSS Relay...');
  {
    const w = createNetworkWorld({ webrtcMode: 'open', enableBroadcastChannel: false });
    const host = w.createTab('Host');
    const guest1 = w.createTab('Guest1');
    const guest2 = w.createTab('Guest2');

    host.createGameRoom();
    const code = host.getNet().roomCode;
    await new Promise((r) => setTimeout(r, 15));

    // Both guests click the invite link on the exact same tick!
    guest1.joinGameRoom(code);
    guest2.joinGameRoom(code);
    await new Promise((r) => setTimeout(r, 90));

    assert.strictEqual(host.getNet().mode, 'online', 'Host reached online mode');
    const onlineGuests = [guest1, guest2].filter((g) => g.getNet().mode === 'online');
    const rejectedGuests = [guest1, guest2].filter(
      (g) => g.getNet().mode === 'local' && g.getNet().peer === null && /full|2\/2/i.test(g.getFeedback())
    );
    assert.strictEqual(onlineGuests.length, 1, 'Exactly 1 guest claimed the seat');
    assert.strictEqual(rejectedGuests.length, 1, 'Exactly 1 concurrent clicker got room_locked');

    const winner = onlineGuests[0];
    host.makeMove({ r: 6, c: 4 }, { r: 4, c: 4 });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(winner.getGameState().moveHistory.length, 1, 'Host -> winner move works normally');
    assert.strictEqual(rejectedGuests[0].getGameState().moveHistory.length, 0, 'Rejected clicker receives zero match state');
  }
  console.log('   PASS: Simultaneous clickers resolved atomically (1 wins, 1 cleanly rejected)!');

  // -------------------------------------------------------------------------
  // 5. Scenario B: 3rd clicker in same browser (BroadcastChannel + Relay)
  //    MUST NOT boot or disrupt existing connected Guest!
  // -------------------------------------------------------------------------
  console.log('4. Scenario B: 3rd clicker joining via BroadcastChannel + Relay while 2/2 match active...');
  {
    const w = createNetworkWorld({ webrtcMode: 'open', enableBroadcastChannel: true });
    const host = w.createTab('Host');
    const guestA = w.createTab('GuestA');
    const intruder = w.createTab('IntruderC');

    host.createGameRoom();
    const code = host.getNet().roomCode;
    await new Promise((r) => setTimeout(r, 15));

    guestA.joinGameRoom(code);
    await new Promise((r) => setTimeout(r, 70));
    assert.strictEqual(host.getNet().mode, 'online');
    assert.strictEqual(guestA.getNet().mode, 'online');

    // Intruder opens invite link on the same browser (shares BroadcastChannel AND sends WSS relay open!)
    intruder.joinGameRoom(code);
    await new Promise((r) => setTimeout(r, 70));

    assert.strictEqual(intruder.getNet().mode, 'local', 'Intruder returns to local mode');
    assert.strictEqual(intruder.getNet().peer, null, 'Intruder peer cleaned up cleanly');
    assert(/full|2\/2/i.test(intruder.getFeedback()), 'Intruder sees full-room rejection feedback');
    assert.strictEqual(guestA.getNet().mode, 'online', 'Legitimate GuestA MUST stay online despite shared BroadcastChannel!');
    assert.strictEqual(guestA.getNet().roomLocked, true, 'Legitimate GuestA keeps active room lock!');
    assert.strictEqual(host.getNet().guestClientId, guestA.getNet().localClientId, 'Host keeps GuestA locked as seat owner');

    host.makeMove({ r: 6, c: 4 }, { r: 4, c: 4 });
    await new Promise((r) => setTimeout(r, 30));
    guestA.makeMove({ r: 1, c: 4 }, { r: 3, c: 4 });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(host.getGameState().moveHistory.length, 2, 'Match continues smoothly with 2 moves synced');
    assert.strictEqual(intruder.getGameState().moveHistory.length, 0, 'Intruder sees zero match traffic');
  }
  console.log('   PASS: 3rd clicker rejected without affecting existing BroadcastChannel/Relay guest!');

  // -------------------------------------------------------------------------
  // 6. Scenario C: Intruder during disconnect grace vs genuine Guest reconnect
  // -------------------------------------------------------------------------
  console.log('5. Scenario C: Grace period blocks strangers but allows original guestClientId with new peerId...');
  {
    const w = createNetworkWorld({ webrtcMode: 'blocked', enableBroadcastChannel: false });
    const host = w.createTab('Host');
    const guestA = w.createTab('GuestA');
    const stranger = w.createTab('Stranger');

    host.createGameRoom();
    const code = host.getNet().roomCode;
    await new Promise((r) => setTimeout(r, 15));

    guestA.joinGameRoom(code);
    await new Promise((r) => setTimeout(r, 60));
    host.makeMove({ r: 6, c: 4 }, { r: 4, c: 4 });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(guestA.getGameState().moveHistory.length, 1);

    // Drop transport -> Host enters disconnect grace
    if (host.getNet().conn) host.getNet().conn.close();
    host.getNet().relayOpen = false;
    host.handleTransientDisconnect('network_drop');
    assert.strictEqual(host.hasGraceTimer(), true, 'Host entered disconnect grace period');
    assert.strictEqual(host.isOpponentDisconnected(), true, 'Host marked opponentDisconnected=true');

    // Stranger clicks invite link while grace is active
    stranger.joinGameRoom(code);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(stranger.getNet().mode, 'local', 'Stranger rejected during guest grace period');
    assert(/full|2\/2/i.test(stranger.getFeedback()), 'Stranger sees full-room feedback during grace');

    // Legitimate GuestA loses PeerJS peer (new peerId!) and real attemptGuestReconnect() recovers using same localClientId
    const oldGuestPeerId = guestA.getNet().peer.id;
    guestA.getNet().peer.destroy();
    guestA.getNet().peer = null;
    guestA.getNet().conn = null;
    guestA.getNet().relayOpen = false;
    guestA.handleTransientDisconnect();
    await new Promise((r) => setTimeout(r, 1950));

    assert.notStrictEqual(guestA.getNet().peer.id, oldGuestPeerId, 'GuestA created a fresh PeerJS peerId after drop');
    assert.strictEqual(host.hasGraceTimer(), false, 'Host cleared grace timer after original guest reconnected');
    assert.strictEqual(host.isOpponentDisconnected(), false, 'Host cleared opponentDisconnected flag');
    assert.strictEqual(guestA.getNet().mode, 'online', 'Original guest returned to online mode with new peerId');

    guestA.makeMove({ r: 1, c: 4 }, { r: 3, c: 4 });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(host.getGameState().moveHistory.length, 2, 'Reconnected guest resumed play cleanly');
  }
  console.log('   PASS: Grace-period seat ownership protected from strangers & restored for real guest!');

  // -------------------------------------------------------------------------
  // 7. Scenario D: Half-open first claimer drops before match starts -> room unlocks
  // -------------------------------------------------------------------------
  console.log('6. Scenario D: Stale pre-match claim unlocks if first clicker closes before match start...');
  {
    const w2 = createNetworkWorld({ webrtcMode: 'blocked', enableBroadcastChannel: false });
    const h2 = w2.createTab('Host2');
    const gOk = w2.createTab('OkTab');
    h2.createGameRoom();
    const c2 = h2.getNet().roomCode;
    await new Promise((r) => setTimeout(r, 15));

    const fakeConn = {
      peer: 'aborted-peer',
      metadata: { clientId: 'aborted-client' },
      open: false,
      listeners: {},
      on(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
      emit(ev, a) { (this.listeners[ev] || []).forEach((fn) => fn(a)); },
      close() { this.emit('close'); },
      send() {}
    };
    h2.getNet().peer.emit('connection', fakeConn);
    assert.strictEqual(h2.getNet().pendingClaimConn, fakeConn, 'Host tracked pendingClaimConn');
    assert.strictEqual(h2.getNet().roomLocked, true, 'Host locked seat while pre-open claim active');
    fakeConn.close();
    assert.strictEqual(h2.getNet().pendingClaimConn, null, 'Host released pendingClaimConn on close while waiting');
    assert.strictEqual(h2.getNet().guestClientId, null, 'Host released guestClientId on pre-match abort');
    assert.strictEqual(h2.getNet().roomLocked, false, 'Host unlocked seat on pre-match abort');

    gOk.joinGameRoom(c2);
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(h2.getNet().mode, 'online', 'Second guest joins cleanly after pre-match claim aborted');
    assert.strictEqual(gOk.getNet().mode, 'online');
  }
  console.log('   PASS: Pre-match stale claim cleanup verified!');

  // -------------------------------------------------------------------------
  // 8. Scenario E: 3-way simultaneous clickers arriving WebRTC-first (relay delayed)
  // -------------------------------------------------------------------------
  console.log('7. Scenario E: 3-way simultaneous WebRTC-first clickers (delayed relay)...');
  {
    const w = createNetworkWorld({ webrtcMode: 'open', enableBroadcastChannel: false, relayDelayMs: 60 });
    const host = w.createTab('Host');
    const g1 = w.createTab('G1');
    const g2 = w.createTab('G2');
    const g3 = w.createTab('G3');

    host.createGameRoom();
    const code = host.getNet().roomCode;
    await new Promise((r) => setTimeout(r, 15));

    g1.joinGameRoom(code);
    g2.joinGameRoom(code);
    g3.joinGameRoom(code);
    await new Promise((r) => setTimeout(r, 250));

    assert.strictEqual(host.getNet().mode, 'online', 'Host reached online mode');
    const winners = [g1, g2, g3].filter((g) => g.getNet().mode === 'online');
    const losers = [g1, g2, g3].filter(
      (g) => g.getNet().mode === 'local' && g.getNet().peer === null && /full|2\/2/i.test(g.getFeedback())
    );
    assert.strictEqual(winners.length, 1, 'Exactly 1 winner out of 3 simultaneous WebRTC clickers');
    assert.strictEqual(losers.length, 2, 'Both extra simultaneous clickers cleanly rejected');

    host.makeMove({ r: 6, c: 4 }, { r: 4, c: 4 });
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(winners[0].getGameState().moveHistory.length, 1, 'Winner receives moves seamlessly');
  }
  console.log('   PASS: 3-way simultaneous WebRTC-first race resolved cleanly!');

  console.log('\nALL OG EMBEDS & CONCURRENT INVITE-JOIN HARDENING TESTS PASSED!');
  process.exit(0);
})();
