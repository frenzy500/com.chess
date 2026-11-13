'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getAppSources, EXPECTED_ASSET_VERSION } = require('./load-app');

const TESTS = [
  'test_engine.js',
  'test_variants.js',
  'test_secret_queen.js',
  'test_dice_chess.js',
  'test_schrodinger.js',
  'test_custom_position_and_home.js',
  'test_multi_premove_edges.js',
  'test_v2_features.js',
  'test_cross_platform_networking.js',
  'test_mobile_and_icons.js',
  'test_ui_improvements.js',
  'test_og_and_concurrent_joins.js',
  'test_chat_and_mobile.js'
];

function checkSyntaxAndAssets() {
  const { repoDir, cssSources, jsSources } = getAppSources();
  const expectedCss = [
    'css/base.css',
    'css/board.css',
    'css/sidebar.css',
    'css/chat.css',
    'css/editor.css',
    'css/responsive.css'
  ];
  const expectedJs = [
    'js/variants.js',
    'js/schrodinger.js',
    'js/engine.js',
    'js/audio.js',
    'js/pieces.js',
    'js/state.js',
    'js/network-codec.js',
    'js/network-transport.js',
    'js/network-session.js',
    'js/ui-premoves.js',
    'js/ui-input.js',
    'js/ui-board.js',
    'js/ui-dice.js',
    'js/ui-schrodinger.js',
    'js/ui-chat.js',
    'js/ui-panels.js',
    'js/main.js'
  ];

  const actualCss = cssSources.map((s) => s.path);
  const actualJs = jsSources.map((s) => s.path);
  if (JSON.stringify(actualCss) !== JSON.stringify(expectedCss)) {
    throw new Error(`CSS load order mismatch: ${JSON.stringify(actualCss)}`);
  }
  if (JSON.stringify(actualJs) !== JSON.stringify(expectedJs)) {
    throw new Error(`JS load order mismatch: ${JSON.stringify(actualJs)}`);
  }
  for (const s of [...cssSources, ...jsSources]) {
    if (s.version !== EXPECTED_ASSET_VERSION) {
      throw new Error(`Asset ${s.path} has ?v=${s.version}, expected ?v=${EXPECTED_ASSET_VERSION}`);
    }
  }
  for (const rel of expectedJs) {
    const res = spawnSync(process.execPath, ['--check', path.join(repoDir, rel)], { encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`Syntax check failed for ${rel}:\n${res.stderr}`);
    }
  }
  if (fs.existsSync(path.join(repoDir, 'game.js')) || fs.existsSync(path.join(repoDir, 'style.css'))) {
    throw new Error('Monolithic root game.js / style.css must be removed after modular split');
  }
}

console.log('=== Verifying Modular Structure, Asset Versions & JS Syntax ===');
try {
  checkSyntaxAndAssets();
  console.log(`PASS: 6 CSS modules + 17 JS modules validated (?v=${EXPECTED_ASSET_VERSION}), syntax clean.\n`);
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

for (const file of TESTS) {
  const fullPath = path.join(__dirname, file);
  process.stdout.write(`Running ${file} ... `);
  const res = spawnSync(process.execPath, [fullPath], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  if (res.status === 0) {
    passed++;
    console.log('PASS');
  } else {
    failed++;
    console.log('FAIL');
    failures.push({
      file,
      status: res.status,
      stdout: res.stdout || '',
      stderr: res.stderr || ''
    });
  }
}

console.log(`\n=== Test Summary: ${passed}/${TESTS.length} passed, ${failed} failed ===`);
if (failures.length > 0) {
  for (const f of failures) {
    console.error(`\n--- FAILURE IN ${f.file} (exit ${f.status}) ---`);
    if (f.stdout) console.error(f.stdout);
    if (f.stderr) console.error(f.stderr);
  }
  console.log(`TOTAL FAILED: ${failed}`);
  process.exit(1);
}

console.log('TOTAL FAILED: 0');
