import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('WaitPanel is isolated, scalable, and contains no subscription or timing claim', async () => {
  const [panel, harness] = await Promise.all([
    readFile(new URL('../src/wait/WaitPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./wait-harness.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(panel, /function WaitPanel\(\{ language = 'en', textScale = 1, state \}/);
  assert.match(panel, /\.\.\.surfaceStyles\.card/);
  assert.match(panel, /accessibilityLiveRegion="polite"/);
  assert.doesNotMatch(panel, /useSubscription|WebSocket|poll|5 seconds|5 segundos|fetch\(/i);
  assert.match(harness, /textScale=\{1\.5\}/);
});
