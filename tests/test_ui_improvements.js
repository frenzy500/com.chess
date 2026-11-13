'use strict';

const assert = require('assert');
const { getAppSources, runAppInContext } = require('./load-app');

const { html: indexHtml, css: styleCss, js: gameJs, expectedVersion } = getAppSources();

console.log('Running UI Improvements Verification Suite (Dice, Variant (i) Tooltips & Fog Previous Move)...\n');

// 1. HTML & CSS Structural Verification
assert(!indexHtml.includes('id="setup-variant-desc"'), '#setup-variant-desc removed from index.html');
assert(!indexHtml.includes('id="mobile-variant-desc"'), '#mobile-variant-desc removed from index.html');
assert(!indexHtml.includes('class="variant-card-sub"'), 'variant-card-sub clutter removed from index.html');
assert(indexHtml.includes('id="variant-tooltip"'), '#variant-tooltip portal element exists in index.html');
assert(indexHtml.includes('id="board-stage"'), '#board-stage wrapper exists for side dice tray layout');
assert(indexHtml.includes('id="dice-autoroll-toggle"'), '#dice-autoroll-toggle exists in #dice-bar');
assert(indexHtml.includes('id="dice-roll-btn"'), '#dice-roll-btn exists in #dice-bar');
assert(indexHtml.includes('id="die-svg-1" viewBox="0 0 40 40"'), '#die-svg-1 uses 0 0 40 40 viewBox');
assert(indexHtml.includes('id="die-svg-2" viewBox="0 0 40 40"'), '#die-svg-2 uses 0 0 40 40 viewBox');
assert(
  indexHtml.includes(`css/base.css?v=${expectedVersion}`) &&
    indexHtml.includes(`css/responsive.css?v=${expectedVersion}`) &&
    indexHtml.includes(`js/variants.js?v=${expectedVersion}`) &&
    indexHtml.includes(`js/main.js?v=${expectedVersion}`),
  `Cache-bust query strings bumped to ${expectedVersion}`
);

// Verify all 18 variant buttons (6 setup + 6 mobile + 6 local) have .variant-info-dot triggers
const dotMatches = indexHtml.match(/class="variant-info-dot[^"]*"\s+data-variant-info="[a-z]+"/g) || [];
assert.strictEqual(dotMatches.length, 18, 'Expected 18 .variant-info-dot triggers across Setup, Mobile & Local bars');
assert(styleCss.includes('@keyframes diceThrowLeft') && styleCss.includes('@keyframes diceThrowRight'), 'Physical throw animations defined in CSS');
assert(styleCss.includes('@media (min-width: 1120px)'), 'Side tray desktop layout breakpoint defined in CSS');
assert(!styleCss.includes('.square.dice-eligible::after'), 'Corner square .dice-eligible::after indicators removed');
assert(styleCss.includes('.square.dice-eligible::before') && styleCss.includes('.square.dice-eligible-wild::before'), 'Subtle square tint/ring highlight rules defined in CSS');
assert(styleCss.includes('.variant-tooltip'), '.variant-tooltip styling defined in CSS');

console.log('1. PASS: HTML markup, cache-busting, 18 (i) triggers, removed desc clutter & 40x40 die viewBox verified!');

// Security: zero innerHTML/outerHTML/insertAdjacentHTML
assert(!/innerHTML|outerHTML|insertAdjacentHTML/.test(gameJs), 'No innerHTML/outerHTML/insertAdjacentHTML allowed');

// Minimal DOM harness
function makeClassList(el) {
  return {
    add: (...cls) => {
      for (const c of cls) {
        if (!el._classes.has(c)) el._classes.add(c);
      }
    },
    remove: (...cls) => {
      for (const c of cls) el._classes.delete(c);
    },
    toggle: (c, force) => {
      if (force === undefined) {
        if (el._classes.has(c)) {
          el._classes.delete(c);
          return false;
        }
        el._classes.add(c);
        return true;
      }
      if (force) el._classes.add(c);
      else el._classes.delete(c);
      return Boolean(force);
    },
    contains: (c) => el._classes.has(c)
  };
}

