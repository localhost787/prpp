import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import * as studies from '../src/studies.mjs';
import { translate } from '../src/i18n.mjs';
import * as ui from '../src/ui.mjs';
import { createNoticesModel, SYNTHETIC_NOTICE_FIXTURE } from '../src/notices/notices.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const native = require('react-native-web');
const babel = require('@babel/core');
const session = { patient: { id: 'carmen' }, permissions: { visita: true, estudios: true } };
async function panel(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { code } = babel.transformSync(source, {
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return React;
    if (name === 'react-native') return native;
    if (name.endsWith('/ui.mjs')) return ui;
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports.default;
}
async function renderStudies(language, state) {
  const controller = { subscribe: () => () => {}, getSnapshot: () => state };
  const Panel = await panel('../src/StudiesPanel.jsx', {
    './studies.mjs': { ...studies, createStudiesController: () => controller },
    './Language.jsx': { useLanguage: () => ({ language, t: (key, values) => translate(language, key, values) }) },
  });
  return renderToStaticMarkup(React.createElement(Panel, { session, Label: native.Text, Action: native.Text, styles: {}, scale: 1 }));
}

test('study metadata explains missing details once without hiding documented purpose', async () => {
  const state = await studies.loadStudies(session);
  for (const language of ['en', 'es']) {
    const html = await renderStudies(language, state);
    const missing = language === 'es' ? 'Algunos estudios no incluyen una descripción. No hay tiempos de entrega disponibles.' : 'Some studies do not include a description. Completion times are not available.';
    assert.equal(html.split(missing).length - 1, 1, 'One plain-language metadata note');
    assert.doesNotMatch(html, /approved example source|fuente aprobada del ejemplo/);
    assert.ok(html.includes(translate(language, 'studyPurposeBloodCulture')));
  }
});

test('known synthetic notices have patient-facing bilingual text without changing source rows', async () => {
  const Panel = await panel('../src/notices/NoticesPanel.jsx');
  for (const language of ['en', 'es']) {
    const state = createNoticesModel({ language, permission: true, communications: SYNTHETIC_NOTICE_FIXTURE });
    const before = JSON.stringify(state);
    const html = renderToStaticMarkup(React.createElement(Panel, { language, state }));
    assert.equal(/Synthetic (arrival|triage|cubicle) notice/.test(html), false, 'No raw fixture labels');
    for (const label of language === 'es' ? ['Se registró su llegada.', 'Se registró su evaluación inicial.', 'Pasó al área de atención.'] : ['Your arrival was registered.', 'Your initial assessment was recorded.', 'You were moved to the treatment area.']) assert.ok(html.includes(label), label);
    assert.equal(JSON.stringify(state), before);
    for (const item of state.items) assert.ok(html.includes(item.time));
  }
});

test('notice localization leaves unknown and non-synthetic text untouched', async () => {
  const Panel = await panel('../src/notices/NoticesPanel.jsx');
  const communications = [
    { id: 'arrival', text: 'Original clinical message', synthetic: true },
    { id: 'triage', text: 'Synthetic triage notice', synthetic: false },
    { id: 'unknown', text: 'Unrecognized synthetic message', synthetic: true },
    { id: 'constructor', text: 'Another original message', synthetic: true },
  ];
  for (const language of ['en', 'es']) {
    const state = createNoticesModel({ language, permission: true, communications });
    const html = renderToStaticMarkup(React.createElement(Panel, { language, state }));
    for (const row of communications) assert.ok(html.includes(row.text));
  }
});

test('restricted, unavailable and empty views do not acquire study details or metadata claims', async () => {
  for (const language of ['en', 'es']) {
    for (const state of [{ status: 'restricted', items: [], count: 1 }, { status: 'unavailable', items: [] }, { status: 'empty', items: [] }]) {
      const html = await renderStudies(language, state);
      assert.doesNotMatch(html, /data-testid="study-row"|Completion times|tiempos de entrega/);
      const key = { restricted: 'studiesRestricted', unavailable: 'studiesUnavailable', empty: 'studiesEmpty' }[state.status];
      assert.ok(html.includes(translate(language, key, { count: 1 })));
    }
  }
});

test('study presentation gives discrete named states without numeric progress claims', async () => {
  const state = await studies.loadStudies(session);
  for (const language of ['en', 'es']) {
    const html = await renderStudies(language, state);
    assert.doesNotMatch(html, /role="progressbar"|aria-valuenow|width:(?:15|35|60|80|100)%/);
    for (const item of state.items) {
      const row = studies.studyPresentation(item, language);
      assert.ok(html.includes(row.status));
      assert.ok(html.includes(row.explanation));
    }
  }
});
