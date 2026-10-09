// Unit tests of the live data layer with a fake client (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationOutcomeError, serverError, forbidden, unauthorized } from '@medplum/core';
import { buildConfig } from '../src/live/config.mjs';
import { canView, createAccess } from '../src/live/permissions.mjs';
import * as q from '../src/live/queries.mjs';
import { withFallback, classifyError } from '../src/live/fallback.mjs';
import { criteriaFor, subscribe } from '../src/live/realtime.mjs';
import { setFamilySharing, toggleCategory } from '../src/live/sharing.mjs';
import { loadVisit } from '../src/visit.mjs';
import { loadResults, resultPresentation, statusKey } from '../src/results.mjs';
import { createCareModel } from '../src/care/care.mjs';

const MOTHER = 'p-1111';
const DAUGHTER_OWN = 'p-2222';
const NO_MATCH = '00000000-0000-0000-0000-000000000000';
const familyEntry = (type, id) => ({ resourceType: type, readonly: true, criteria: `${type}?patient=Patient/${id}&_security:not=x|R` });
const noMatch = type => ({ resourceType: type, readonly: true, criteria: `${type}?_id=${NO_MATCH}` });
const patientMe = { profile: { resourceType: 'Patient', id: MOTHER }, accessPolicy: { resource: [{ resourceType: 'Encounter', criteria: `Encounter?_compartment=Patient/${MOTHER}` }] } };
// Family member: visita + medicinas + instrucciones for the mother; own record via compartment.
const delegateMe = {
  profile: { resourceType: 'RelatedPerson', id: 'rp-1' },
  accessPolicy: {
    resource: [
      ...['Encounter', 'DiagnosticReport', 'MedicationRequest', 'CarePlan'].map(t => ({ resourceType: t, criteria: `${t}?_compartment=Patient/${DAUGHTER_OWN}` })),
      familyEntry('Encounter', MOTHER), familyEntry('MedicationRequest', MOTHER), familyEntry('CarePlan', MOTHER),
      ...['Encounter', 'DiagnosticReport', 'MedicationRequest', 'CarePlan'].map(noMatch),
      { resourceType: 'Practitioner', readonly: true },
    ],
  },
};
const noneMe = { profile: { resourceType: 'RelatedPerson', id: 'rp-2' }, accessPolicy: { resource: ['Encounter', 'DiagnosticReport'].map(noMatch) } };

test('index exposes the whole layer; login refuses an incomplete config without network', async () => {
  const live = await import('../src/live/index.mjs');
  for (const name of ['login', 'logout', 'getAuthMe', 'getRoles', 'openLiveSession', 'canView', 'getVisit', 'getResults', 'subscribePatient', 'setFamilySharing', 'withFallback']) assert.equal(typeof live[name], 'function', name);
  await assert.rejects(live.login('a@example.test', 'x', buildConfig({})), /LIVE_CONFIG_INCOMPLETE/);
});

test('config: default mock, live only when complete, URL normalized', () => {
  assert.equal(buildConfig({}).mode, 'mock');
  assert.equal(buildConfig({}).live, false);
  assert.equal(buildConfig({ EXPO_PUBLIC_DATA_MODE: 'weird' }).mode, 'mock');
  const partial = buildConfig({ EXPO_PUBLIC_DATA_MODE: 'live', EXPO_PUBLIC_MEDPLUM_BASE_URL: 'https://example.test' });
  assert.equal(partial.live, false);
  assert.deepEqual([...partial.missing], ['EXPO_PUBLIC_MEDPLUM_PROJECT_ID']);
  const full = buildConfig({ EXPO_PUBLIC_DATA_MODE: 'LIVE', EXPO_PUBLIC_MEDPLUM_BASE_URL: 'https://example.test//', EXPO_PUBLIC_MEDPLUM_PROJECT_ID: 'proj' });
  assert.equal(full.live, true);
  assert.equal(full.baseUrl, 'https://example.test/');
  assert.equal(full.timeoutMs, 4000);
});

test('canView: own patient sees everything', () => {
  for (const c of ['visita', 'medicinas', 'instrucciones', 'estudios']) assert.equal(canView(patientMe, MOTHER, c), true);
  assert.equal(canView(patientMe, 'someone-else', 'visita'), false);
});