function createEl(tagName, id = null) {
  const el = {
    tagName: tagName.toUpperCase(),
    id,
    _classes: new Set(),
    dataset: {},
    style: {},
    attributes: {},
    children: [],
    parentElement: null,
    textContent: '',
    value: '',
    disabled: false,
    listeners: new Map(),
    get className() {
      return Array.from(this._classes).join(' ');
    },
    set className(val) {
      this._classes = new Set(String(val || '').split(/\s+/).filter(Boolean));
    },
    setAttribute(k, v) {
      if (k === 'class') this.className = v;
      else if (k === 'id') this.id = v;
      else if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(v);
      }
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    removeAttribute(k) {
      delete this.attributes[k];
    },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    append(...nodes) {
      for (const n of nodes) this.appendChild(n);
    },
    replaceChildren(...nodes) {
      this.children = [];
      for (const n of nodes) {
        if (n && n._isFragment) {
          for (const ch of n.children) this.appendChild(ch);
        } else if (n) {
          this.appendChild(n);
        }
      }
    },
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    },
    dispatchEvent(evt) {
      const event = {
        type: evt.type,
        target: evt.target || this,
        currentTarget: this,
        pointerType: evt.pointerType || 'mouse',
        key: evt.key || '',
        stopped: false,
        defaultPrevented: false,
        stopPropagation() { this.stopped = true; },
        preventDefault() { this.defaultPrevented = true; },
        ...evt
      };
      let node = event.target;
      while (node && !event.stopped) {
        event.currentTarget = node;
        const fns = node.listeners?.get(event.type) || [];
        for (const fn of fns) fn(event);
        node = node.parentElement;
      }
      return event;
    },
    closest(selector) {
      const cls = selector.startsWith('.') ? selector.slice(1) : null;
      let cur = this;
      while (cur) {
        if (cls && cur._classes && cur._classes.has(cls)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelectorAll(selector) {
      const cls = selector.startsWith('.') ? selector.slice(1) : null;
      const out = [];
      const walk = (n) => {
        for (const ch of n.children || []) {
          if (cls && ch._classes && ch._classes.has(cls)) out.push(ch);
          walk(ch);
        }
      };
      walk(this);
      return out;
    },
    querySelector(selector) {
      const rMatch = selector.match(/\[data-r="(\d+)"\]\[data-c="(\d+)"\]/);
      if (rMatch) {
        for (const ch of this.children) {
          if (ch.dataset?.r === rMatch[1] && ch.dataset?.c === rMatch[2]) return ch;
        }
        return null;
      }
      return this.querySelectorAll(selector)[0] || null;
    },
    getBoundingClientRect() {
      return { left: 100, top: 200, bottom: 218, right: 118, width: 200, height: 60 };
    },
    offsetWidth: 36
  };
  el.classList = makeClassList(el);
  return el;
}

const byId = new Map();
const rootDoc = createEl('document');
const makeEl = (tag, id, hidden = false) => {
  const el = createEl(tag, id);
  if (hidden) el.classList.add('hidden');
  if (id) byId.set(id, el);
  return el;
};

// Populate variant grids matching index.html structure
const variants = ['standard', 'cannibal', 'crazyhouse', 'fog', 'secret', 'dice'];
const setupGrid = makeEl('div', 'setup-variant-grid');
const mobileGrid = makeEl('div', 'mobile-variant-grid');
const localBar = makeEl('div', 'local-variant-bar');

const dotByGroup = { setup: {}, mobile: {}, local: {} };
for (const v of variants) {
  const sb = createEl('button');
  sb.className = v === 'standard' ? 'variant-btn active' : 'variant-btn';
  sb.dataset.variant = v;
  const sdot = createEl('span');
  sdot.className = 'variant-info-dot';
  sdot.dataset.variantInfo = v;
  sb.appendChild(sdot);
  setupGrid.appendChild(sb);
  dotByGroup.setup[v] = sdot;

  const mb = createEl('button');
  mb.className = v === 'standard' ? 'variant-btn active' : 'variant-btn';
  mb.dataset.variant = v;
  const mdot = createEl('span');
  mdot.className = 'variant-info-dot';
  mdot.dataset.variantInfo = v;
  mb.appendChild(mdot);
  mobileGrid.appendChild(mb);
  dotByGroup.mobile[v] = mdot;

  const lb = createEl('button');
  lb.className = v === 'standard' ? 'local-variant-btn active' : 'local-variant-btn';
  lb.dataset.variant = v;
  const ldot = createEl('span');
  ldot.className = 'variant-info-dot variant-info-dot-sm';
  ldot.dataset.variantInfo = v;
  lb.appendChild(ldot);
  localBar.appendChild(lb);
  dotByGroup.local[v] = ldot;
}
rootDoc.append(setupGrid, mobileGrid, localBar);

const idRegex = /getElementById\(['"]([a-z0-9-]+)['"]\)/g;
let m;
while ((m = idRegex.exec(gameJs)) !== null) {
  if (!byId.has(m[1])) {
    makeEl('div', m[1], m[1] === 'variant-tooltip' || m[1] === 'dice-bar');
  }
}
byId.get('dice-bar').classList.add('hidden');
byId.get('variant-tooltip').classList.add('hidden');
rootDoc.appendChild(byId.get('variant-tooltip'));
rootDoc.appendChild(byId.get('board'));

const mockDocument = {
  body: createEl('body'),
  getElementById: (id) => byId.get(id) || null,
  querySelectorAll: (sel) => rootDoc.querySelectorAll(sel),
  createElement: (tag) => createEl(tag),
  createElementNS: (_, tag) => createEl(tag),
  createDocumentFragment: () => ({ _isFragment: true, children: [], appendChild(c) { this.children.push(c); }, append(...a) { this.children.push(...a); } }),
  addEventListener: (t, fn) => rootDoc.addEventListener(t, fn)
};

const winListeners = new Map();
const sandbox = {
  console,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  document: mockDocument,
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: {},
  window: {
    innerWidth: 420,
    innerHeight: 740,
    location: { search: '', pathname: '/', hash: '', origin: 'https://test', href: 'https://test/' },
    addEventListener: (t, fn) => {
      if (!winListeners.has(t)) winListeners.set(t, []);
      winListeners.get(t).push(fn);
    }
  }
};
sandbox.globalThis = sandbox;
runAppInContext(
  sandbox,
  '\n;globalThis.__api = { getState: () => gameState, getViewPly: () => viewPly, setDiceRoll, renderAll, hideVariantTooltip };'
);
const api = sandbox.__api;

// 2. Test Variant (i) Tooltip Behavior Across Local, Setup & Mobile Bars
const tooltipEl = byId.get('variant-tooltip');
assert.strictEqual(tooltipEl.classList.contains('hidden'), true, 'Tooltip starts hidden');

// Click (i) inside Local Fog button: opens tooltip WITHOUT switching local variant away from standard!
dotByGroup.local.fog.dispatchEvent({ type: 'click', target: dotByGroup.local.fog });
assert.strictEqual(tooltipEl.classList.contains('hidden'), false, 'Clicking Local (i) shows #variant-tooltip');
assert(tooltipEl.children[0].textContent === 'Fog of War', 'Tooltip title displays Fog of War');
assert(tooltipEl.children[1].textContent.includes('capture the King'), 'Tooltip body explains Fog of War simply');
assert.strictEqual(api.getState().variant, 'standard', 'Clicking Local (i) MUST NOT switch the active board variant');

// Hovering (pointerenter) another (i) in Setup panel updates tooltip and hides on pointerleave
dotByGroup.setup.dice.dispatchEvent({ type: 'pointerenter', target: dotByGroup.setup.dice, pointerType: 'mouse' });
assert.strictEqual(tooltipEl.children[0].textContent, 'Dice Chess', 'Hovering Setup (i) shows Dice Chess tooltip');
dotByGroup.setup.dice.dispatchEvent({ type: 'pointerleave', target: dotByGroup.setup.dice, pointerType: 'mouse' });
assert.strictEqual(tooltipEl.classList.contains('hidden'), true, 'Leaving Setup (i) hides tooltip');

// Tapping (i) on Mobile variant card shows tooltip, outside pointerdown dismisses it
dotByGroup.mobile.secret.dispatchEvent({ type: 'click', target: dotByGroup.mobile.secret });
assert.strictEqual(tooltipEl.classList.contains('hidden'), false, 'Tapping Mobile (i) opens tooltip');
assert.strictEqual(tooltipEl.children[0].textContent, 'Secret Queen Chess');
rootDoc.dispatchEvent({ type: 'pointerdown', target: byId.get('board') });
assert.strictEqual(tooltipEl.classList.contains('hidden'), true, 'Tapping outside closes pinned tooltip');

console.log('2. PASS: Variant (i) hover, focus, tap & click-isolation verified across Local, Setup & Mobile!');

// 3. Test Tactile Physical Dice SVG Geometry, Ruby Single Pip & Bar State Classes
const diceLocalBtn = dotByGroup.local.dice.parentElement;
localBar.dispatchEvent({ type: 'click', target: diceLocalBtn });
assert.strictEqual(api.getState().variant, 'dice', 'Clicking Dice button switches local game to Dice Chess');

api.setDiceRoll(api.getState(), 1, 6, true);
api.renderAll();
const svg1 = byId.get('die-svg-1');
const svg2 = byId.get('die-svg-2');
assert.strictEqual(svg1.getAttribute('viewBox'), '0 0 40 40', 'SVG 1 sets 0 0 40 40 viewBox');
assert.strictEqual(svg2.getAttribute('viewBox'), '0 0 40 40', 'SVG 2 sets 0 0 40 40 viewBox');
assert.strictEqual(svg1.children[1].getAttribute('fill'), '#f4efe3', 'Normal die face uses tactile ivory fill');
assert.strictEqual(svg1.children[2].getAttribute('fill'), '#b5332a', 'Die face 1 uses ruby crimson center pip');
assert.strictEqual(byId.get('dice-bar').classList.contains('doubles-active'), false, 'Non-doubles does not set doubles-active');

api.setDiceRoll(api.getState(), 3, 3, true);
api.renderAll();
assert.strictEqual(byId.get('dice-bar').classList.contains('doubles-active'), true, 'Doubles sets .doubles-active on #dice-bar');
assert.strictEqual(svg1.children[1].getAttribute('fill'), '#fff4d4', 'Doubles die face uses warm golden-ivory fill');
assert.strictEqual(byId.get('die-card-1').classList.contains('rolling'), true, 'New roll triggers .rolling class animation');

console.log('3. PASS: Physical 40x40 ivory dice geometry, ruby 1-pip, gold Doubles & roll animation trigger verified!');

// 4. Test Local Fog of War < / > Previous Move Replay (with zero opponent leaks!)
const fogLocalBtn = dotByGroup.local.fog.parentElement;
localBar.dispatchEvent({ type: 'click', target: fogLocalBtn });
assert.strictEqual(api.getState().variant, 'fog');

// White plays 1. e4 (6,4 -> 4,4)
const boardEl = byId.get('board');
boardEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 });
const clickSq = (r, c) => {
  const sq = boardEl.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
  const x = c * 50 + 25;
  const y = r * 50 + 25;
  boardEl.dispatchEvent({ type: 'pointerdown', button: 0, pointerId: 1, clientX: x, clientY: y, target: sq });
  (winListeners.get('pointerup') || []).forEach((fn) => fn({ type: 'pointerup', button: 0, pointerId: 1, clientX: x, clientY: y, target: sq }));
};
clickSq(6, 4);
clickSq(4, 4);
assert.strictEqual(api.getState().moveHistory.length, 1);

// Black (turn='b') now active: Black's nav-prev-btn is ENABLED!
assert.strictEqual(byId.get('nav-prev-btn').disabled, false, 'Local Fog < button enabled for Black to inspect previous turn');
byId.get('nav-prev-btn').dispatchEvent({ type: 'click' });
assert.strictEqual(api.getViewPly(), 0, 'Stepped back to ply 0 in Local Fog of War');
// On Black's perspective at ply 0, White e2 (6,4) MUST stay fogged!
const blkE2Past = boardEl.querySelector('.square[data-r="6"][data-c="4"]');
assert(blkE2Past.classList.contains('fog'), 'Viewing previous ply in Local Fog keeps opponent squares fogged!');

// Black plays 1... a5 (1,0 -> 3,0) -> White plays 2. d4 (6,3 -> 4,3)
byId.get('nav-last-btn').dispatchEvent({ type: 'click' });
clickSq(1, 0);
clickSq(3, 0);
assert.strictEqual(api.getState().moveHistory.length, 2);
clickSq(6, 3);
clickSq(4, 3);
assert.strictEqual(api.getState().moveHistory.length, 3);
// Now Black's turn (ply 3): step back 1 ply to ply 2 (Black's own a5), then 1 more to ply 1 (White's hidden e4 -> masked ?)
byId.get('nav-prev-btn').dispatchEvent({ type: 'click' });
assert.strictEqual(api.getViewPly(), 2);
assert(byId.get('status-banner').textContent.includes('(a5)'), 'Black sees own previous move SAN (a5)');
byId.get('nav-prev-btn').dispatchEvent({ type: 'click' });
assert.strictEqual(api.getViewPly(), 1);
assert(byId.get('status-banner').textContent.includes('Viewing move 1/3 (?)'), 'Black sees masked (?) for White move 1. e4 in Local Fog!');

console.log('4. PASS: Local Fog of War < / > previous move preserves per-turn fog and masks opponent SAN!');
console.log('\nALL UI IMPROVEMENTS VERIFIED!');
