import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
const family = await import('../src/family/family.mjs').catch(() => ({}));

test('AYO-84 integrates owner controls with isolated synthetic family models', () => {
  assert.match(app, /FamilySection/);
  assert.match(app, /state\.account === 'carmen'/);
  assert.match(app, /state\.role === 'self'/);
  assert.match(app, /ownerFamily[^;]+state\.session\.patient\.id === 'carmen'/);
  assert.match(app, /delegateFamily[^;]+state\.session\.patient\.id === 'carmen'/);
  assert.equal(typeof family.changeFamilyPermission, 'function');
  assert.equal(typeof family.removeFamilyAccess, 'function');
});

test('AYO-75 gates every delegate category before source access', () => {
  assert.equal(typeof family.createDelegateFamilyModel, 'function');
  let restrictedReads = 0;
  const sources = {
    status: { status: 'ready', items: [{ id: 'status', label: 'Authorized status' }] },
    medicines: { status: 'empty', items: [] },
    instructions: { status: 'error', items: [] },
    get studies() { restrictedReads += 1; throw new Error('restricted source read'); },
  };
  const model = family.createDelegateFamilyModel({ language: 'es', caregiver: family.FAMILY_PERMISSION_FIXTURE?.[0], sources });
  assert.equal(restrictedReads, 0);
  assert.deepEqual(Object.fromEntries(model.categories.map(item => [item.id, item.state])), {
    status: 'ready', medicines: 'empty', instructions: 'error', studies: 'restricted',
  });
  assert.doesNotMatch(JSON.stringify(model), /Hemograma|15\.2|glóbulos/i);
  assert.match(app, /kind: 'delegate'/);
});

test('AYO-84 serializes rapid owner changes without losing the first saved permission', async () => {
  assert.equal(typeof family.createFamilyMutationQueue, 'function');
  const releases = [];
  const queue = family.createFamilyMutationQueue(family.FAMILY_PERMISSION_FIXTURE, () => new Promise(resolve => releases.push(resolve)));
  const first = queue.change({ caregiverId: 'lourdes', category: 'medicines', enabled: false });
  const second = queue.change({ caregiverId: 'lourdes', category: 'studies', enabled: true });
  await new Promise(resolve => setImmediate(resolve));
  releases.shift()();
  await new Promise(resolve => setImmediate(resolve));
  releases.shift()();
  await Promise.all([first, second]);
  const permissions = queue.getCaregivers().find(item => item.id === 'lourdes').permissions;
  assert.equal(permissions.medicines, false);
  assert.equal(permissions.studies, true);
  assert.equal(permissions.status, true);
});

test('AYO-84 turning off the base emergency status turns off every dependent category', async () => {
  const result = await family.changeFamilyPermission({
    caregivers: family.FAMILY_PERMISSION_FIXTURE,
    caregiverId: 'lourdes', category: 'status', enabled: false, save: async () => {},
  });
  assert.deepEqual(result.caregivers.find(item => item.id === 'lourdes').permissions, {
    status: false, medicines: false, instructions: false, studies: false,
  });
});
