import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILY_PERMISSION_FIXTURE,
  changeFamilyPermission,
  createOwnerFamilyModel,
} from '../src/family/family.mjs';

test('AYO-97 renders one independent permission card for Lourdes and Rafael', () => {
  const model = createOwnerFamilyModel({ language: 'es', caregivers: FAMILY_PERMISSION_FIXTURE });
  assert.deepEqual(model.caregivers.map(caregiver => [caregiver.name, caregiver.relationship]), [
    ['Lourdes', 'Hija'],
    ['Rafael', 'Esposo'],
  ]);
  assert.deepEqual(model.caregivers.map(caregiver => caregiver.categories.map(category => category.state)), [
    ['allowed', 'allowed', 'allowed', 'restricted'],
    ['allowed', 'allowed', 'allowed', 'allowed'],
  ]);
});

test('AYO-97 changing Rafael leaves Lourdes unchanged and identifies Rafael in the save payload', async () => {
  let payload;
  const result = await changeFamilyPermission({
    caregivers: FAMILY_PERMISSION_FIXTURE,
    caregiverId: 'rafael',
    category: 'medicines',
    enabled: false,
    save: async value => { payload = value; },
  });

  assert.equal(result.status, 'saved');
  assert.equal(payload.caregiverId, 'rafael');
  assert.equal(payload.permissions.medicines, false);
  assert.strictEqual(result.caregivers[0], FAMILY_PERMISSION_FIXTURE[0]);
  assert.equal(result.caregivers[0].permissions.medicines, true);
  assert.equal(result.caregivers[1].permissions.medicines, false);
});

test('AYO-97 duplicate caregiver identifiers fail closed instead of sharing one person state with another', () => {
  const duplicate = {
    ...FAMILY_PERMISSION_FIXTURE[1],
    id: FAMILY_PERMISSION_FIXTURE[0].id,
  };
  const model = createOwnerFamilyModel({ caregivers: [FAMILY_PERMISSION_FIXTURE[0], duplicate] });
  assert.equal(model.status, 'error');
  assert.deepEqual(model.caregivers, []);
});
