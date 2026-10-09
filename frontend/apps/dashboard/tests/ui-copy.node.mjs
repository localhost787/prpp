import test from 'node:test';
import assert from 'node:assert/strict';
import { uiCopy } from '../src/ui-copy.mjs';

test('reference shell copy is bilingual and replaces named values', () => {
  assert.equal(uiCopy('es', 'entryTitle'), 'Explore el portal');
  assert.equal(uiCopy('en', 'entryTitle'), 'Explore the portal');
  assert.equal(uiCopy('es', 'welcome'), 'Su portal,\na su ritmo.');
  assert.equal(uiCopy('es', 'stage', { stage: 5 }), 'Etapa 5 de 7 · simulada');
});
