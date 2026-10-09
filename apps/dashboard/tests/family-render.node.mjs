import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

import * as familyModel from '../src/family/family.mjs';
import * as ui from '../src/ui.mjs';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const React = require('react');
const ReactNativeWeb = require('react-native-web');

function compileComponent(source, resolveImport) {
  const { code } = babel.transformSync(source, {
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    sourceType: 'module',
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', code)(resolveImport, module, module.exports);
  return module.exports.default;
}

test('isolated family harness renders both caregiver cards at 390px without App.jsx', async () => {
  const panelSource = await readFile(new URL('../src/family/FamilyPanel.jsx', import.meta.url), 'utf8');
  const FamilyPanel = compileComponent(panelSource, specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react-native') return ReactNativeWeb;
    if (specifier === './family.mjs') return familyModel;
    if (specifier === '../ui.mjs') return ui;
    throw new Error(`Unexpected panel import: ${specifier}`);
  });

  const harnessSource = await readFile(new URL('./family-harness.jsx', import.meta.url), 'utf8');
  const FamilyHarness = compileComponent(harnessSource, specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react-native') return ReactNativeWeb;
    if (specifier === '../src/family/FamilyPanel.jsx') return { __esModule: true, default: FamilyPanel };
    if (specifier === '../src/family/family.mjs') return familyModel;
    throw new Error(`Unexpected harness import: ${specifier}`);
  });

  const html = renderToStaticMarkup(React.createElement(FamilyHarness));
  assert.match(html, /width:390px/);
  assert.match(html, /font-size:42px/);
  assert.match(html, /font-size:30px/);
  assert.match(html, /Lourdes/);
  assert.match(html, /Rafael/);
  assert.match(html, /Emergency status/);
  assert.match(html, /Studies and results/);
  assert.match(html, /role="switch"/);
  assert.doesNotMatch(html, /Access .*immediate|Hemograma|15\.2|glóbulos/i);
});
