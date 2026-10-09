// POR-55 · pre-registration: Bot pre-registro + the A04 of hl7-a-fhir taking the planned visit.
// Uses MockClient (in memory). Never reads the env file, never touches the real server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, test } from 'node:test';
import { Hl7Message, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import { buildMessages } from '../simulator/mensajes.mjs';

const require = createRequire(import.meta.url);
const prereg = require('../bots/pre-registro.cjs');
const hl7 = require('../bots/hl7-a-fhir.cjs');
const DATA = JSON.parse(readFileSync(new URL('../seed/datos-fijos.json', import.meta.url), 'utf8'));
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json'));
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json'));
for (const file of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(file));
}
const MSGS = Object.fromEntries(buildMessages('20261009').map((m) => [m.id, m]));
const search = (medplum, type, params) => medplum.searchResources(type, params, { cache: 'no-cache' });

function response(patient, extra = {}) {
  return {
    resourceType: 'QuestionnaireResponse',
    questionnaire: prereg.QUESTIONNAIRE_URL,
    status: 'completed',
    subject: { reference: `Patient/${patient.id}` },
    item: [
      { linkId: 'plan', item: [{ linkId: 'plan-nombre', answer: [{ valueString: 'Plan Demo' }] }, { linkId: 'plan-numero', answer: [{ valueString: 'SOCIO-0001' }] }] },
      { linkId: 'motivo', item: [{ linkId: 'motivo-texto', answer: [{ valueString: 'Fiebre y tos desde hace 3 días' }] }] },
    ],
    ...extra,
  };
}

async function sendHl7(medplum, id) {
  const ack = await hl7.handler(medplum, { input: Hl7Message.parse(MSGS[id].texto), contentType: 'x-application/hl7-v2+er7' });
  return ack.toString().split('\r').find((s) => s.startsWith('MSA'));
}

async function stageInputs(medplum) {
  const task = await medplum.searchOne('Task', { identifier: 'urn:hospital-demo:etapa|V-0001' }, { cache: 'no-cache' });
  return Object.fromEntries((task?.input ?? []).map((i) => [i.type.text, i.valueInteger ?? i.valueString]));
}

describe('pre-registro (POR-55)', () => {
  let medplum;
  let carmen;
  beforeEach(async () => {
    medplum = new MockClient();
    await medplum.createResource(DATA.organization);
    for (const l of DATA.locations) {
      await medplum.createResource(l);
    }
    for (const p of DATA.practitioners) {
      await medplum.createResource(p);
    }
    carmen = await medplum.createResource({ resourceType: 'Patient', ...DATA.carmen });
  });

  test('the form creates one planned ER visit and the Coverage; sending it twice keeps one', async () => {
    const r1 = await prereg.handler(medplum, { input: response(carmen) });
    const r2 = await prereg.handler(medplum, { input: response(carmen) });
    assert.equal(r1.ok, true);
    assert.equal(r1.nueva, true);
    assert.equal(r2.nueva, false);
    assert.equal(r1.encounter, r2.encounter);
    const planned = await search(medplum, 'Encounter', { patient: `Patient/${carmen.id}`, status: 'planned' });
    assert.equal(planned.length, 1);
    assert.equal(planned[0].class.code, 'EMER');
    assert.equal(planned[0].reasonCode[0].text, 'Fiebre y tos desde hace 3 días');
    const coverage = await search(medplum, 'Coverage', { beneficiary: `Patient/${carmen.id}` });
    assert.equal(coverage.length, 1);
    assert.equal(coverage[0].payor[0].display, 'Plan Demo');
  });

  test('other questionnaires, drafts and forms sent by someone else are ignored or rejected', async () => {
    assert.equal((await prereg.handler(medplum, { input: response(carmen, { questionnaire: 'https://x/otro' }) })).ok, false);
    assert.equal((await prereg.handler(medplum, { input: response(carmen, { status: 'in-progress' }) })).ok, false);
    await assert.rejects(prereg.handler(medplum, { input: response(carmen, { author: { reference: 'Patient/otra' } }) }));
    await assert.rejects(prereg.handler(medplum, { input: response(carmen, { subject: { reference: 'Group/x' } }) }));
    assert.equal((await search(medplum, 'Encounter', { patient: `Patient/${carmen.id}` })).length, 0);
  });

  test('with pre-registration, the A04 takes the planned visit (same id) and there is one EMER visit', async () => {
    const { encounter } = await prereg.handler(medplum, { input: response(carmen) });
    assert.match(await sendHl7(medplum, 'a04'), /^MSA\|AA/);
    const visits = await search(medplum, 'Encounter', { patient: `Patient/${carmen.id}` });
    assert.equal(visits.length, 1);
    assert.equal(`Encounter/${visits[0].id}`, encounter);
    assert.equal(visits[0].status, 'arrived');
    assert.equal(visits[0].identifier[0].value, 'V-0001');
    assert.equal(visits[0].reasonCode[0].text, 'Fiebre y tos desde hace 3 días');
    // Repeating the A04 changes nothing; a new form afterwards makes a NEW planned visit, not this one.
    assert.match(await sendHl7(medplum, 'a04'), /^MSA\|AA/);
    assert.equal((await search(medplum, 'Encounter', { patient: `Patient/${carmen.id}` })).length, 1);
  });

  test('without pre-registration the A04 creates the visit as before', async () => {
    assert.match(await sendHl7(medplum, 'a04'), /^MSA\|AA/);
    const visits = await search(medplum, 'Encounter', { patient: `Patient/${carmen.id}` });
    assert.equal(visits.length, 1);
    assert.equal(visits[0].status, 'arrived');
  });

  test('EMTALA: the pre-registration does not change the stage nor the people ahead', async () => {
    const without = new MockClient();
    // Same world, no pre-registration.
    await without.createResource(DATA.organization);
    for (const l of DATA.locations) {
      await without.createResource(l);
    }
    for (const p of DATA.practitioners) {
      await without.createResource(p);
    }
    await without.createResource({ resourceType: 'Patient', ...DATA.carmen });
    await prereg.handler(medplum, { input: response(carmen) });
    for (const id of ['a04', 'a08']) {
      await sendHl7(medplum, id);
      await sendHl7(without, id);
    }
    const a = await stageInputs(medplum);
    const b = await stageInputs(without);
    assert.equal(a.etapa, b.etapa);
    assert.equal(a['personas-antes'], b['personas-antes']);
    assert.equal(a['espera-estimada'], b['espera-estimada']);
  });
});
