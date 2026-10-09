// POR-42 reset and POR-46 discharge, in memory (MockClient). Never touches the real server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, describe, test } from 'node:test';
import { Hl7Message, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import { publishDischarge } from '../simulator/alta.mjs';
import { buildMessages } from '../simulator/mensajes.mjs';
import { resetVisit } from '../simulator/reiniciar.mjs';
import { VISIT_TYPES } from '../lib/simulator-policy.mjs';

indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json'));
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json'));
for (const file of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(file));
}

const require = createRequire(import.meta.url);
const bot = require('../bots/hl7-a-fhir.cjs');
const DATA = JSON.parse(readFileSync(new URL('../seed/datos-fijos.json', import.meta.url), 'utf8'));
const MSGS = buildMessages('20261009');
const opts = { cache: 'no-cache' };

async function world() {
  const medplum = new MockClient();
  await medplum.createResource(DATA.organization);
  for (const l of DATA.locations) await medplum.createResource(l);
  for (const p of DATA.practitioners) await medplum.createResource(p);
  const carmen = await medplum.createResource({ resourceType: 'Patient', ...DATA.carmen });
  const sensitive = await medplum.createResource({ ...DATA.sensitive, subject: { reference: `Patient/${carmen.id}` } });
  return { medplum, carmen, sensitive };
}

async function tour(medplum) {
  for (const m of MSGS.filter((x) => x.tour)) {
    const ack = (await bot.handler(medplum, { input: Hl7Message.parse(m.texto) })).toString();
    assert.match(ack, /MSA\|AA/, m.id);
  }
}

const P = (w) => `Patient/${w.carmen.id}`;
const countType = async (w, type) =>
  (await w.medplum.searchResources(type, { [type === 'Communication' ? 'subject' : 'patient']: P(w), _count: '200' }, opts)).length;

describe('Alta (POR-46)', () => {
  let w;
  before(async () => {
    w = await world();
    await tour(w.medplum);
  });

  test('before A03 it refuses', async () => {
    const x = await world();
    await bot.handler(x.medplum, { input: Hl7Message.parse(MSGS[0].texto) });
    await assert.rejects(publishDischarge(x.medplum), /alta \(A03\)/);
  });

  test('3 MedicationRequest, 1 CarePlan "Su alta", 1 Appointment; twice = same counts', async () => {
    await publishDischarge(w.medplum);
    await publishDischarge(w.medplum);
    const [visit] = await w.medplum.searchResources('Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' }, opts);
    const E = `Encounter/${visit.id}`;
    const meds = await w.medplum.searchResources('MedicationRequest', { patient: P(w), encounter: E }, opts);
    assert.equal(meds.length, 3);
    assert.ok(meds.every((m) => m.status === 'active' && m.intent === 'order'));
    const amoxi = meds.find((m) => m.medicationCodeableConcept.text.startsWith('Amoxicilina'));
    assert.equal(amoxi.category[0].text, 'nueva');
    assert.equal(amoxi.dosageInstruction[0].text, '1 tableta cada 12 horas por 7 días');
    assert.deepEqual(meds.filter((m) => m.category[0].text === 'sigue').map((m) => m.medicationCodeableConcept.text).sort(), ['Lisinopril 10 mg', 'Metformina 500 mg']);
    const plans = await w.medplum.searchResources('CarePlan', { patient: P(w), encounter: E }, opts);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].title, 'Su alta');
    assert.equal(plans[0].activity.filter((a) => a.detail.code?.text === 'alarma').length, 4);
    const appts = await w.medplum.searchResources('Appointment', { patient: P(w), status: 'booked' }, opts);
    assert.equal(appts.length, 1);
    assert.equal(appts[0].start, '2026-10-16T10:00:00-04:00');
    assert.equal(appts[0].participant[1].actor.display, 'Dra. Ana Colón');
    for (const r of [...meds, ...plans, ...appts]) {
      assert.deepEqual(r.meta.tag, [{ system: 'urn:portal:origen', code: 'simulado' }]);
    }
  });
});

describe('Reiniciar (POR-42)', () => {
  test('3 times in a row: tour + alta + reset leaves the 11 types empty, keeps fixed data and the R data', async () => {
    const w = await world();
    const fixedBefore = (await w.medplum.searchResources('Practitioner', { identifier: 'urn:hospital-demo:personal|', _count: '100' }, opts)).map((p) => p.id).sort();
    for (let round = 1; round <= 3; round++) {
      await tour(w.medplum);
      await publishDischarge(w.medplum);
      assert.ok((await countType(w, 'Encounter')) === 1, `round ${round}: visit exists before reset`);
      assert.equal(await countType(w, 'Communication'), 17, `round ${round}: no duplicated notices`);
      const deleted = await resetVisit(w.medplum);
      assert.ok(deleted.Encounter === 1 && deleted.Communication === 17, JSON.stringify(deleted));
      for (const type of VISIT_TYPES) {
        const left = await w.medplum.searchResources(type, { [type === 'Communication' ? 'subject' : 'patient']: P(w) }, opts);
        const nonSensitive = left.filter((r) => !(r.meta?.security ?? []).some((s) => s.code === 'R'));
        assert.equal(nonSensitive.length, 0, `round ${round}: ${type} left`);
      }
      const r = await w.medplum.readResource('Observation', w.sensitive.id);
      assert.equal(r.id, w.sensitive.id, 'R data kept with the same id');
      assert.equal((await w.medplum.readResource('Patient', w.carmen.id)).id, w.carmen.id);
      const fixedAfter = (await w.medplum.searchResources('Practitioner', { identifier: 'urn:hospital-demo:personal|', _count: '100' }, opts)).map((p) => p.id).sort();
      assert.deepEqual(fixedAfter, fixedBefore);
    }
  });
});
