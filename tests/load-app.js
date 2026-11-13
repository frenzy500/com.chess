'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const REPO_DIR = path.resolve(__dirname, '..');
const EXPECTED_ASSET_VERSION = '20261113i';

function extractOrderedAssets(html) {
  const cssMatches = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(css\/[^"?]+\.css)(?:\?v=([^"]+))?"/g)];
  const jsMatches = [...html.matchAll(/<script\s+src="(js\/[^"?]+\.js)(?:\?v=([^"]+))?"/g)];
  assert(cssMatches.length > 0, 'index.html must include ordered css/*.css <link> tags');
  assert(jsMatches.length > 0, 'index.html must include ordered js/*.js <script> tags');
  return {
    cssEntries: cssMatches.map((m) => ({ file: m[1], version: m[2] || '' })),
    jsEntries: jsMatches.map((m) => ({ file: m[1], version: m[2] || '' }))
  };
}

function getAppSources() {
  const html = fs.readFileSync(path.join(REPO_DIR, 'index.html'), 'utf8');
  const { cssEntries, jsEntries } = extractOrderedAssets(html);

  const cssSources = cssEntries.map(({ file, version }) => {
    const absPath = path.join(REPO_DIR, file);
    assert(fs.existsSync(absPath), `Missing stylesheet referenced by index.html: ${file}`);
    return {
      path: file,
      version,
      content: fs.readFileSync(absPath, 'utf8')
    };
  });

  const jsSources = jsEntries.map(({ file, version }) => {
    const absPath = path.join(REPO_DIR, file);
    assert(fs.existsSync(absPath), `Missing script referenced by index.html: ${file}`);
    return {
      path: file,
      version,
      content: fs.readFileSync(absPath, 'utf8')
    };
  });

  return {
    repoDir: REPO_DIR,
    html,
    cssFiles: cssSources.map((s) => s.path),
    cssSources,
    css: cssSources.map((s) => s.content).join('\n'),
    jsFiles: jsSources.map((s) => s.path),
    jsSources,
    js: jsSources.map((s) => s.content).join('\n'),
    expectedVersion: EXPECTED_ASSET_VERSION
  };
}

function runAppInContext(sandbox, trailerJs = '') {
  const { jsSources } = getAppSources();
  if (!vm.isContext(sandbox)) {
    vm.createContext(sandbox);
  }
  for (const src of jsSources) {
    const script = new vm.Script(src.content, {
      filename: path.join(REPO_DIR, src.path)
    });
    script.runInContext(sandbox);
  }
  if (trailerJs) {
    const trailer = new vm.Script(trailerJs, {
      filename: path.join(__dirname, '__test_trailer__.js')
    });
    trailer.runInContext(sandbox);
  }
  return sandbox;
}

function loadAppExports() {
  const { jsSources } = getAppSources();
  const safeSetInterval = (...args) => {
    const id = setInterval(...args);
    if (id && typeof id.unref === 'function') id.unref();
    return id;
  };
  const mod = { exports: {} };
  const combined = jsSources
    .map((s) => `/* === ${s.path} === */\n${s.content}`)
    .join('\n');
  // Compile in the caller's V8 realm inside an isolated function closure so
  // Array/Object prototypes match Node's assert.deepStrictEqual checks.
  const factory = vm.runInThisContext(
    `(function(module, exports, document, window, setInterval) {\n'use strict';\n${combined}\n})`,
    { filename: path.join(REPO_DIR, 'js', 'virtual-bundle.js') }
  );
  factory(mod, mod.exports, undefined, undefined, safeSetInterval);
  return mod.exports;
}

module.exports = {
  REPO_DIR,
  EXPECTED_ASSET_VERSION,
  extractOrderedAssets,
  getAppSources,
  runAppInContext,
  loadAppExports
};
