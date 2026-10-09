import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panelUrl = new URL('../src/family/FamilyPanel.jsx', import.meta.url);
const harnessUrl = new URL('./family-harness.jsx', import.meta.url);

test('isolated FamilyPanel contract uses props, accessible 44px controls, and no shared integrations', async () => {
  const [panel, harness] = await Promise.all([
    readFile(panelUrl, 'utf8'),
    readFile(harnessUrl, 'utf8'),
  ]);

  assert.match(panel, /function FamilyPanel\(\{[\s\S]*language[\s\S]*textScale[\s\S]*viewer[\s\S]*patient[\s\S]*permissions[\s\S]*state[\s\S]*onToggleCategory[\s\S]*onRemoveAccess/);
  assert.match(panel, /accessibilityRole="switch"/);
  assert.match(panel, /accessibilityState=\{\{ checked:/);
  assert.match(panel, /minHeight: controlSizes\.compact/);
  assert.match(panel, /onToggleCategory\?\.\(\{ caregiverId: caregiver\.id, category: category\.id, enabled:/);
  assert.match(panel, /onRemoveAccess\?\.\(\{ caregiverId: caregiver\.id \}\)/);
  assert.doesNotMatch(panel, /auth\/me|executeBot|searchResources|fetch\(|localStorage|BroadcastChannel|geolocation/);
  assert.match(harness, /<FamilyPanel/);
  assert.match(harness, /viewer=\{\{ kind: 'patient' \}\}/);
});
