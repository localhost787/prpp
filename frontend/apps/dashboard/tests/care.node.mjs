import test from 'node:test';
import assert from 'node:assert/strict';

const care = await import('../src/care/care.mjs').catch(() => ({}));

const fullPermissions = { team: true, instructions: true, medicines: true };

test('Carmen mock keeps team, instructions, and medicines as separate permitted sections', () => {
  assert.equal(typeof care.createCareModel, 'function', 'missing isolated care model');
  const model = care.createCareModel({
    language: 'en',
    patientDisplayName: 'Doña Carmen',
    permissions: fullPermissions,
    data: care.CARMEN_CARE_FIXTURE,
  });

  assert.equal(model.language, 'en');
  assert.equal(model.sections.team.status, 'ready');
  assert.deepEqual(model.sections.team.items, [{
    id: 'practitioner-ana-ramos',
    name: 'Dr. Ana Ramos',
    role: 'Emergency physician',
    location: 'Cubicle 12',
  }]);
  assert.equal(model.sections.instructions.status, 'ready');
  assert.deepEqual(model.sections.instructions.items.map(item => item.text), ['Do not eat or drink for now.']);
  assert.equal(model.sections.medicines.status, 'ready');
  assert.deepEqual(model.sections.medicines.items.map(item => item.name), ['Ceftriaxone', 'Acetaminophen']);
  assert.deepEqual(model.sections.medicines.items[0], {
    id: 'medication-ceftriaxone',
    name: 'Ceftriaxone',
    dose: '1 g',
    route: 'by IV',
    time: '10:15 AM',
    purpose: null,
    mockOnly: false,
  });
  assert.equal(model.sections.medicines.items[1].dose, null);
  assert.equal(model.sections.medicines.items[1].time, null);
  assert.equal(model.sections.medicines.items[1].purpose, null);
});

test('Spanish dictionary is local and Lourdes medicine restriction does not hide permitted care', () => {
  const model = care.createCareModel({
    language: 'es',
    patientDisplayName: 'Doña Carmen',
    permissions: { team: true, instructions: true, medicines: false },
    data: care.CARMEN_CARE_FIXTURE,
  });

  assert.equal(model.sections.team.status, 'ready');
  assert.equal(model.sections.team.items[0].role, 'Médica de Emergencias');
  assert.equal(model.sections.team.items[0].location, 'Cubículo 12');
  assert.equal(model.sections.instructions.status, 'ready');
  assert.equal(model.sections.instructions.items[0].text, 'No coma ni beba por ahora.');
  assert.equal(model.sections.medicines.status, 'restricted');
  assert.equal(model.sections.medicines.message, 'Las medicinas de Doña Carmen son privadas');
  assert.deepEqual(model.sections.medicines.items, []);
});

test('missing participant omits the team card without becoming an error', () => {
  const data = { ...care.CARMEN_CARE_FIXTURE, participant: null };
  const model = care.createCareModel({ language: 'es', patientDisplayName: 'Doña Carmen', permissions: fullPermissions, data });
  assert.equal(model.sections.team.status, 'hidden');
  assert.deepEqual(model.sections.team.items, []);
  assert.equal(model.sections.team.message, null);
});

test('unconfirmed permissions fail closed and no user-facing copy exposes NPO', () => {
  const model = care.createCareModel({ patientDisplayName: 'Doña Carmen', permissions: {}, data: care.CARMEN_CARE_FIXTURE });
  assert.equal(model.language, 'en');
  for (const section of Object.values(model.sections)) {
    assert.equal(section.status, 'unavailable');
    assert.deepEqual(section.items, []);
  }
  assert.doesNotMatch(JSON.stringify({ dictionaries: care.CARE_DICTIONARIES, fixture: care.CARMEN_CARE_FIXTURE }), /\bNPO\b/i);
});

for (const language of ['toString', 'constructor', '__proto__']) {
  test(`inherited language key ${language} falls back to the English care model`, () => {
    const options = { patientDisplayName: 'Doña Carmen', permissions: fullPermissions, data: care.CARMEN_CARE_FIXTURE };
    assert.deepEqual(
      care.createCareModel({ ...options, language }),
      care.createCareModel({ ...options, language: 'en' }),
    );
  });
}

test('unsupported language falls back to English without changing clinical source values', () => {
  const model = care.createCareModel({ language: 'fr', patientDisplayName: 'Doña Carmen', permissions: fullPermissions, data: care.CARMEN_CARE_FIXTURE });
  assert.equal(model.language, 'en');
  assert.equal(model.sections.medicines.items[0].dose, '1 g');
  assert.equal(model.sections.medicines.items[0].time, '10:15 AM');
});
