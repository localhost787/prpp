import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../src/context.mjs';

test('demo starts on results for an authorized owner; restricted daughter starts on visit', async () => {
  const store = createDemoStore();
  await new Promise(resolve => { const off = store.subscribe(() => { if (store.getSnapshot().status === 'ready') { off(); resolve(); } }); });
  assert.equal(store.getSnapshot().section, 'results');
  await store.enter('lourdes', 'delegate');
  assert.equal(store.getSnapshot().section, 'visit');
  assert.equal(store.getSnapshot().session.permissions.estudios, false);
  await store.enter('carmen', 'self');
  assert.equal(store.getSnapshot().section, 'results');
  store.close();
});
