import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../src/context.mjs').catch(() => ({}));
test('adapta la identidad existente y conserva paciente, roles y permisos explícitos', async () => {
  assert.equal(typeof api.openContext, 'function', 'falta el adaptador de identidad');
  const own = await api.openContext('lourdes', 'self');
  assert.equal(own.patient.id, 'lourdes');
  assert.equal(own.profile.resourceType, 'Patient');
  assert.equal(own.profile.id, 'lourdes');
  assert.equal(own.client.getProfile().resourceType, 'Patient', 'el perfil SDK debe coincidir con el contexto propio');
  assert.equal(own.client.getProfile().id, 'lourdes');
  assert.equal(own.permissions.estudios, true);
  const delegate = await api.openContext('lourdes', 'delegate');
  assert.equal(delegate.patient.id, 'carmen');
  assert.equal(delegate.profile.resourceType, 'RelatedPerson');
  assert.equal(delegate.permissions.estudios, false);
  assert.notEqual(own.client, delegate.client);
  await assert.rejects(api.openContext('rafael', 'self'));
  own.client.clear(); delegate.client.clear();
});

test('cambio de contexto retira pantalla anterior, reinicia navegación e ignora respuesta tardía', async () => {
  assert.equal(typeof api.createPortalStore, 'function', 'falta ciclo de contexto aislado');
  const pending = [];
  const store = api.createPortalStore((account, role) => new Promise(resolve => pending.push({ account, role, resolve })));
  const cleared = [];
  const session = (id, studies = true) => ({ patient: { id }, permissions: { estudios: studies }, client: { clear() { cleared.push(id); } } });
  const first = store.enter();
  assert.equal(store.getSnapshot().status, 'loading');
  const second = store.selectAccount('lourdes');
  assert.equal(store.getSnapshot().session, null);
  pending[1].resolve(session('lourdes-delegate', false)); await second;
  store.navigate('results');
  assert.equal(store.getSnapshot().section, 'visit');
  store.navigate('family');
  assert.equal(store.getSnapshot().section, 'family');
  pending[0].resolve(session('carmen-stale')); await first;
  assert.equal(store.getSnapshot().session.patient.id, 'lourdes-delegate');
  assert.ok(cleared.includes('carmen-stale'));
  const third = store.selectRole('self');
  assert.equal(store.getSnapshot().session, null);
  assert.equal(store.getSnapshot().section, 'visit');
  assert.ok(cleared.includes('lourdes-delegate'));
  store.close();
  pending[2].resolve(session('lourdes-stale')); await third;
  assert.equal(store.getSnapshot().status, 'closed');
  assert.equal(store.getSnapshot().account, null);
  assert.ok(cleared.includes('lourdes-stale'));
});

test('matriz de identidades usa repositorios aislados, sin red ni storage del navegador ni datos clínicos por defecto', async () => {
  const originalFetch = globalThis.fetch;
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  let network = 0, storage = 0;
  globalThis.fetch = () => { network++; throw new Error('red no permitida'); };
  // SDK ClientStorage.clear compares storage identity with globalThis.localStorage.
  // Access to the object is harmless; any read/write method is forbidden in this test.
  const forbiddenStorage = new Proxy({}, { get() { storage++; throw new Error('storage no permitido'); } });
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, key, { configurable: true, value: forbiddenStorage });
  try {
    for (const [account, role, patient, profile, studies] of [
      ['carmen', 'self', 'carmen', 'Patient', true],
      ['lourdes', 'delegate', 'carmen', 'RelatedPerson', false],
      ['lourdes', 'self', 'lourdes', 'Patient', true],
      ['rafael', 'delegate', 'carmen', 'RelatedPerson', true],
    ]) {
      const current = await api.openContext(account, role);
      assert.equal(current.patient.id, patient);
      assert.equal(current.client.getProfile().resourceType, profile);
      assert.equal(current.permissions.estudios, studies);
      const patients = await current.client.searchResources('Patient', {});
      assert.deepEqual(patients.map(p => p.id), [patient]);
      for (const resource of ['Observation', 'DiagnosticReport', 'Encounter', 'MedicationRequest', 'Communication']) {
        const resources = await current.client.searchResources(resource, {});
        assert.equal(resources.length, 0);
        assert.equal(resources.bundle.total, 0);
      }
      current.client.clear();
    }
    assert.equal(network, 0); assert.equal(storage, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of [['localStorage', localDescriptor], ['sessionStorage', sessionDescriptor]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test('error técnico no es vacío clínico; reintento y sesiones paralelas independientes', async () => {
  const first = api.createPortalStore(async () => { throw new Error('fallo de carga'); });
  const second = api.createPortalStore();
  let notifications = 0;
  const unsubscribe = first.subscribe(() => notifications++);
  await first.enter();
  assert.equal(first.getSnapshot().status, 'error');
  assert.equal(first.getSnapshot().session, null);
  first.navigate('results');
  assert.equal(first.getSnapshot().section, 'visit');
  await second.enter();
  second.navigate('results');
  assert.equal(second.getSnapshot().section, 'results');
  first.close();
  assert.equal(second.getSnapshot().status, 'ready');
  assert.ok(notifications > 0);
  unsubscribe();
  const prior = notifications;
  await first.enter();
  assert.equal(notifications, prior);
  second.close();
});
