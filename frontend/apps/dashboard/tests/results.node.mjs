import test from 'node:test';
import assert from 'node:assert/strict';
import { openContext } from '../src/context.mjs';
const api = await import('../src/results.mjs').catch(() => ({}));
const interpretationEs = item => api.interpretationLabel(item, 'es');
const statusEs = item => api.statusLabel(item, 'es');
test('cinco valores seleccionados para la demo, fuente aislada, interpretación nunca inferida y filtros sin coincidencias', async () => {
  const session = await openContext('carmen', 'self');
  const data = await api.loadResults(session);
  assert.equal(data.items.length, 5);
  assert.equal(data.items[0].valueQuantity.value, 15.2);
  assert.equal(data.items[0].referenceRange[0].text, '4.5–11.0');
  assert.equal(interpretationEs(data.items[0]), 'Alto');
  assert.equal(interpretationEs({ valueQuantity: { value: 1 } }), 'Sin interpretación');
  for (const [code, label] of Object.entries({ N: 'Normal', H: 'Alto', L: 'Bajo', HH: 'Muy alto', LL: 'Muy bajo', A: 'Anormal' })) {
    assert.equal(interpretationEs({ interpretation: [{ coding: [{ code }] }] }), label);
  }
  assert.equal(interpretationEs({ interpretation: [{ coding: [{ code: 'unknown' }] }] }), 'Sin interpretación');
  assert.deepEqual(data.items.map(item => item.valueQuantity?.value ?? item.valueString), [15.2, 12.8, 168, 1.1, 'Posible pulmonía en la parte baja del pulmón derecho']);
  assert.ok(data.items.every(item => !item.effectiveDateTime && !item.issued));
  assert.equal(statusEs(data.items[4]), 'Preliminar');
  assert.equal(statusEs({ status: 'partial' }), 'Preliminar');
  assert.equal(api.filterResults(data.items, 'preliminary').length, 1);
  assert.equal(api.filterResults(data.items, 'final').length, 2);
  assert.equal(api.filterResults(data.items, 'unknown').length, 2);
  assert.equal(api.filterResults([], 'final').length, 0);
  const authorizedDelegate = { ...session, account: 'test-delegate', role: 'delegate' };
  assert.equal((await api.loadResults(authorizedDelegate)).items.length, 5);
  assert.equal((await session.client.searchResources('Observation', {})).length, 0);
  session.client.clear();
});
test('controlador limpia filtros/detalle al cerrar y descarta carga tardía', async () => {
  assert.equal(typeof api.createResultsController, 'function');
  let resolve;
  const controller = api.createResultsController(() => new Promise(r => { resolve = r; }));
  const pending = controller.open({ permissions: { estudios: true }, patient: { id: 'carmen' } });
  controller.close(); resolve([{ id: 'late' }]); await pending;
  assert.equal(controller.getSnapshot().status, 'closed');
  assert.deepEqual(controller.getSnapshot().items, []);
  const active = api.createResultsController();
  const session = await openContext('carmen', 'self');
  await active.open(session);
  active.filter('preliminary'); active.detail('rx');
  assert.equal(active.getSnapshot().detail, 'rx');
  active.detail(null);
  assert.equal(active.getSnapshot().detail, null);
  await active.open(await openContext('lourdes', 'delegate'));
  assert.equal(active.getSnapshot().filter, 'all');
  assert.equal(active.getSnapshot().status, 'restricted');
  assert.deepEqual(active.getSnapshot().items, []);
  active.close(); session.client.clear();
});
test('permiso explícito antes de recuperar; Lourdes nunca recupera ni siembra Carmen', async () => {
  assert.equal(typeof api.loadResults, 'function');
  let calls = 0;
  const source = async () => { calls++; return []; };
  const delegated = await openContext('lourdes', 'delegate');
  assert.deepEqual(await api.loadResults(delegated, source), { status: 'restricted', items: [] });
  assert.equal(calls, 0);
  // Generic empty-patient guarantee remains tested without activating another demo patient.
  const own = { patient: { id: 'empty-test-patient' }, permissions: { estudios: true } };
  assert.deepEqual(await api.loadResults(own), { status: 'ready', items: [] });
  for (const session of [delegated]) {
    assert.equal((await session.client.searchResources('Observation', {})).length, 0);
    session.client.clear();
  }
  assert.deepEqual(await api.loadResults({ permissions: {}, patient: { id: 'carmen' } }, source), { status: 'restricted', items: [] });
  assert.equal(calls, 0);
});
