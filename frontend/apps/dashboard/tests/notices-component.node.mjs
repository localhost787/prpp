import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('NoticesPanel uses explicit props and contains no filtering, subscription, polling, or network logic', async () => {
  const [panel, harness] = await Promise.all([
    readFile(new URL('../src/notices/NoticesPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./notices-harness.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(panel, /function NoticesPanel\(\{ language = 'en', textScale = 1, state, unreadCount = 0, onOpen \}/);
  assert.match(panel, /onPress=\{onOpen\}/);
  assert.match(panel, /minHeight: controlSizes\.compact/);
  assert.doesNotMatch(panel, /useSubscription|WebSocket|poll|category|includes\(|fetch\(/i);
  assert.match(harness, /textScale=\{1\.5\}/);
});
