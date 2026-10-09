import test from 'node:test';
import assert from 'node:assert/strict';

const discharge = await import('../src/discharge/discharge.mjs').catch(() => ({}));

test('AYO-41 creates a discharge only for an explicitly finished home visit', () => {
  assert.equal(typeof discharge.createDischargeModel, 'function', 'missing discharge model');
  const ready = discharge.createDischargeModel({
    language: 'es',
    state: 'ready',
    visit: { status: 'finished', disposition: 'home' },
    permissions: { medicines: true, instructions: true },
    data: discharge.SYNTHETIC_DISCHARGE_FIXTURE,
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.diagnosis.value, 'Pulmonía (neumonía) adquirida en la comunidad');
  assert.deepEqual(ready.medicines.items.map(item => item.label), ['NEW', 'CONTINUES', 'CONTINUES']);
  assert.equal(ready.alarms.items.length, 4);
  assert.equal(ready.appointment.time, 'viernes, 16 oct, 10:00 a. m.');

  for (const visit of [
    { status: 'finished', disposition: 'admitted' },
    { status: 'finished' },
    { status: 'in-progress', disposition: 'home' },
    null,
  ]) {
    const hidden = discharge.createDischargeModel({ state: 'ready', visit, permissions: { medicines: true, instructions: true }, data: discharge.SYNTHETIC_DISCHARGE_FIXTURE });
    assert.equal(hidden.status, 'empty');
    assert.equal(hidden.discharge, null);
  }
});

test('AYO-41 medicines and instructions fail closed independently without reading denied sources', () => {
  let medicineReads = 0;
  const data = { ...discharge.SYNTHETIC_DISCHARGE_FIXTURE };
  Object.defineProperty(data, 'medicines', { get() { medicineReads += 1; throw new Error('denied medicines read'); } });
  const model = discharge.createDischargeModel({
    language: 'en',
    state: 'ready',
    visit: { status: 'finished', disposition: 'home' },
    permissions: { medicines: false, instructions: true },
    data,
  });
  assert.equal(medicineReads, 0);
  assert.equal(model.medicines.status, 'restricted');
  assert.deepEqual(model.medicines.items, []);
  assert.notEqual(model.instructions.status, 'restricted');
  assert.equal(model.appointment.status, 'ready');
  assert.equal(model.alarms.items.length, 4);
});

test('AYO-41 unknown instructions fail closed, labels stay explicit, and missing differs from empty and error', () => {
  let instructionReads = 0;
  const data = { diagnosis: null, alarms: [], medicines: [{ id: 'x', name: 'Synthetic medicine', label: null }] };
  Object.defineProperty(data, 'homeInstructions', { get() { instructionReads += 1; throw new Error('unknown permission read'); } });
  Object.defineProperty(data, 'appointment', { get() { instructionReads += 1; throw new Error('unknown permission read'); } });
  const model = discharge.createDischargeModel({
    state: 'ready',
    visit: { status: 'finished', disposition: 'home' },
    permissions: { medicines: true },
    data,
  });
  assert.equal(instructionReads, 0);
  assert.equal(model.instructions.status, 'unavailable');
  assert.equal(model.appointment.status, 'unavailable');
  assert.equal(model.diagnosis.status, 'not-documented');
  assert.equal(model.alarms.status, 'empty');
  assert.equal(model.medicines.items[0].label, null);
  assert.equal(model.medicines.items[0].labelText, null);

  const error = discharge.createDischargeModel({ state: 'error' });
  assert.equal(error.status, 'error');
  assert.match(error.message, /could not load/i);
});
