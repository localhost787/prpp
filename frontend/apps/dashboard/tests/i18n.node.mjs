import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
test('all rendered copy and accessible labels are dictionary-driven except preserved brand and size symbols', async () => {
  for (const file of ['../App.jsx', '../src/ResultsPanel.jsx', '../src/VisitPanel.jsx']) {
    const ast = parse(await readFile(new URL(file, import.meta.url), 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'JSXText' && node.value.trim()) assert.ok(['PRPP', 'Puerto Rico Patient Portal', 'A−', 'A+'].includes(node.value.trim()), `Untranslated text in ${file}: ${node.value}`);
      if (node.type === 'JSXAttribute' && ['accessibilityLabel', 'placeholder', 'label'].includes(node.name.name)) assert.notEqual(node.value?.type, 'StringLiteral', `Untranslated label in ${file}`);
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    };
    walk(ast);
  }
});
const i18n = await import('../src/i18n.mjs').catch(() => ({}));
const results = await import('../src/results.mjs');
const { resultFixtures } = await import('../src/result-fixtures.mjs');
test('canonical filters and local presentation preserve source data, codes, values, ranges, and controller state', async () => {
  assert.equal(typeof results.resultPresentation, 'function');
  let calls = 0;
  const controller = results.createResultsController(() => { calls++; return resultFixtures('carmen'); });
  await controller.open({ permissions: { estudios: true }, patient: { id: 'carmen' } });
  controller.filter('preliminary'); controller.detail('rx');
  const before = controller.getSnapshot();
  const source = JSON.stringify(before);
  for (const language of ['en', 'es', 'en']) {
    const visible = results.filterResults(before.items, before.filter);
    assert.equal(visible.length, 1);
    assert.equal(results.resultPresentation(visible[0], language).value, i18n.translate(language, 'rxValue'));
    assert.equal(results.statusLabel(visible[0], language), i18n.translate(language, 'preliminary'));
    assert.equal(results.resultPresentation(before.items[0], language).unit, i18n.translate(language, 'thousandPerMicroliter'));
    assert.equal(results.resultPresentation(before.items[1], language).unit, 'g/dL');
    assert.equal(controller.getSnapshot(), before);
    assert.equal(JSON.stringify(before), source);
  }
  assert.equal(calls, 1);
  await controller.open({ permissions: { estudios: false }, patient: { id: 'carmen' } });
  assert.equal(calls, 1);
  assert.deepEqual(controller.getSnapshot().items, []);
});
test('English default with complete deterministic en/es dictionaries and matching interpolation', () => {
  assert.equal(i18n.DEFAULT_LANGUAGE, 'en');
  assert.deepEqual(Object.keys(i18n.messages.en).sort(), Object.keys(i18n.messages.es).sort());
  for (const key of Object.keys(i18n.messages.en)) {
    for (const language of ['en', 'es']) assert.ok(i18n.messages[language][key].trim(), `${language}:${key}`);
    const parameters = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(parameters(i18n.messages.en[key]), parameters(i18n.messages.es[key]), key);
  }
  assert.equal(i18n.translate('en', 'enter'), 'Enter example');
  assert.equal(i18n.translate('es', 'enter'), 'Entrar al ejemplo');
  assert.equal(i18n.translate('en', 'resultCount', { visible: 1, total: 6 }), '1 of 6 example results');
  assert.throws(() => i18n.translate('en', 'unknown.key'));
});
test('interface copy uses no emoji pictograms; visual icons must come from the approved icon system', () => {
  const pictogram = /\p{Extended_Pictographic}/u;
  for (const [language, dictionary] of Object.entries(i18n.messages)) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.doesNotMatch(value, pictogram, `${language}:${key}`);
    }
  }
});
