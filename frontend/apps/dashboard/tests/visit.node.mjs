import test from 'node:test';
import assert from 'node:assert/strict';
const visit = await import('../src/visit.mjs').catch(() => ({}));
import { DEFAULT_LANGUAGE, messages } from '../src/i18n.mjs';
test('bilingual presentation defaults to English, uses PR time, never alters stage', async () => {
  assert.equal(typeof visit.visitPresentation, 'function');
  const { visit: data } = await visit.loadVisit(carmen);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  const en = visit.visitPresentation(data, carmen.permissions);
  const es = visit.visitPresentation(data, carmen.permissions, 'es');
  assert.equal(en.stages[4], 'Tests'); assert.equal(es.stages[4], 'Estudios');
  assert.match(en.startedAt, /8:12/); assert.match(es.startedAt, /8:12/);
  assert.match(es.next, /Esperar resultados de laboratorio y la radiografía/);
  assert.equal(data.stage, 5);
  assert.equal(es.stages.length, 7);
  const restricted = visit.visitPresentation(data, { visita: true, estudios: false }, 'es');
  assert.doesNotMatch(JSON.stringify(restricted), /Estudios|resultados|radiograf|laboratorio/);
  for (const language of ['en', 'es']) for (let stage = 1; stage <= 7; stage++) {
    const p = visit.visitPresentation({ ...data, stage }, carmen.permissions, language);
    assert.ok(p.description.length); assert.ok(p.stages[stage - 1]);
    assert.doesNotMatch(JSON.stringify(p), /Encounter|FHIR|ESI|NPO/);
    if (stage !== 5) assert.equal(p.next, messages[language].visitNextUnavailable);
  }
});
const carmen = { patient: { id: 'carmen' }, permissions: { visita: true, estudios: true } };
test('permission denied is explicit, fail-closed, and never calls source', async () => {
  let calls = 0;
  for (const visita of [false, undefined, null, 'true']) {
    assert.deepEqual(await visit.loadVisit({ ...carmen, permissions: { visita } }, () => { calls++; }), { status: 'restricted', visit: null });
  }
  assert.equal(calls, 0);
});
test('own Lourdes is confirmed empty, delegated redaction retains only permitted visit state', async () => {
  assert.deepEqual(await visit.loadVisit({ ...carmen, patient: { id: 'lourdes' } }), { status: 'empty', visit: null });
  const delegated = await visit.loadVisit({ ...carmen, permissions: { visita: true, estudios: false } });
  assert.equal(delegated.visit.stage, 5);
  assert.equal(delegated.visit.nextKey, 'visitNextUnavailable');
  assert.equal(delegated.visit.stageKey, 'visitStagePrivate');
  assert.doesNotMatch(JSON.stringify(delegated), /Studies|laborator|radiograf|count|Observation|DiagnosticReport/);
});
test('mismatched patient or malformed stage is an error, never confirmed empty', async () => {
  for (const bad of [{ patientId: 'lourdes', stage: 5 }, { patientId: 'carmen', stage: 8 }]) {
    await assert.rejects(visit.loadVisit(carmen, async () => bad));
  }
});
test('simulation shares stages by visit, isolates context, and resets on close', async () => {
  assert.equal(typeof visit.createVisitController, 'function');
  const controller = visit.createVisitController();
  await controller.open(carmen);
  for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
    controller.stage(stage); assert.equal(controller.getSnapshot().visit.stage, stage);
  }
  controller.stage(8); assert.equal(controller.getSnapshot().visit.stage, 7);
  await controller.open({ ...carmen, account: 'rafael' });
  assert.equal(controller.getSnapshot().visit.stage, 7);
  await controller.open({ ...carmen, account: 'lourdes', permissions: { visita: true, estudios: false } });
  assert.equal(controller.getSnapshot().visit.stage, 7);
  controller.stage(5); assert.equal(controller.getSnapshot().visit.nextKey, 'visitNextUnavailable');
  await controller.open({ ...carmen, patient: { id: 'lourdes' } });
  controller.stage(3); assert.equal(controller.getSnapshot().status, 'empty');
  await controller.open(carmen); assert.equal(controller.getSnapshot().visit.stage, 5);
  controller.stage(2); controller.close(true);
  await controller.open(carmen); assert.equal(controller.getSnapshot().visit.stage, 5);
});
test('loading, error, empty, denied fixtures and stale responses never reuse visit data', async () => {
  let resolve, reject, calls = 0;
  const controller = visit.createVisitController(() => { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); });
  const pending = controller.open(carmen);
  assert.equal(controller.getSnapshot().status, 'loading');
  assert.equal(controller.getSnapshot().visit, null);
  const late = resolve;
  await controller.open({ ...carmen, permissions: { visita: false } });
  late(await visit.visitFixture('carmen')); await pending;
  assert.equal(controller.getSnapshot().status, 'restricted');
  assert.equal(controller.getSnapshot().visit, null); assert.equal(calls, 1);
  const failing = controller.open(carmen); reject(new Error('offline')); await failing;
  assert.equal(controller.getSnapshot().status, 'error'); assert.equal(controller.getSnapshot().visit, null);
  const empty = controller.open(carmen); resolve(null); await empty;
  assert.equal(controller.getSnapshot().status, 'empty');
  const closing = controller.open(carmen); controller.close(true); resolve(await visit.visitFixture('carmen')); await closing;
  assert.equal(controller.getSnapshot().status, 'closed');
  for (const [scenario, status] of [['denied', 'restricted'], ['error', 'error'], ['empty', 'empty'], ['loading', 'loading']]) {
    const before = calls; await controller.open(carmen, scenario);
    assert.equal(controller.getSnapshot().status, status); assert.equal(controller.getSnapshot().visit, null); assert.equal(calls, before);
  }
});
test('visit fixture exposes only traceable initial visit data', async () => {
  assert.equal(typeof visit.loadVisit, 'function');
  const state = await visit.loadVisit(carmen);
  assert.equal(state.status, 'ready');
  assert.equal(state.visit.status, 'in-progress');
  assert.deepEqual(state.visit, { id: 'visita-er', patientId: 'carmen', status: 'in-progress', stage: 5, startedAt: '2026-10-09T08:12:00-04:00', cubicle: 12, clinician: 'Ana Ramos', nextKey: 'visitNextStudies', level: 3 });
});