test('canView: representative-type rule per patient (API-02)', () => {
  assert.deepEqual(createAccess(delegateMe).permissionsFor(MOTHER), { visita: true, medicinas: true, instrucciones: true, estudios: false });
  assert.deepEqual(createAccess(delegateMe).permissionsFor(DAUGHTER_OWN), { visita: true, medicinas: true, instrucciones: true, estudios: true });
  assert.deepEqual(createAccess(noneMe).permissionsFor(MOTHER), { visita: false, medicinas: false, instrucciones: false, estudios: false });
  // A non-representative type with no criteria does not open a category.
  assert.equal(canView({ profile: {}, accessPolicy: { resource: [{ resourceType: 'Observation' }] } }, MOTHER, 'estudios'), false);
  // Representative type without criteria = allowed.
  assert.equal(canView({ profile: {}, accessPolicy: { resource: [{ resourceType: 'DiagnosticReport' }] } }, MOTHER, 'estudios'), true);
});

test('canView fails closed and does not match id substrings', () => {
  assert.equal(canView(delegateMe, MOTHER, 'unknown'), false);
  assert.equal(canView(delegateMe, '', 'visita'), false);
  assert.equal(canView({ profile: {} }, MOTHER, 'visita'), false);
  assert.equal(canView(undefined, MOTHER, 'visita'), false);
  assert.equal(canView(delegateMe, 'p-111', 'visita'), false); // prefix of p-1111
  assert.equal(canView(delegateMe, '1111', 'visita'), false);
});

// ---------- fake client ----------
function fakeClient(data = {}, { fail = {} } = {}) {
  const calls = [];
  return {
    calls,
    async searchResources(type, params) {
      calls.push([type, params]);
      if (fail[type]) throw fail[type];
      const v = data[type] ?? [];
      return typeof v === 'function' ? v(params) : v;
    },
    async readReference(ref) {
      calls.push(['read', ref.reference]);
      return data.read?.[ref.reference] ?? Promise.reject(new OperationOutcomeError(forbidden));
    },
  };
}
const ctxFor = (me, client, patientId = MOTHER) => ({ client, access: createAccess(me), patientId });

const encounter = {
  resourceType: 'Encounter', id: 'enc-1', status: 'in-progress', class: { code: 'EMER' }, priority: { text: 'ESI 3' },
  period: { start: '2026-10-09T08:12:00-04:00' }, location: [{ location: { display: 'Cubículo 12' } }],
  participant: [{ individual: { reference: 'Practitioner/pr-1', display: 'Dra. Ejemplo' } }],
};
const stageTask = {
  resourceType: 'Task', id: 't-1', status: 'in-progress', code: { coding: [{ system: 'urn:portal:tarea', code: 'etapa' }] },
  encounter: { reference: 'Encounter/enc-1' }, description: 'Esperar',
  input: [{ type: { text: 'etapa' }, valueInteger: 5 }, { type: { text: 'que-sigue' }, valueString: 'Esperar resultados' }, { type: { text: 'indicacion' }, valueString: 'No coma ni beba por ahora.' }, { type: { text: 'esi' }, valueInteger: 3 }, { type: { text: 'estudios-en-curso' }, valueInteger: 1 }],
};

test('visit: ok in the mock visit shape, stage Task searched by code', async () => {
  const client = fakeClient({ Encounter: [encounter], Task: [stageTask] });
  const r = await q.getVisit(ctxFor(delegateMe, client));
  assert.equal(r.status, 'ok');
  const { id, patientId, status, stage, startedAt, cubicle, clinician, level } = r.data;
  assert.deepEqual({ id, patientId, status, stage, startedAt, cubicle, clinician, level }, { id: 'enc-1', patientId: MOTHER, status: 'in-progress', stage: 5, startedAt: '2026-10-09T08:12:00-04:00', cubicle: 12, clinician: 'Dra. Ejemplo', level: 3 });
  const taskCall = client.calls.find(c => c[0] === 'Task');
  assert.equal(taskCall[1].code, 'urn:portal:tarea|etapa');
  assert.equal(taskCall[1].encounter, 'Encounter/enc-1');
  // Same object feeds the existing loadVisit() unchanged.
  const session = { patient: { id: MOTHER }, permissions: { visita: true, estudios: false } };
  const loaded = await loadVisit(session, q.liveVisitSource(ctxFor(delegateMe, client)));
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.visit.stage, 5);
  assert.equal(loaded.visit.stageKey, 'visitStagePrivate');
});

