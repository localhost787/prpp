import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('result cards use neutral frames and the reference value sizes', async () => {
  const text = await source('../src/ResultsPanel.jsx');
  assert.doesNotMatch(text, /borderTopColor/);
  assert.doesNotMatch(text, /borderTopWidth:\s*[234]/);
  assert.match(text, /item\.valueQuantity \? 30 : 21/);
  assert.equal((text.match(/t\('translationReview'\)/g) ?? []).length, 1);
  assert.match(text, /report-information[\s\S]*t\('translationReview'\)/);
});

test('the five portal destinations use Lucide icons', async () => {
  const text = await source('../App.jsx');
  for (const icon of ['ClipboardList', 'FileText', 'HeartPulse', 'UsersRound', 'Grid2x2']) {
    assert.match(text, new RegExp(`\\b${icon}\\b`));
  }
  assert.match(text, /testID=\{`nav-icon-\$\{section\}`\}/);
});

test('README credits the official Lucide package and licenses', async () => {
  const text = await source('../README.md');
  assert.match(text, /lucide-react-native` 1\.54\.0/);
  assert.match(text, /ISC/);
  assert.match(text, /Feather.*MIT/s);
  assert.match(text, /react-native-svg` 15\.12\.1/);
});

test('restricted notices use white neutral frames without brown or yellow accents', async () => {
  const text = await source('../App.jsx');
  const restriction = text.match(/restriction:\s*\{([^}]+)\}/)?.[1];
  assert.ok(restriction);
  assert.match(restriction, /backgroundColor:\s*palette\.white/);
  assert.match(restriction, /borderWidth:\s*1/);
  assert.match(restriction, /borderColor:\s*palette\.borderSoft/);
  assert.doesNotMatch(restriction, /palette\.(notice|warning)|borderLeftWidth/);
});

test('study cards do not add a blue frame', async () => {
  const text = await source('../src/StudiesPanel.jsx');
  assert.doesNotMatch(text, /borderLeftWidth/);
  assert.doesNotMatch(text, /borderLeftColor/);
});

test('family controls keep neutral borders and responsive cards', async () => {
  const text = await source('../src/family/FamilyPanel.jsx');
  assert.match(text, /borderColor:\s*palette\.borderSoft/);
  assert.doesNotMatch(text, /switchEnabled:[^\n]*borderColor:\s*palette\.blue/);
  assert.match(text, /flexDirection:\s*wide \? 'row' : 'column'/);
});

test('care cards use the reference spacing and responsive pair', async () => {
  const text = await source('../src/care/CarePanel.jsx');
  assert.match(text, /flexDirection:\s*wide \? 'row' : 'column'/);
  assert.match(text, /card:\s*\{ \.\.\.surfaceStyles\.card, padding:\s*24, gap:\s*16/);
  assert.doesNotMatch(text, /#52647a/);
});

test('care simulation is hidden in the shared disclosure', async () => {
  const text = await source('../src/care/CareSection.jsx');
  assert.match(text, /<Disclosure/);
  assert.doesNotMatch(text, /borderStyle:\s*'dashed'/);
});
