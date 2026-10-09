import test from 'node:test';
import assert from 'node:assert/strict';

const family = await import('../src/family/family.mjs').catch(() => ({}));

test('AYO-75 Lourdes exposes only allowed categories and never reads restricted studies', () => {
  assert.equal(typeof family.createDelegateFamilyModel, 'function', 'missing delegate family model');
  let restrictedReads = 0;
  const sources = {
    status: { status: 'ready', items: [{ id: 'visible-status', label: 'Authorized status' }] },
    medicines: { status: 'empty', items: [] },
    instructions: { status: 'error', items: [{ id: 'must-not-leak', label: 'Hidden after error' }] },
    get studies() {
      restrictedReads += 1;
      throw new Error('restricted studies source was read');
    },
  };

  const model = family.createDelegateFamilyModel({
    language: 'en',
    caregiver: family.FAMILY_PERMISSION_FIXTURE?.[0],
    sources,
  });

  assert.equal(restrictedReads, 0);
  assert.deepEqual(
    Object.fromEntries(model.categories.map(category => [category.id, category.state])),
    { status: 'ready', medicines: 'empty', instructions: 'error', studies: 'restricted' },
  );
  assert.deepEqual(model.categories.find(category => category.id === 'studies').items, []);
  assert.doesNotMatch(JSON.stringify(model), /must-not-leak|Hemograma|15\.2|glóbulos/i);
});

test('AYO-75 Rafael has four available categories and missing permission stays unknown', () => {
  const rafael = family.createDelegateFamilyModel({
    language: 'es',
    caregiver: family.FAMILY_PERMISSION_FIXTURE[1],
  });
  assert.deepEqual(rafael.categories.map(category => category.state), ['available', 'available', 'available', 'available']);

  let unknownSourceReads = 0;
  const unknown = family.createDelegateFamilyModel({
    caregiver: { id: 'lourdes', name: 'Lourdes', permissions: { status: true } },
    sources: {
      get medicines() {
        unknownSourceReads += 1;
        return { status: 'ready', items: [{ label: 'must not be exposed' }] };
      },
    },
  });
  assert.equal(unknownSourceReads, 0);
  assert.equal(unknown.categories.find(category => category.id === 'medicines').state, 'unknown');
  assert.deepEqual(unknown.categories.find(category => category.id === 'medicines').items, []);
});