test('visit: allowed but nothing = ok null; no stage Task = ok null', async () => {
  assert.deepEqual(await q.getVisit(ctxFor(delegateMe, fakeClient())), { status: 'ok', data: null });
  assert.deepEqual(await q.getVisit(ctxFor(delegateMe, fakeClient({ Encounter: [encounter] }))), { status: 'ok', data: null });
});

test('status mapping: locked never reads; failed read with permission = error', async () => {
  const client = fakeClient({ Observation: [{ resourceType: 'Observation', id: 'o1' }] });
  assert.deepEqual(await q.getResults(ctxFor(delegateMe, client)), { status: 'locked' });
  assert.deepEqual(await q.getStudies(ctxFor(delegateMe, client)), { status: 'locked' });
  assert.equal(client.calls.length, 0);
  for (const fn of [q.getVisit, q.getNotices, q.getMedications, q.getCarePlan]) assert.deepEqual(await fn(ctxFor(noneMe, client)), { status: 'locked' });
  assert.equal(client.calls.length, 0);
  // 403 on a category auth/me allows → technical error, not a lock.
  const failing = fakeClient({}, { fail: { Encounter: new OperationOutcomeError(forbidden) } });
  const r = await q.getVisit(ctxFor(delegateMe, failing));
  assert.equal(r.status, 'error');
  assert.equal(r.error.kind, 'forbidden');
  const down = await q.getMedications(ctxFor(delegateMe, fakeClient({}, { fail: { MedicationAdministration: new TypeError('fetch failed') } })));
  assert.equal(down.status, 'error');
  assert.equal(down.error.kind, 'network');
});

test('allowed and empty = ok []', async () => {
  const ctx = ctxFor(patientMe, fakeClient());
  for (const fn of [q.getResults, q.getStudies, q.getNotices, q.getMedications, q.getPrescriptions, q.getAppointments]) {
    assert.deepEqual(await fn(ctx), { status: 'ok', data: [] });
  }
  assert.deepEqual(await q.getCarePlan(ctx), { status: 'ok', data: null });
});

test('results keep the mock Observation shape and attach their report', async () => {
  const obs = { resourceType: 'Observation', id: 'wbc', status: 'final', code: { text: 'Glóbulos blancos' }, valueQuantity: { value: 15.2, unit: 'mil/µL' }, referenceRange: [{ text: '4.5–11.0' }], interpretation: [{ coding: [{ code: 'H' }] }], note: [{ text: 'Están altos.' }] };
  const rep = { resourceType: 'DiagnosticReport', id: 'dr1', status: 'final', code: { text: 'Hemograma completo' }, result: [{ reference: 'Observation/wbc' }] };
  const ctx = { ...ctxFor(patientMe, fakeClient({ Observation: [obs], DiagnosticReport: [rep] })), encounterId: 'enc-1' };
  const r = await q.getResults(ctx);
  assert.equal(r.status, 'ok');
  assert.equal(r.data[0].report.code.text, 'Hemograma completo');
  assert.equal(statusKey(r.data[0]), 'final');
  const view = resultPresentation(r.data[0], 'es');
  assert.deepEqual([view.title, view.value, view.unit, view.report], ['Glóbulos blancos', 15.2, 'mil/µL', 'Hemograma completo']);
  const loaded = await loadResults({ patient: { id: MOTHER }, permissions: { estudios: true } }, q.liveResultsSource(ctx));
  assert.equal(loaded.items.length, 1);
  const obsCall = ctx.client.calls.find(c => c[0] === 'Observation')[1];
  assert.equal(obsCall.category, 'laboratory,imaging');
  assert.equal(obsCall.encounter, 'Encounter/enc-1');
});

