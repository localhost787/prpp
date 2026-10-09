#!/usr/bin/env node
// POR-53 · admit-data (API-19), live against the server with the real demo accounts.
// The admission itself is already done by the Bot hl7-a-fhir (A01/A06) and the simulator ("Ingresar",
// message "ingreso"); the unit Location with visiting hours and Dr. Luis Ortiz are in the fixed seed.
// This script proves the acceptance criteria and then PUTS THE CASE BACK the way it was:
//   1. snapshot of the ER visit (V-0001) and its stage Task
//   2. Carmen and Lourdes listen to Encounter?patient=<Carmen> (WebSocket)
//   3. the simulator client sends the A01 "ingreso" TWICE (idempotence)
//   4. checks as Carmen, as Lourdes (visita) and as Lourdes with no access (via the sharing Bot)
//   5. restore: delete the IMP visit, its notice and its Provenance; ER visit and Task back to the snapshot
//      content (new version); Lourdes' approved seed back (visita + medicinas + instrucciones)
// Needs the ER visit V-0001 (tour). Usage: node scripts/test-ingreso.mjs
import { required } from '../lib/env.mjs';
import { log, loginClient, loginUser, rawRequest } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';
import { sendHl7 } from '../simulator/core.mjs';
import { buildMessages, todayPR } from '../simulator/mensajes.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const P = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const SEED = ['visita', 'medicinas', 'instrucciones'];
const IMP = 'http://terminology.hl7.org/CodeSystem/v3-ActCode|IMP';
const opts = { cache: 'no-cache' };

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const get = (client, path) => rawRequest(client, 'GET', `fhir/R4/${path}`);
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listen(client, criteria) {
  const sub = await client.createResource({ resourceType: 'Subscription', status: 'active', reason: 'test-ingreso', criteria, channel: { type: 'websocket' } });
  const binding = await client.get(client.fhirUrl('Subscription', sub.id, '$get-ws-binding-token'));
  const token = binding.parameter.find((p) => p.name === 'token').valueString;
  const ws = new WebSocket(binding.parameter.find((p) => p.name === 'websocket-url').valueUrl);
  const got = [];
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
  ws.addEventListener('message', (ev) => {
    const r = JSON.parse(ev.data).entry?.[1]?.resource;
    if (r?.resourceType === 'Encounter') {
      got.push({ at: Date.now(), resource: r });
    }
  });
  return { got, close: async () => (ws.close(), client.deleteResource('Subscription', sub.id).catch(() => undefined)) };
}

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const sim = await loginClient(required('SIMULATOR_CLIENT_ID'), required('SIMULATOR_CLIENT_SECRET'));
const shareBot = (await carmen.searchResources('Bot', { name: 'compartir-familia' }))[0];
const share = (list) => rawRequest(carmen, 'POST', `fhir/R4/Bot/${shareBot.id}/$execute`, { familiar: LOURDES_RP, compartir: list }, 'application/json');

// 1. snapshot
const er = await admin.searchOne('Encounter', { identifier: `${SYSTEMS.visit}|V-0001` }, opts);
if (!er) {
  console.error('FAIL no hay visita V-0001: corra el tour del simulador primero');
  process.exit(1);
}
const stageTask = await admin.searchOne('Task', { identifier: `${SYSTEMS.stageTask}|V-0001` }, opts);
const impBefore = await admin.searchOne('Encounter', { identifier: `${SYSTEMS.visit}|V-0002` }, opts);
const noticeBefore = await admin.searchOne('Communication', { identifier: 'urn:portal:aviso-id|V-0001-ingreso' }, opts);
log('ok', `antes: V-0001 ${er.status} (${er.hospitalization?.dischargeDisposition?.text ?? '-'}), V-0002 ${impBefore ? 'existe' : 'no existe'}`);

