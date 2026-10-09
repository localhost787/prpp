import test from 'node:test';
import assert from 'node:assert/strict';

const family = await import('../src/family/family.mjs').catch(() => ({}));

test('AYO-84 owner model shows Lourdes with four independent explicit categories', () => {
  assert.equal(typeof family.createOwnerFamilyModel, 'function', 'missing owner family model');
  const model = family.createOwnerFamilyModel({
    language: 'en',
    caregivers: [family.FAMILY_PERMISSION_FIXTURE?.[0]],
  });

  assert.equal(model.caregivers.length, 1);
  assert.equal(model.caregivers[0].name, 'Lourdes');
  assert.equal(model.caregivers[0].relationship, 'Daughter');
  assert.deepEqual(
    Object.fromEntries(model.caregivers[0].categories.map(category => [category.id, category.state])),
    { status: 'allowed', medicines: 'allowed', instructions: 'allowed', studies: 'restricted' },
  );
});

test('AYO-84 fails closed for missing permission and restores the prior view after a simulated save failure', async () => {
  const incomplete = [{
    id: 'lourdes',
    name: 'Lourdes',
    relationship: { en: 'Daughter', es: 'Hija' },
    permissions: { status: true, medicines: true, instructions: true },
  }];
  const before = family.createOwnerFamilyModel({ caregivers: incomplete });
  assert.equal(before.caregivers[0].categories.find(category => category.id === 'studies').state, 'unknown');

  assert.equal(typeof family.changeFamilyPermission, 'function', 'missing permission transaction');
  const result = await family.changeFamilyPermission({
    caregivers: incomplete,
    caregiverId: 'lourdes',
    category: 'medicines',
    enabled: false,
    save: async () => { throw new Error('simulated failure'); },
  });

  assert.equal(result.status, 'error');
  assert.deepEqual(result.caregivers, incomplete);
  assert.equal(result.message, 'Could not save. The local example was restored.');
});

test('AYO-84 local removal uses neutral copy and never claims immediate server revocation', async () => {
  assert.equal(typeof family.removeFamilyAccess, 'function', 'missing local removal transaction');
  const result = await family.removeFamilyAccess({
    caregivers: [family.FAMILY_PERMISSION_FIXTURE[0]],
    caregiverId: 'lourdes',
    language: 'en',
    save: async () => ({ ok: true }),
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.caregivers[0].permissions, {
    status: false,
    medicines: false,
    instructions: false,
    studies: false,
  });
  assert.equal(result.message, 'Access for Lourdes is off in this local example.');
  assert.doesNotMatch(result.message, /immediate|server/i);
});