test('studies status follows API-09', () => {
  const o = (id, status = 'active') => ({ id, status, code: { text: id } });
  const dr = (id, status) => ({ status, basedOn: [{ reference: `ServiceRequest/${id}` }] });
  const sp = id => ({ request: [{ reference: `ServiceRequest/${id}` }] });
  const rows = q.mapStudies(
    [o('a'), o('b'), o('c'), o('d'), o('e'), o('f', 'revoked'), o('g', 'completed')],
    [dr('a', 'final'), dr('b', 'amended'), dr('c', 'preliminary'), dr('d', 'registered')],
    [sp('e')],
  );
  assert.deepEqual(rows.map(r => r.statusKey), ['ready', 'corrected', 'preliminary', 'inProgress', 'collected', 'cancelled', 'ready']);
  assert.equal(q.mapStudies([o('z')], [], [])[0].statusKey, 'ordered');
});

test('notices: neutral twin hidden only when the session sees studies', async () => {
  const c = (id, ...codes) => ({ id, sent: '2026-10-09T09:00:00-04:00', payload: [{ contentString: id }], category: codes.map(code => ({ coding: [{ system: 'urn:portal:aviso', code }] })) });
  const list = [c('real', 'resultado'), c('neutral', 'visita', 'neutral-familia'), c('arrive', 'visita')];
  const own = await q.getNotices(ctxFor(patientMe, fakeClient({ Communication: list })));
  assert.deepEqual(own.data.map(n => n.id), ['real', 'arrive']);
  const fam = await q.getNotices(ctxFor(delegateMe, fakeClient({ Communication: list })));
  assert.deepEqual(fam.data.map(n => n.id), ['real', 'neutral', 'arrive']);
});

test('care: same shape as loadCare(), each section guarded, renders with createCareModel', async () => {
  const ma = { id: 'ma1', medicationCodeableConcept: { text: 'Ceftriaxona' }, effectiveDateTime: '2026-10-09T10:15:00-04:00', dosage: { route: { text: 'por la vena' }, dose: { value: 1, unit: 'g' } } };
  const pr = { resourceType: 'Practitioner', id: 'pr-1', name: [{ text: 'Dra. Ejemplo' }], qualification: [{ code: { text: 'Médica de Emergencias' } }] };
  const client = fakeClient({ Encounter: [encounter], Task: [stageTask], MedicationAdministration: [ma], read: { 'Practitioner/pr-1': pr } });
  const care = await q.getCare(ctxFor(delegateMe, client));
  assert.deepEqual(care.permissions, { team: true, instructions: true, medicines: true });
  assert.deepEqual(care.data.medicines[0], { id: 'ma1', name: { es: 'Ceftriaxona', en: 'Ceftriaxona' }, dose: '1 g', route: { es: 'por la vena', en: 'por la vena' }, time: '10:15 AM', purpose: null, mockOnly: false });
  assert.equal(care.data.participant.roleKey, 'emergencyPhysician');
  assert.equal(care.data.instructions[0].text.es, 'No coma ni beba por ahora.');
  const model = createCareModel({ language: 'es', patientDisplayName: 'X', ...care });
  assert.equal(model.sections.team.status, 'ready');
  assert.equal(model.sections.medicines.items[0].name, 'Ceftriaxona');
  const none = await q.getCare(ctxFor(noneMe, fakeClient()));
  assert.deepEqual(none.permissions, { team: false, instructions: false, medicines: false });
  assert.equal(createCareModel({ permissions: none.permissions, data: none.data }).sections.medicines.status, 'restricted');
});

