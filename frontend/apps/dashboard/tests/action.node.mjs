import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';
const require = createRequire(import.meta.url);
function load(file) {
  if (!existsSync(file)) return {};
  const code = transformSync(readFileSync(file, 'utf8'), {filename:file, configFile:false, babelrc:false, plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
  const module = {exports:{}};
  const localRequire = name => name === 'react-native' ? require('react-native-web') : name.endsWith('.jsx') ? load(path.resolve(path.dirname(file),name)) : require(name.startsWith('.') ? path.resolve(path.dirname(file),name) : name);
  new Function('require','module','exports',code)(localRequire,module,module.exports);
  return module.exports;
}
test('Action exposes a stable accessible label and a separate nonverbal selected marker', () => {
 const ui = load(path.resolve('src/ui/Action.jsx'));
 assert.equal(typeof ui.Action, 'function', 'shared Action must exist');
 const html = renderToStaticMarkup(React.createElement(ui.Action, {label:'Go to Results', selected:true}, 'Results'));
 assert.match(html,/aria-label="Go to Results"/);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/data-testid="selected-marker"/);
 assert.doesNotMatch(html,/Results.*(?:Active|Activo)/);
 const disabled = renderToStaticMarkup(React.createElement(ui.Action, {label:'Retry', disabled:true}, 'Retry'));
 assert.match(disabled,/aria-disabled="true"/);
 assert.match(disabled,/disabled/);
});
