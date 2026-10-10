import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILY_PERMISSION_FIXTURE,
  changeFamilyPermission,
  createOwnerFamilyModel,
} from '../src/family/family.mjs';

// Inject a second independent caregiver only to exercise generic multi-person isolation.
const caregivers = [...FAMILY_PERMISSION_FIXTURE, { id: 'test-caregiver', name: 'Test caregiver', relationship: { en: 'Test', es: 'Prueba' }, permissions: { status: true, medicines: true, instructions: true, studies: true } }];

test('AYO-97 renders one independent permission card for Lourdes and a test caregiver', () => {
  const model = createOwnerFamilyModel({ language: 'es', caregivers });
  assert.deepEqual(model.caregivers.map(caregiver => [caregiver.name, caregiver.relationship]), [
    ['Lourdes Santiago Rivera', 'Hija'],
    ['Test caregiver', 'Prueba'],
  ]);
  assert.deepEqual(model.caregivers.map(caregiver => caregiver.categories.map(category => category.state)), [
    ['allowed', 'allowed', 'allowed', 'restricted'],
    ['allowed', 'allowed', 'allowed', 'allowed'],
  ]);
});

test('AYO-97 changing a test caregiver leaves Lourdes unchanged and identifies a test caregiver in the save payload', async () => {
  let payload;
  const result = await changeFamilyPermission({
    caregivers,
    caregiverId: 'test-caregiver',
    category: 'medicines',
    enabled: false,
    save: async value => { payload = value; },
  });

  assert.equal(result.status, 'saved');
  assert.equal(payload.caregiverId, 'test-caregiver');
  assert.equal(payload.permissions.medicines, false);
  assert.strictEqual(result.caregivers[0], FAMILY_PERMISSION_FIXTURE[0]);
  assert.equal(result.caregivers[0].permissions.medicines, true);
  assert.equal(result.caregivers[1].permissions.medicines, false);
});

test('AYO-97 duplicate caregiver identifiers fail closed instead of sharing one person state with another', () => {
  const duplicate = {
    ...caregivers[1],
    id: FAMILY_PERMISSION_FIXTURE[0].id,
  };
  const model = createOwnerFamilyModel({ caregivers: [FAMILY_PERMISSION_FIXTURE[0], duplicate] });
  assert.equal(model.status, 'error');
  assert.deepEqual(model.caregivers, []);
});