test('fallback: unreachable → mock + demoFallback; locks, 403 and 401 never fall back', async () => {
  const mock = async () => ({ status: 'ok', data: ['mock'] });
  assert.deepEqual(await withFallback(async () => ({ status: 'ok', data: ['live'] }), mock), { status: 'ok', data: ['live'], demoFallback: false });
  assert.deepEqual(await withFallback(async () => { throw new TypeError('fetch failed'); }, mock), { status: 'ok', data: ['mock'], demoFallback: true });
  assert.deepEqual(await withFallback(async () => ({ status: 'error', error: new OperationOutcomeError(serverError(new Error('x'))) }), mock), { status: 'ok', data: ['mock'], demoFallback: true });
  const slow = await withFallback(() => new Promise(r => setTimeout(() => r({ status: 'ok', data: ['late'] }), 200)), mock, { timeoutMs: 30 });
  assert.deepEqual(slow, { status: 'ok', data: ['mock'], demoFallback: true });
  assert.deepEqual(await withFallback(async () => ({ status: 'locked' }), mock), { status: 'locked', demoFallback: false });
  const denied = await withFallback(async () => { throw new OperationOutcomeError(forbidden); }, mock);
  assert.equal(denied.status, 'error'); assert.equal(denied.demoFallback, false);
  const expired = await withFallback(async () => ({ status: 'error', error: new OperationOutcomeError(unauthorized) }), mock);
  assert.equal(expired.demoFallback, false);
  assert.equal(classifyError(new OperationOutcomeError(unauthorized)), 'session');
  // Plain mock values are wrapped as ok.
  assert.deepEqual(await withFallback(async () => { throw new TypeError('Failed to fetch'); }, async () => [1]), { status: 'ok', data: [1], demoFallback: true });
});

test('realtime: criteria follow canView; unsubscribe releases the criteria once', () => {
  const crit = criteriaFor(createAccess(delegateMe), MOTHER);
  assert.ok(crit.includes(`Task?patient=Patient/${MOTHER}`));
  assert.ok(crit.includes(`MedicationAdministration?patient=Patient/${MOTHER}`));
  assert.ok(!crit.some(c => /DiagnosticReport|Observation|ServiceRequest/.test(c)));
  assert.deepEqual(criteriaFor(createAccess(noneMe), MOTHER), []);
  const listeners = {};
  const released = [];
  const manager = {
    addCriteria: () => ({ addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener: t => { delete listeners[t]; } }),
    removeCriteria: c => released.push(c),
  };
  const client = { getSubscriptionManager: () => manager };
  const got = [];
  const sub = subscribe(client, 'Task?patient=Patient/x', { onEvent: e => got.push(e.resource.id), onConnect: c => got.push(c.subscriptionId) });
  listeners.connect({ payload: { subscriptionId: 's1' } });
  listeners.message({ payload: { entry: [{}, { resource: { id: 't1' } }] } });
  sub.unsubscribe(); sub.unsubscribe();
  assert.deepEqual(got, ['s1', 't1']);
  assert.deepEqual(released, ['Task?patient=Patient/x']);
  assert.deepEqual(Object.keys(listeners), []);
});

test('sharing: validates input before calling the Bot; toggle keeps "visita" as base', async () => {
  let executed = 0;
  const client = { searchOne: async () => ({ id: 'bot-1' }), executeBot: async (id, body) => { executed++; return { ok: true, compartir: ['visita', ...body.compartir.filter(c => c !== 'visita')], familiares: ['X'] }; } };
  assert.equal((await setFamilySharing(client, { relatedPersonId: '', categories: ['visita'] })).status, 'error');
  assert.equal((await setFamilySharing(client, { relatedPersonId: 'a/../b', categories: ['visita'] })).status, 'error');
  assert.equal((await setFamilySharing(client, { relatedPersonId: 'rp-1', categories: ['radiografias'] })).status, 'error');
  assert.equal(executed, 0);
  const ok = await setFamilySharing(client, { relatedPersonId: 'rp-1', categories: ['estudios'] });
  assert.deepEqual(ok, { status: 'ok', data: { compartir: ['visita', 'estudios'], familiares: ['X'] } });
  const fallbackId = await setFamilySharing({ searchOne: async () => { throw new Error('no'); }, executeBot: async id => ({ ok: id === 'cfg-bot', compartir: [] }) }, { relatedPersonId: 'rp-1', categories: [] }, { botCompartirId: 'cfg-bot' });
  assert.equal(fallbackId.status, 'ok');
  assert.deepEqual(toggleCategory(['visita', 'medicinas'], 'estudios', true), ['visita', 'medicinas', 'estudios']);
  assert.deepEqual(toggleCategory(['visita', 'medicinas', 'estudios'], 'estudios', false), ['visita', 'medicinas']);
  assert.deepEqual(toggleCategory(['visita', 'medicinas'], 'visita', false), []);
});