let imp;
const listeners = [];
try {
  console.log('\n== Unidad y médico (datos fijos) ==');
  const unit = entries(await get(lourdes, 'Location?name=Medicina'))[0];
  const hours = unit?.hoursOfOperation?.[0];
  check('Location "Medicina 3er piso · Cama 304-B" con horario de visitas 10:00 AM – 8:00 PM', hours?.openingTime === '10:00:00' && hours?.closingTime === '20:00:00', `${unit?.name}, ${hours?.openingTime}-${hours?.closingTime}, ${hours?.daysOfWeek?.length} días`);

  // 2. listen
  const cLive = await listen(carmen, `Encounter?patient=${P}`);
  const lLive = await listen(lourdes, `Encounter?patient=${P}`);
  listeners.push(cLive, lLive);
  await sleep(1500);

  // 3. "Ingresar" twice
  console.log('\n== Ingresar (A01) dos veces ==');
  const msg = buildMessages(todayPR()).find((m) => m.id === 'ingreso');
  const sent = Date.now();
  const a1 = await sendHl7(sim, required('BOT_HL7_ID'), msg.texto);
  check('simulador -> Bot: A01 ingreso -> ACK AA', a1.ok, a1.msa);
  await sleep(6000);
  const a2 = await sendHl7(sim, required('BOT_HL7_ID'), msg.texto);
  check('repetir el A01 -> ACK AA', a2.ok, a2.msa);

  // 4. checks
  console.log('\n== Como Carmen ==');
  const r = await get(carmen, `Encounter?patient=${P}&class=${IMP}`);
  const imps = entries(r);
  imp = imps[0];
  check('Encounter?patient=<Carmen>&class=…|IMP -> 1 (idempotente tras dos A01)', r.status === 200 && imps.length === 1, `${r.status}, ${imps.length}`);
  check('  status in-progress', imp?.status === 'in-progress', imp?.status);
  check('  partOf = la visita de Emergencias', imp?.partOf?.reference === `Encounter/${er.id}`, imp?.partOf?.reference);
  check('  location[0] "Medicina 3er piso · Cama 304-B"', imp?.location?.[0]?.location?.display === 'Medicina 3er piso · Cama 304-B', imp?.location?.[0]?.location?.display);
  check('  participant[0].individual = Dr. Luis Ortiz', imp?.participant?.[0]?.individual?.display === 'Dr. Luis Ortiz', imp?.participant?.[0]?.individual?.display);
  const byPart = await get(carmen, `Encounter?part-of=Encounter/${er.id}`);
  check('Encounter?part-of=<visita de Emergencias> -> 1 (la misma)', entries(byPart).length === 1 && entries(byPart)[0].id === imp?.id, `${byPart.status}, ${entries(byPart).length}`);
  const erNow = (await get(carmen, `Encounter/${er.id}`)).body;
  check('la visita de Emergencias queda finished con disposición "Ingreso al hospital"', erNow.status === 'finished' && erNow.hospitalization?.dischargeDisposition?.text === 'Ingreso al hospital', `${erNow.status}, ${erNow.hospitalization?.dischargeDisposition?.text}`);
  const emer = entries(await get(carmen, `Encounter?patient=${P}&class=http://terminology.hl7.org/CodeSystem/v3-ActCode|EMER`));
  check('sigue habiendo una sola visita EMER', emer.length === 1, `${emer.length}`);

  console.log('\n== Tiempo real (Encounter?patient=<Carmen>) ==');
  const first = cLive.got.find((g) => g.resource.id === imp?.id);
  check('Carmen recibe el ingreso por WebSocket en < 5 s', first && first.at - sent < 5000, first ? `${first.at - sent} ms` : 'no llegó');
  const lFirst = lLive.got.find((g) => g.resource.id === imp?.id);
  check('Lourdes (visita) también lo recibe', !!lFirst, lFirst ? `${lFirst.at - sent} ms` : 'no llegó');

  console.log('\n== Familia ==');
  const lr = await get(lourdes, `Encounter?patient=${P}&class=${IMP}`);
  check('Lourdes (visita) ve la visita de hospitalización', lr.status === 200 && entries(lr).length === 1, `${lr.status}, ${entries(lr).length}`);
  const t0 = Date.now();
  const off = await share([]);
  check('Carmen le quita todo el acceso a Lourdes (Bot compartir-familia)', off.status === 200, `${off.status}, ${Date.now() - t0} ms`);
  const ln = await get(lourdes, `Encounter?patient=${P}&class=${IMP}`);
  check('Lourdes sin acceso: búsqueda -> Bundle vacío (canon §4)', ln.status === 200 && entries(ln).length === 0, `${ln.status}, ${entries(ln).length}`);
  const lid = await get(lourdes, `Encounter/${imp?.id}`);
  check('Lourdes sin acceso: lectura por id -> 404', lid.status === 404, `${lid.status}`);
} finally {
  // 5. restore
  console.log('\n== Restaurar el caso ==');
  const back = await share(SEED);
  log(back.status === 200 ? 'ok' : 'FAIL', `Lourdes vuelve a ${SEED.join(' + ')} (${back.status})`);
  for (const l of listeners) {
    await l.close();
  }
  const impNow = await admin.searchOne('Encounter', { identifier: `${SYSTEMS.visit}|V-0002` }, opts);
  const noticeNow = await admin.searchOne('Communication', { identifier: 'urn:portal:aviso-id|V-0001-ingreso' }, opts);
  const doomed = [];
  if (impNow && !impBefore) {
    doomed.push(...(await admin.searchResources('Provenance', { target: `Encounter/${impNow.id}` }, opts)));
  }
  if (noticeNow && !noticeBefore) {
    doomed.push(noticeNow);
  }
  if (impNow && !impBefore) {
    doomed.push(impNow);
  }
  for (const x of doomed) {
    await admin.deleteResource(x.resourceType, x.id);
  }
  for (const snap of [er, stageTask].filter(Boolean)) {
    const cur = await admin.readResource(snap.resourceType, snap.id);
    const restored = await admin.updateResource(
      { ...snap, meta: { ...snap.meta, versionId: cur.meta.versionId } },
      { headers: { 'If-Match': `W/"${cur.meta.versionId}"` } }
    );
    log('ok', `${snap.resourceType}/${snap.id} vuelve al contenido de antes (versión ${restored.meta.versionId})`);
  }
  log('ok', `borrados: ${doomed.map((x) => x.resourceType).join(', ') || 'nada'}`);
  const erAfter = await admin.readResource('Encounter', er.id);
  log(erAfter.status === er.status ? 'ok' : 'FAIL', `después: V-0001 ${erAfter.status} (${erAfter.hospitalization?.dischargeDisposition?.text ?? '-'})`);
}
console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
