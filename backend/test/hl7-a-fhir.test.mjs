// POR-39 · bot-tests: the 4 parts of hl7-a-fhir (ADT, ORM, ORU, RAS) with the case messages.
// Uses MockClient (in memory). Never reads the env file, never touches the real server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, describe, test } from 'node:test';
import { Hl7Message, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { MockClient } from '@medplum/mock';
import { buildMessages } from '../simulator/mensajes.mjs';

const require = createRequire(import.meta.url);
const bot = require('../bots/hl7-a-fhir.cjs');
const DATA = JSON.parse(readFileSync(new URL('../seed/datos-fijos.json', import.meta.url), 'utf8'));
// MockClient needs the FHIR definitions to run searches (same setup as Medplum's own bot tests).
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json'));
indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json'));
for (const file of SEARCH_PARAMETER_BUNDLE_FILES) {
  indexSearchParameterBundle(readJson(file));
}

const MSGS = Object.fromEntries(buildMessages('20261009').map((m) => [m.id, m]));

async function newWorld() {
  const medplum = new MockClient();
  await medplum.createResource(DATA.organization);
  for (const l of DATA.locations) {
    await medplum.createResource(l);
  }
  for (const p of DATA.practitioners) {
    await medplum.createResource(p);
  }
  const carmen = await medplum.createResource({ resourceType: 'Patient', ...DATA.carmen });
  return { medplum, carmen };
}

async function send(medplum, id) {
  const ack = await bot.handler(medplum, { input: Hl7Message.parse(MSGS[id].texto), contentType: 'x-application/hl7-v2+er7' });
  return ack.toString();
}

function msa(ack) {
  return ack.split('\r').find((s) => s.startsWith('MSA'));
}

const search = (medplum, type, params) => medplum.searchResources(type, params, { cache: 'no-cache' });

async function notices(medplum, carmen) {
  const all = await search(medplum, 'Communication', { subject: `Patient/${carmen.id}`, _count: '100' });
  return all.map((c) => ({ text: c.payload?.[0]?.contentString, cats: c.category.map((x) => x.coding[0].code) }));
}

async function stageTask(medplum) {
  const task = await medplum.searchOne('Task', { identifier: 'urn:hospital-demo:etapa|V-0001' }, { cache: 'no-cache' });
  const input = Object.fromEntries((task?.input ?? []).map((i) => [i.type.text, i.valueInteger ?? i.valueString]));
  return { task, input };
}

describe('ADT (POR-36)', () => {
  let w;
  before(async () => {
    w = await newWorld();
  });

  test('A04 creates the EMER visit as arrived, ACK AA', async () => {
    const ack = await send(w.medplum, 'a04');
    assert.match(msa(ack), /^MSA\|AA\|SIM-0001/);
    const visits = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(visits.length, 1);
    assert.equal(visits[0].status, 'arrived');
    assert.equal(visits[0].class.code, 'EMER');
    assert.equal(visits[0].period.start, '2026-10-09T08:12:00-04:00');
    assert.equal(visits[0].subject.reference, `Patient/${w.carmen.id}`);
  });

  test('A04 again does not create a second visit (idempotent)', async () => {
    assert.match(msa(await send(w.medplum, 'a04')), /^MSA\|AA/);
    const visits = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(visits.length, 1);
    const n = await notices(w.medplum, w.carmen);
    assert.equal(n.filter((x) => x.text.startsWith('Llegó')).length, 1);
  });

  test('A08 -> triaged, ESI 3, vital signs as Observation vital-signs', async () => {
    await send(w.medplum, 'a08');
    await send(w.medplum, 'a08');
    const [visit] = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(visit.status, 'triaged');
    assert.equal(visit.priority.text, 'ESI 3');
    const vitals = await search(w.medplum, 'Observation', { encounter: `Encounter/${visit.id}`, category: 'vital-signs' });
    assert.equal(vitals.length, 2);
    const temp = vitals.find((o) => o.code.coding[0].code === '8310-5');
    assert.equal(temp.valueQuantity.value, 101.8);
  });

  test('A02 -> same Encounter in-progress, Cubículo 12, Dra. Ana Ramos', async () => {
    const [beforeVisit] = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    await send(w.medplum, 'a02');
    const [visit] = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(visit.id, beforeVisit.id);
    assert.notEqual(visit.meta.versionId, beforeVisit.meta.versionId);
    assert.equal(visit.status, 'in-progress');
    assert.equal(visit.location[0].location.display, 'Cubículo 12');
    assert.equal(visit.participant[0].individual.display, 'Dra. Ana Ramos');
    assert.equal(visit.priority.text, 'ESI 3', 'A02 keeps what earlier messages set');
  });

  test('A03 -> finished, disposition home', async () => {
    await send(w.medplum, 'a03');
    const [visit] = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(visit.status, 'finished');
    assert.equal(visit.hospitalization.dischargeDisposition.coding[0].code, 'home');
    assert.equal(visit.period.end, '2026-10-09T11:30:00-04:00');
  });

  test('A04 resent after A03 does not move the visit back', async () => {
    await send(w.medplum, 'a04');
    const [visit] = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(visit.status, 'finished');
  });

  test('A01 -> new IMP Encounter part of the ER visit, bed 304-B, Dr. Luis Ortiz', async () => {
    const x = await newWorld();
    await send(x.medplum, 'a04');
    assert.match(msa(await send(x.medplum, 'ingreso')), /^MSA\|AA/);
    const [imp] = await search(x.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0002' });
    const [er] = await search(x.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
    assert.equal(imp.class.code, 'IMP');
    assert.equal(imp.partOf.reference, `Encounter/${er.id}`);
    assert.equal(imp.location[0].location.display, 'Medicina 3er piso · Cama 304-B');
    assert.equal(imp.participant[0].individual.display, 'Dr. Luis Ortiz');
    assert.equal(er.status, 'finished');
    assert.equal(er.hospitalization.dischargeDisposition.text, 'Ingreso al hospital');
    const n = await notices(x.medplum, x.carmen);
    assert.ok(n.some((m) => m.text === 'La van a ingresar. Cuarto 304-B.'));
  });

  test('unknown patient -> ACK AE with a clear error, nothing created', async () => {
    const x = await newWorld();
    const bad = MSGS.a04.texto.replace('MRN-0001', 'MRN-9999');
    const ack = (await bot.handler(x.medplum, { input: Hl7Message.parse(bad) })).toString();
    assert.match(msa(ack), /^MSA\|AE\|SIM-0001\|No hay paciente con MRN MRN-9999/);
    assert.equal((await search(x.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' })).length, 0);
  });

  test('A02 before A04 -> AE (no visit is invented)', async () => {
    const x = await newWorld();
    assert.match(msa(await send(x.medplum, 'a02')), /^MSA\|AE\|.*falta el A04/);
  });

  test('unsupported message type -> AR', async () => {
    const x = await newWorld();
    const weird = MSGS.a04.texto.replace('ADT^A04^ADT_A01', 'SIU^S12^SIU_S12');
    assert.match(msa((await bot.handler(x.medplum, { input: Hl7Message.parse(weird) })).toString()), /^MSA\|AR/);
  });
});

describe('ORM (POR-37), ORU (POR-38), RAS (POR-40), stages, queue and notices', () => {
  let w;
  let visit;
  before(async () => {
    w = await newWorld();
    for (const id of ['a04', 'a08']) {
      await send(w.medplum, id);
    }
    [visit] = await search(w.medplum, 'Encounter', { identifier: 'urn:hospital-demo:visita|V-0001' });
  });

  test('ORM with 5 orders -> 5 ServiceRequest active, resending keeps 5', async () => {
    assert.match(msa(await send(w.medplum, 'orm')), /^MSA\|AA/);
    assert.match(msa(await send(w.medplum, 'orm')), /^MSA\|AA/);
    const orders = await search(w.medplum, 'ServiceRequest', { encounter: `Encounter/${visit.id}` });
    assert.equal(orders.length, 5);
    assert.ok(orders.every((o) => o.status === 'active' && o.identifier[0].system === 'urn:hospital-demo:orden'));
    const rx = orders.find((o) => o.code.text === 'Radiografía de tórax');
    assert.equal(rx.category[0].text, 'imagen');
    assert.equal(orders.find((o) => o.code.text === 'Lactato').category[0].text, 'laboratorio');
  });

  test('orders notice is "estudios" (never "visita")', async () => {
    const n = await notices(w.medplum, w.carmen);
    const orm = n.filter((m) => m.text === 'Le ordenaron 5 estudios.');
    assert.equal(orm.length, 1);
    assert.deepEqual(orm[0].cats, ['estudios']);
  });

  test('samples taken -> one Specimen per blood order, with request and -04:00 time', async () => {
    await send(w.medplum, 'muestras');
    await send(w.medplum, 'muestras');
    const specimens = await search(w.medplum, 'Specimen', { subject: `Patient/${w.carmen.id}` });
    assert.equal(specimens.length, 4);
    assert.ok(specimens.every((s) => s.request[0].reference.startsWith('ServiceRequest/')));
    assert.equal(specimens[0].collection.collectedDateTime, '2026-10-09T08:40:00-04:00');
  });

  test('queue: after triage 6 people / 45–60 min, after samples 3 / 20–30 min (simulated)', async () => {
    const { input } = await stageTask(w.medplum);
    assert.equal(input['personas-antes'], 3);
    assert.equal(input['espera-estimada'], '20–30 min');
    assert.equal(input.esi, 3);
  });

  test('ORU F (hemograma + lactato) -> final reports, values, ranges, H and N, basedOn the order', async () => {
    await send(w.medplum, 'cultivos');
    await send(w.medplum, 'a02');
    assert.match(msa(await send(w.medplum, 'oru1')), /^MSA\|AA/);
    const reports = await search(w.medplum, 'DiagnosticReport', { encounter: `Encounter/${visit.id}` });
    const cbc = reports.find((r) => r.code.text === 'Hemograma completo');
    assert.equal(cbc.status, 'final');
    const [cbcOrder] = await search(w.medplum, 'ServiceRequest', { identifier: 'urn:hospital-demo:orden|O-1001' });
    assert.equal(cbc.basedOn[0].reference, `ServiceRequest/${cbcOrder.id}`);
    assert.equal(cbcOrder.status, 'completed');
    const labs = await search(w.medplum, 'Observation', { encounter: `Encounter/${visit.id}`, category: 'laboratory' });
    const wbc = labs.find((o) => o.code.text === 'Glóbulos blancos');
    assert.equal(wbc.valueQuantity.value, 15.2);
    assert.equal(wbc.valueQuantity.unit, 'mil/µL');
    assert.equal(wbc.referenceRange[0].low.value, 4.5);
    assert.equal(wbc.referenceRange[0].high.value, 11);
    assert.equal(wbc.interpretation[0].coding[0].code, 'H');
    assert.equal(wbc.note[0].text, 'Están altos. Suele pasar cuando el cuerpo combate una infección.');
    assert.equal(labs.find((o) => o.code.text === 'Hemoglobina').interpretation[0].coding[0].code, 'N');
  });

  test('ORU notices: "resultado" + the neutral one with visita + neutral-familia', async () => {
    const n = await notices(w.medplum, w.carmen);
    const ready = n.find((m) => m.text === 'Resultado listo: Hemograma completo.');
    assert.deepEqual(ready.cats, ['resultado']);
    const neutral = n.filter((m) => m.text === 'Hay un resultado nuevo (privado).');
    assert.ok(neutral.length >= 1);
    assert.deepEqual(neutral[0].cats, ['visita', 'neutral-familia']);
  });

  test('resending the same ORU duplicates nothing', async () => {
    const before = (await search(w.medplum, 'Observation', { encounter: `Encounter/${visit.id}`, _count: '100' })).length;
    const beforeNotices = (await notices(w.medplum, w.carmen)).length;
    await send(w.medplum, 'oru1');
    assert.equal((await search(w.medplum, 'Observation', { encounter: `Encounter/${visit.id}`, _count: '100' })).length, before);
    assert.equal((await notices(w.medplum, w.carmen)).length, beforeNotices);
  });

  test('ORU P (radiografía) -> preliminary report, imaging Observation with valueString', async () => {
    await send(w.medplum, 'oru2');
    const [rx] = await search(w.medplum, 'DiagnosticReport', { identifier: 'urn:hospital-demo:reporte|O-1004' });
    assert.equal(rx.status, 'preliminary');
    const [obs] = await search(w.medplum, 'Observation', { identifier: 'urn:hospital-demo:resultado|O-1004-30746-2' });
    assert.equal(obs.category[0].coding[0].code, 'imaging');
    assert.equal(obs.valueString, 'Posible pulmonía en la parte baja del pulmón derecho');
    const [rxOrder] = await search(w.medplum, 'ServiceRequest', { identifier: 'urn:hospital-demo:orden|O-1004' });
    assert.equal(rxOrder.status, 'active', 'preliminary does not complete the order');
  });

  test('ORU C updates the SAME report to corrected (same id, new version)', async () => {
    const [before] = await search(w.medplum, 'DiagnosticReport', { identifier: 'urn:hospital-demo:reporte|O-1004' });
    await send(w.medplum, 'correccion');
    const all = await search(w.medplum, 'DiagnosticReport', { identifier: 'urn:hospital-demo:reporte|O-1004' });
    assert.equal(all.length, 1);
    assert.equal(all[0].id, before.id);
    assert.notEqual(all[0].meta.versionId, before.meta.versionId);
    assert.equal(all[0].status, 'corrected');
  });

  test('OBX without interpretation -> no interpretation (never "N")', async () => {
    const x = await newWorld();
    await send(x.medplum, 'a04');
    await send(x.medplum, 'orm');
    const noFlag = MSGS.oru1.texto.replace('|4.5-11.0|H|', '|4.5-11.0||');
    await bot.handler(x.medplum, { input: Hl7Message.parse(noFlag) });
    const [wbc] = await search(x.medplum, 'Observation', { identifier: 'urn:hospital-demo:resultado|O-1001-6690-2' });
    assert.equal(wbc.interpretation, undefined);
  });

  test('ORU for an order that does not exist -> AE', async () => {
    const x = await newWorld();
    await send(x.medplum, 'a04');
    assert.match(msa(await send(x.medplum, 'oru1')), /^MSA\|AE\|.*orden que no existe/);
  });

  test('RAS -> one MedicationAdministration per RXA with dose, route and time; notice "medicina"', async () => {
    await send(w.medplum, 'ras1');
    await send(w.medplum, 'ras2');
    await send(w.medplum, 'ras2');
    const meds = await search(w.medplum, 'MedicationAdministration', { context: `Encounter/${visit.id}` });
    assert.equal(meds.length, 3);
    const cef = meds.find((m) => m.medicationCodeableConcept.text === 'Ceftriaxona');
    assert.equal(cef.status, 'completed');
    assert.equal(cef.effectiveDateTime, '2026-10-09T10:15:00-04:00');
    assert.equal(cef.dosage.route.text, 'por la vena');
    assert.deepEqual(cef.dosage.dose, { value: 1, unit: 'g' });
    const n = await notices(w.medplum, w.carmen);
    const medNotices = n.filter((m) => m.text.startsWith('Le dieron:'));
    assert.equal(medNotices.length, 3);
    assert.ok(medNotices.every((m) => m.cats.length === 1 && m.cats[0] === 'medicina'));
    assert.ok(medNotices.some((m) => m.text === 'Le dieron: Ceftriaxona 1 g por la vena.'));
  });

  test('stage Task: Decisión (6) once every order has a report; "estudios-en-curso" counts open orders', async () => {
    const { task, input } = await stageTask(w.medplum);
    assert.equal(task.code.coding[0].code, 'etapa');
    assert.equal(task.for.reference, `Patient/${w.carmen.id}`);
    assert.equal(input.etapa, 6);
    assert.equal(input['nombre-etapa'], 'Decisión');
    assert.equal(input['personas-antes'], undefined, 'queue removed once in the cubicle');
    // Open orders: radiografía (now corrected -> completed), hemocultivos (registered) -> 1
    assert.equal(input['estudios-en-curso'], 1);
  });

  test('A03 -> stage 7 Alta, Task completed', async () => {
    await send(w.medplum, 'a03');
    const { task, input } = await stageTask(w.medplum);
    assert.equal(input.etapa, 7);
    assert.equal(task.status, 'completed');
    assert.equal(input['texto-etapa'], "Le dieron de alta. Sus instrucciones están en 'Mi cuidado'.");
  });

  test('every notice category is one of the contract categories', async () => {
    const n = await notices(w.medplum, w.carmen);
    const allowed = new Set(['visita', 'medicina', 'estudios', 'resultado', 'neutral-familia']);
    assert.ok(n.every((m) => m.cats.every((c) => allowed.has(c))));
  });

  test('a Provenance with the original message is stored', async () => {
    const provs = await search(w.medplum, 'Provenance', { _count: '100' });
    assert.ok(provs.length >= 10);
    const att = provs[0].entity[0].what.extension[0].valueAttachment;
    assert.equal(att.contentType, 'x-application/hl7-v2+er7');
    assert.match(Buffer.from(att.data, 'base64').toString('utf8'), /^MSH\|/);
  });
});

describe('helpers', () => {
  test('HL7 time without zone is Puerto Rico (-04:00)', () => {
    assert.equal(bot.hl7Time('202610090812'), '2026-10-09T08:12:00-04:00');
    assert.equal(bot.hl7Time('20261009081200-0400'), '2026-10-09T08:12:00-04:00');
    assert.equal(bot.hl7Time(''), undefined);
  });
});
