import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('DischargePanel uses explicit state and independent permissions with no backend claims', async () => {
  const [panel, harness] = await Promise.all([
    readFile(new URL('../src/discharge/DischargePanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./discharge-harness.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(panel, /function DischargePanel\(\{ language = 'en', textScale = 1, state, permissions = \{\} \}/);
  assert.match(panel, /createDischargeModel/);
  assert.match(panel, /accessibilityRole="header"/);
  assert.doesNotMatch(panel, /A03|ORM|ORU|fetch\(|searchResources|contrast AA|two screens/i);
  assert.match(harness, /textScale=\{1\.5\}/);
});
