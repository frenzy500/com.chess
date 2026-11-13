# com.chess

Static peer-to-peer multiplayer chess website with custom variants, authoritative clocks, premoves, tactical arrows, custom board setup, and P2P chat. Built with vanilla HTML, CSS, and JavaScript with zero build step so it runs directly on GitHub Pages or from local files.

## Project Structure

- [index.html](index.html) — App shell, inline SVG icon/logo symbols, variant modals, board stage, sidebar tabs, and ordered CSS/JS tags.
- `css/` — Ordered stylesheets loaded by `index.html`:
  - `css/base.css` — Theme variables, resets, header, and layout shell.
  - `css/board.css` — Chessboard squares, pieces, highlights, promotion menu, dice stage, arrows, and player bars.
  - `css/sidebar.css` — Online setup, room code controls, clocks, buttons, variant tooltips, and sidebar panels.
  - `css/chat.css` — Peer-to-peer chat log, Chess.com-style badge tokens, emoji picker, and unread badges.
  - `css/editor.css` — Custom position editor palette, controls, and leave-confirmation modal.
  - `css/responsive.css` — Desktop wide-screen tray layout (`min-width: 1120px`) and mobile ergonomic breakpoints (`max-width: 900px`).
- `js/` — Ordered classic `<script>` modules loaded by `index.html` (no bundler required):
  - `js/variants.js` — Variant rules (`standard`, `cannibal`, `crazyhouse`, `fog`, `secret`, `dice`, `schrodinger`), fairy piece definitions, and chat badge metadata.
  - `js/schrodinger.js` — Schrödinger's Chess bipartite quantum pool solver, collapse deduction, castling/move guards, and square hints.
  - `js/engine.js` — Pure immutable chess engine, legal move generation, Secret Queen mechanics, Dice Chess rules, Schrödinger's Chess hooks, Fog of War visibility, custom FEN/position validator, and move application.
  - `js/audio.js` — Web Audio API procedural sound effects.
  - `js/pieces.js` — Vector Staunton and custom piece SVG data URLs.
  - `js/state.js` — Mutable UI/game/clock/network state and setup configuration defaults.
  - `js/network-codec.js` — State serialization/hydration, Fog of War redaction, chat sanitization, and invite URL builders.
  - `js/network-transport.js` — Hybrid WebRTC (PeerJS) + WebSocket signaling relay + BroadcastChannel packet delivery, chunking, and heartbeat worker.
  - `js/network-session.js` — Host/guest room creation, concurrent join handling, reconnect grace period, and authoritative move/dice/chat packet handlers.
  - `js/ui-premoves.js` — Multi-premove queuing and projected-board validation across all variants.
  - `js/ui-input.js` — Pointer drag/tap input, right-click arrows/highlights, and touch ergonomics.
  - `js/ui-board.js` — Board rendering, coordinate labels, pockets, clocks, move list, and SVG arrows.
  - `js/ui-dice.js` — Dice Chess 3D-style SVG die faces, roll animation, auto-roll toggle, and eligible-piece square highlights.
  - `js/ui-schrodinger.js` — Schrödinger's Chess live shared Quantum Pool HUD and move-collapse hint bar.
  - `js/ui-chat.js` — P2P chat rendering, badge/emoji picker, mobile/desktop tab badges, and notification sound triggers.
  - `js/ui-panels.js` — Variant `(i)` tooltip portal, board editor controls, leave confirmation modal, PGN copy, and URL auto-join.
  - `js/main.js` — DOM wiring (`initUI`), event listeners, timers, and Node/CommonJS test exports.
- `invite/` — Static HTML redirect pages with per-variant Open Graph previews (`standard.html`, `cannibal.html`, `crazyhouse.html`, `fog.html`, `secret.html`, `dice.html`, `schrodinger.html`) pointing to `assets/og/*.jpg`.
- `tests/` — Verification runner (`tests/run-all.js`), shared loader (`tests/load-app.js`), and 13 automated suites covering engine perft, variants, Schrödinger's Chess, premoves, networking, chat, mobile UI, and invite security.

## Running Tests

```bash
node tests/run-all.js
```
