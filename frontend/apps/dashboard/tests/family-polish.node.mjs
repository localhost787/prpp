import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import * as family from '../src/family/family.mjs';
import * as ui from '../src/ui.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const native = require('react-native-web');
const { code } = require('@babel/core').transformSync(
  await readFile(new URL('../src/family/FamilyPanel.jsx', import.meta.url), 'utf8'),
  {
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  },
);
const module = { exports: {} };
Function('require', 'module', 'exports', code)(name => {
  if (name === 'react') return React;
  if (name === 'react-native') return native;
  if (name === './family.mjs') return family;
  if (name === '../ui.mjs') return ui;
  throw new Error(`Unexpected import: ${name}`);
}, module, module.exports);
const render = props => renderToStaticMarkup(React.createElement(module.exports.default, props));

test('permission rows show decorative switch tracks and explicit local sharing meaning in both languages', () => {
  for (const [language, shared, privateText, onLabel, offLabel] of [
    ['es', 'Compartido en este ejemplo local', 'Privado en este ejemplo local', 'Estado en Emergencias: Activado', 'Estudios y resultados: Desactivado'],
    ['en', 'Shared in this local example', 'Private in this local example', 'Emergency status: On', 'Studies and results: Off'],
  ]) {
    const html = render({ language });
    assert.ok(html.includes(shared), 'enabled permission explains local sharing');
    assert.ok(html.includes(privateText), 'disabled permission explains local privacy');
    assert.ok(html.includes(`aria-label="${onLabel}"`));
    assert.ok(html.includes(`aria-label="${offLabel}"`));
    assert.equal((html.match(/role="switch"/g) ?? []).length, 4);
    assert.equal((html.match(/data-testid="family-switch-track"/g) ?? []).length, 4);
    assert.equal((html.match(/data-testid="family-switch-thumb"/g) ?? []).length, 4);
    assert.match(html, /aria-hidden="true"[^>]*data-testid="family-switch-track"/);
    assert.match(html, /aria-checked="true"/);
    assert.match(html, /aria-checked="false"/);
  }
});

test('unknown permission stays disabled and does not claim sharing; delegate has no owner switches', () => {
  const permissions = [{ id: 'lourdes', name: 'Lourdes', permissions: {} }];
  const html = render({ language: 'es', permissions });
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 4);
  assert.match(html, /Acceso no confirmado/);
  assert.doesNotMatch(html, /Compartido en este ejemplo local|Privado en este ejemplo local/);
  const delegate = render({ viewer: { kind: 'delegate', caregiverId: 'lourdes' } });
  assert.doesNotMatch(delegate, /role="switch"|family-switch-track|Turn off access/);
});
