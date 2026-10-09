import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

import * as waitModel from '../src/wait/wait.mjs';
import * as noticesModel from '../src/notices/notices.mjs';
import * as dischargeModel from '../src/discharge/discharge.mjs';
import * as ui from '../src/ui.mjs';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const React = require('react');
const ReactNativeWeb = require('react-native-web');

function compile(source, resolveImport) {
  const { code } = babel.transformSync(source, {
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    sourceType: 'module',
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', code)(resolveImport, module, module.exports);
  return module.exports.default;
}

async function renderHarness({ panelPath, harnessPath, modelPath, modelModule }) {
  const modelFile = modelPath.split('/').pop();
  const panelSource = await readFile(new URL(panelPath, import.meta.url), 'utf8');
  const Panel = compile(panelSource, specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react-native') return ReactNativeWeb;
    if (specifier === '../ui.mjs') return ui;
    if (specifier.endsWith(modelFile)) return modelModule;
    throw new Error(`Unexpected panel import: ${specifier}`);
  });
  const harnessSource = await readFile(new URL(harnessPath, import.meta.url), 'utf8');
  const panelImport = panelPath.replace('../src/', '../src/');
  const Harness = compile(harnessSource, specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react-native') return ReactNativeWeb;
    if (specifier === panelImport) return { __esModule: true, default: Panel };
    if (specifier.endsWith(modelFile)) return modelModule;
    throw new Error(`Unexpected harness import: ${specifier}`);
  });
  return renderToStaticMarkup(React.createElement(Harness));
}

test('isolated functional-2 harnesses SSR at 390px with 150% headings and body copy', async () => {
  const waitHtml = await renderHarness({
    panelPath: '../src/wait/WaitPanel.jsx',
    harnessPath: './wait-harness.jsx',
    modelPath: '../src/wait/wait.mjs',
    modelModule: waitModel,
  });
  assert.match(waitHtml, /width:390px/);
  assert.match(waitHtml, /font-size:36px/);
  assert.match(waitHtml, /font-size:24px/);
  assert.match(waitHtml, /Why am I waiting/);

  const noticesHtml = await renderHarness({
    panelPath: '../src/notices/NoticesPanel.jsx',
    harnessPath: './notices-harness.jsx',
    modelPath: '../src/notices/notices.mjs',
    modelModule: noticesModel,
  });
  assert.match(noticesHtml, /width:390px/);
  assert.match(noticesHtml, /font-size:36px/);
  assert.match(noticesHtml, /font-size:24px/);
  assert.match(noticesHtml, /Synthetic example/);

  const dischargeHtml = await renderHarness({
    panelPath: '../src/discharge/DischargePanel.jsx',
    harnessPath: './discharge-harness.jsx',
    modelPath: '../src/discharge/discharge.mjs',
    modelModule: dischargeModel,
  });
  assert.match(dischargeHtml, /width:390px/);
  assert.match(dischargeHtml, /font-size:42px/);
  assert.match(dischargeHtml, /font-size:30px/);
  assert.match(dischargeHtml, /font-size:24px/);
  assert.match(dischargeHtml, /Vuelva a Emergencias si/);
});
