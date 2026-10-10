import test from 'node:test';
import assert from 'node:assert/strict';

const studies = await import('../src/studies.mjs').catch(() => ({}));

const permitted = { account: 'carmen', role: 'self', patient: { id: 'carmen' }, permissions: { visita: true, estudios: true } };

test('authorized synthetic case presents four selected studies with documented states', async () => {
  assert.equal(typeof studies.loadStudies, 'function');
  const state = await studies.loadStudies(permitted);
  assert.equal(state.status, 'ready');
  assert.equal(state.items.length, 4);
  assert.deepEqual(state.items.map(item => item.state), ['collected', 'processing', 'preliminary', 'ready']);
  assert.equal(state.items.find(item => item.id === 'hemograma').nameKey, 'studyNameCbc');
  for (const language of ['en', 'es']) {
    const rows = state.items.map(item => studies.studyPresentation(item, language));
    assert.equal(rows.length, 4);
    assert.equal(rows.at(-1).status, language === 'es' ? 'Listo' : 'Ready');
    assert.ok(rows.every(row => row.name && row.status && row.explanation && Number.isInteger(row.progress)));
  }
});

test('explicit denial retrieves only the permitted aggregate and never study details', async () => {
  let detailCalls = 0, countCalls = 0;
  const denied = { account: 'lourdes', role: 'delegate', patient: { id: 'carmen' }, permissions: { visita: true, estudios: false } };
  const state = await studies.loadStudies(denied, () => { detailCalls++; throw new Error('DETAIL_LEAK'); }, () => { countCalls++; return 1; });
  assert.deepEqual(state, { status: 'restricted', items: [], count: 1 });
  assert.equal(detailCalls, 0);
  assert.equal(countCalls, 1);
  assert.doesNotMatch(JSON.stringify(state), /hemograma|radiograf|lactato|metabólico|hemocultivo/i);
});

test('unconfirmed permission fails closed before both sources and own Lourdes is confirmed empty', async () => {
  let calls = 0;
  for (const estudios of [undefined, null, 'true']) {
    const state = await studies.loadStudies({ ...permitted, permissions: { visita: true, estudios } }, () => { calls++; }, () => { calls++; });
    assert.deepEqual(state, { status: 'unavailable', items: [], count: null });
  }
  assert.equal(calls, 0);
  const own = await studies.loadStudies({ ...permitted, account: 'lourdes', patient: { id: 'lourdes' } });
  assert.deepEqual(own, { status: 'empty', items: [], count: 0 });
});

test('controller clears immediately and ignores late study responses after context change or close', async () => {
  assert.equal(typeof studies.createStudiesController, 'function');
  let resolve;
  const controller = studies.createStudiesController(() => new Promise(done => { resolve = done; }));
  const pending = controller.open(permitted);
  assert.equal(controller.getSnapshot().status, 'loading');
  const late = resolve;
  await controller.open({ ...permitted, account: 'lourdes', role: 'delegate', permissions: { visita: true, estudios: false } });
  late(await studies.studyFixtures('carmen'));
  await pending;
  assert.equal(controller.getSnapshot().status, 'restricted');
  assert.deepEqual(controller.getSnapshot().items, []);
  const closing = controller.open(permitted);
  controller.close();
  resolve(await studies.studyFixtures('carmen'));
  await closing;
  assert.equal(controller.getSnapshot().status, 'closed');
  assert.deepEqual(controller.getSnapshot().items, []);
});
