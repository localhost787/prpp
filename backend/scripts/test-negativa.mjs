#!/usr/bin/env node
// POR-85 · prueba negativa EN VIVO (API-02, API-16, API-17, API-18), with the real demo accounts.
// Lourdes (family) must NOT see what Carmen did not share, nor ever the R-labeled data, by search,
// by id, by count, by _include and by WebSocket; with all 4 categories on she sees results but never R;
// revoking with the Bot compartir-familia takes effect in < 10 s.
//   1. Only "visita" for Lourdes
//   2. From the seed (visita + medicinas + instrucciones), turn off only "medicinas"
//   3. Remove all access (timed) + no new notification reaches her
//   4. Everything on for Lourdes: the R data is still hidden (search, id, count, includes, WebSocket); Carmen sees it
//   5. Family writes -> 403
// Temporary test data (4 Observations, 2 notices, created by the admin as "the hospital") is deleted at the
// end, and Lourdes' approved seed (visita + medicinas + instrucciones) is ALWAYS restored.
// Search of a type outside the policy: Medplum 5.1.42 answers 403, the contract wants 200 empty; this
// test accepts "200 empty OR 403" as "does not see" and PRINTS which one (open decision, §1.3).
// Usage: node scripts/test-negativa.mjs
import { required } from '../lib/env.mjs';
import { log, loginUser, rawRequest } from '../lib/medplum.mjs';
import { NOT_SENSITIVE, SYSTEMS } from '../lib/policies.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const C = required('DEMO_CARMEN_PATIENT_ID');
const P = `Patient/${C}`;
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const SEED = ['visita', 'medicinas', 'instrucciones'];
const R = `${SYSTEMS.confidentiality}|R`;
const STUDY_NAMES = /hemograma|lactato|panel metab|radiograf|hemocultivo|gl[oó]bulos|confidencial/i;
const opts = { cache: 'no-cache' };

let pass = 0;
let fail = 0;
const results403 = new Set();
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const info = (msg) => console.log(`info  ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (client, path) => rawRequest(client, 'GET', `fhir/R4/${path}`);
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);
const param = (type) => (type === 'Communication' ? 'subject' : 'patient');
/** "Does not see": 200 + empty Bundle (contract) or 403 (Medplum when the type is not in the policy). */
function hidden(r, label) {
  if (r.status === 403) {
    results403.add(label);
  }
  return (r.status === 200 && entries(r).length === 0) || r.status === 403;
}

async function listen(client, criteria, label) {
  const sub = await client.createResource({ resourceType: 'Subscription', status: 'active', reason: `test-negativa ${label}`, criteria, channel: { type: 'websocket' } });
  const binding = await client.get(client.fhirUrl('Subscription', sub.id, '$get-ws-binding-token'));
  const token = binding.parameter.find((p) => p.name === 'token').valueString;
  const ws = new WebSocket(binding.parameter.find((p) => p.name === 'websocket-url').valueUrl);
  const got = [];
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
  ws.addEventListener('message', (ev) => {
    const r = JSON.parse(ev.data).entry?.[1]?.resource;
    if (r?.resourceType && r.resourceType !== 'SubscriptionStatus') {
      got.push({ at: Date.now(), id: r.id, resource: r });
    }
  });
  return { got, close: async () => (ws.close(), client.deleteResource('Subscription', sub.id).catch(() => undefined)) };
}

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const bot = (await carmen.searchResources('Bot', { name: 'compartir-familia' }))[0];
const execute = (client, compartir) => rawRequest(client, 'POST', `fhir/R4/Bot/${bot.id}/$execute`, { familiar: LOURDES_RP, compartir }, 'application/json');

// Samples (as the hospital/admin) for reads by id.
const one = async (type, params) => (await admin.searchResources(type, { ...params, _count: '1' }, opts))[0];
const wbc = await one('Observation', { patient: P, code: '6690-2' });
const sensitive = await one('Observation', { patient: P, _security: R });
const medRequest = await one('MedicationRequest', { patient: P });
const report = await one('DiagnosticReport', { patient: P });
if (!wbc || !sensitive) {
  console.error('FAIL faltan datos del caso (glóbulos blancos y el dato R): corra el tour del simulador y el seed');
  process.exit(1);
}
const temp = [];
const listeners = [];
async function hospitalCreates(resource) {
  const created = await admin.createResource({ ...resource, meta: { ...(resource.meta ?? {}), tag: [{ system: SYSTEMS.origin, code: 'simulado' }] } });
  temp.push(created);
  return created;
}
const tempObservation = (label, security) =>
  hospitalCreates({
    resourceType: 'Observation',
    ...(security ? { meta: { security: [{ system: SYSTEMS.confidentiality, code: 'R' }] } } : {}),
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { text: `Prueba automática POR-85 ${label} (se borra)` },
    subject: { reference: P },
    valueString: 'prueba',
  });
const tempNotice = (label) =>
  hospitalCreates({
    resourceType: 'Communication',
    status: 'completed',
    category: [{ coding: [{ system: SYSTEMS.notice, code: 'visita' }] }],
    subject: { reference: P },
    payload: [{ contentString: `Aviso de prueba automática POR-85 ${label} (se borra)` }],
  });

const CLINICAL = ['MedicationRequest', 'MedicationAdministration', 'CarePlan', 'Appointment', 'ServiceRequest', 'Specimen', 'DiagnosticReport', 'Observation'];

try {
  // ---------- 1 ----------
  console.log('== 1 · Solo "visita" para Lourdes ==');
  let r = await execute(carmen, ['visita']);
  check('Carmen comparte solo "visita" (Bot compartir-familia)', r.status === 200, `${r.status} ${JSON.stringify(r.body?.compartir)}`);
  for (const type of CLINICAL) {
    const s = await get(lourdes, `${type}?patient=${P}`);
    check(`lourdes: ${type}?patient=<Carmen> -> no ve nada`, hidden(s, `${type} (búsqueda)`), `${s.status}, ${entries(s).length}`);
  }
  for (const [label, res] of [['Observation glóbulos blancos', wbc], ['MedicationRequest', medRequest], ['DiagnosticReport', report], ['Observation R (sensible)', sensitive]]) {
    if (res) {
      const s = await get(lourdes, `${res.resourceType}/${res.id}`);
      check(`lourdes lee ${label} por id -> 404`, s.status === 404, `${s.status}`);
    }
  }
  const cats = new Set(entries(await get(lourdes, `Communication?subject=${P}&_count=200`)).flatMap((c) => c.category.map((x) => x.coding[0].code)));
  check('lourdes: Communication?subject=<Carmen> solo trae avisos "visita" (y el neutral)', [...cats].every((c) => c === 'visita' || c === 'neutral-familia'), [...cats].join(', '));
  const count = await get(lourdes, `Observation?patient=${P}&_summary=count`);
  check('lourdes: Observation _summary=count -> 0', (count.status === 200 && count.body?.total === 0) || count.status === 403, `${count.status}, total ${count.body?.total}`);
  const inc = await get(lourdes, `Encounter?patient=${P}&_revinclude=Observation:encounter&_revinclude=DiagnosticReport:encounter&_revinclude=MedicationRequest:encounter`);
  check('lourdes: Encounter + _revinclude de estudios/recetas no trae nada extra', inc.status === 200 && entries(inc).every((x) => x.resourceType === 'Encounter'), `${inc.status}, ${entries(inc).map((x) => x.resourceType).join(',')}`);
  const tasks = entries(await get(lourdes, `Task?patient=${P}&_count=100`));
  const stage = tasks.filter((t) => t.code?.coding?.[0]?.code === 'etapa');
  const others = tasks.filter((t) => t.code?.coding?.[0]?.code !== 'etapa');
  check('lourdes: la Task de etapa no nombra estudios ni el dato sensible', stage.length > 0 && !STUDY_NAMES.test(JSON.stringify(stage)), `${stage.length} Task de etapa`);
  const leakyTasks = others.filter((t) => STUDY_NAMES.test(JSON.stringify(t)));
  check('lourdes: las demás Task (trámites) no nombran estudios', leakyTasks.length === 0, leakyTasks.map((t) => `"${t.description}"`).join(', ') || `${others.length} Task`);

  // WebSocket: a new result (normal) and a new R result.
  console.log('\n== 1b · Tiempo real: un resultado nuevo y un dato R nuevo ==');
  const crit = `Observation?patient=${P}`;
  const lObs = await listen(lourdes, crit, 'lourdes-obs');
  const cObs = await listen(carmen, crit, 'carmen-obs');
  listeners.push(lObs, cObs);
  await sleep(1500);
  const sent = Date.now();
  const normal = await tempObservation('normal');
  const restricted = await tempObservation('R', true);
  await sleep(8000);
  const got = (l, x) => l.got.find((g) => g.id === x.id);
  check('carmen recibe el resultado nuevo y el dato R (control)', !!got(cObs, normal) && !!got(cObs, restricted), `${got(cObs, normal) ? got(cObs, normal).at - sent : '-'} ms`);
  check('lourdes (sin estudios) NO recibe nada (8 s esperando)', lObs.got.length === 0, `${lObs.got.length} notificaciones`);

  // ---------- 2 ----------
  console.log('\n== 2 · Del seed, apagar solo "medicinas" ==');
  await execute(carmen, SEED);
  const before = await get(lourdes, `MedicationRequest?patient=${P}`);
  check('con el seed, lourdes ve las recetas (control)', before.status === 200 && entries(before).length > 0, `${entries(before).length}`);
  let t0 = Date.now();
  r = await execute(carmen, ['visita', 'instrucciones']);
  let medsGone;
  for (;;) {
    medsGone = await get(lourdes, `MedicationRequest?patient=${P}`);
    if (hidden(medsGone, 'MedicationRequest (tras apagar)') || Date.now() - t0 > 10000) {
      break;
    }
    await sleep(300);
  }
  const ms2 = Date.now() - t0;
  check('las recetas pasan a "no ve" en < 10 s', hidden(medsGone, 'MedicationRequest') && ms2 < 10000, `${ms2} ms, ${medsGone.status}`);
  const me = await rawRequest(lourdes, 'GET', 'auth/me');
  const policyText = JSON.stringify(me.body?.accessPolicy ?? {});
  check('auth/me de lourdes ya no tiene la entrada de medicinas para Carmen', !policyText.includes(`MedicationRequest?patient=${P}`) && policyText.includes(`CarePlan?patient=${P}`));
  const care = await get(lourdes, `CarePlan?patient=${P}`);
  const enc = await get(lourdes, `Encounter?patient=${P}`);
  check('lo demás queda igual (CarePlan y la visita)', entries(care).length > 0 && entries(enc).length > 0, `CarePlan ${entries(care).length}, Encounter ${entries(enc).length}`);

  // ---------- 3 ----------
  console.log('\n== 3 · Quitar el acceso (cronometrado) ==');
  await execute(carmen, SEED);
  const lNotice = await listen(lourdes, `Communication?subject=${P}`, 'lourdes-avisos');
  listeners.push(lNotice);
  await sleep(1500);
  const n1 = await tempNotice('antes');
  await sleep(5000);
  check('control: con "visita", a lourdes le llega un aviso nuevo', !!lNotice.got.find((g) => g.id === n1.id), `${lNotice.got.length}`);
  t0 = Date.now();
  r = await execute(carmen, []);
  const botMs = Date.now() - t0;
  const after = {};
  for (const type of ['Encounter', 'Task', 'Communication', ...CLINICAL]) {
    after[type] = await get(lourdes, `${type}?${param(type)}=${P}`);
  }
  const ms3 = Date.now() - t0;
  check(`todo devuelve "no ve" en < 10 s (${ms3} ms desde la orden; Bot ${botMs} ms)`, Object.entries(after).every(([t, x]) => hidden(x, `${t} (sin acceso)`)) && ms3 < 10000, Object.entries(after).map(([t, x]) => `${t} ${x.status}/${entries(x).length}`).join(' '));
  const readEnc = await get(lourdes, `Encounter/${entries(enc)[0]?.id}`);
  check('sin acceso: lee la visita por id -> 404', readEnc.status === 404, `${readEnc.status}`);
  const seenBefore = lNotice.got.length;
  const n2 = await tempNotice('después');
  await sleep(8000);
  check('sin acceso: NO le llega el aviso nuevo (8 s esperando)', !lNotice.got.find((g) => g.id === n2.id) && lNotice.got.length === seenBefore, `${lNotice.got.length - seenBefore} nuevas`);

  // ---------- 4 ----------
  console.log('\n== 4 · Encender TODO: el dato R sigue oculto ==');
  await execute(carmen, ['visita', 'medicinas', 'instrucciones', 'estudios']);
  for (const [who, client] of [['lourdes', lourdes]]) {
    const s = entries(await get(client, `Observation?patient=${P}&_count=200`));
    check(`${who}: ve resultados (estudios encendido)`, s.length > 0 && s.some((o) => o.id === wbc.id), `${s.length}`);
    check(`${who}: el dato R NO aparece en la búsqueda`, !s.some((o) => o.id === sensitive.id || o.id === restricted.id));
    const byId = await get(client, `Observation/${sensitive.id}`);
    check(`${who}: el dato R por id -> 404`, byId.status === 404, `${byId.status}`);
    const cnt = await get(client, `Observation?patient=${P}&_summary=count`);
    const cntC = await get(carmen, `Observation?patient=${P}&_summary=count`);
    check(`${who}: conteo = el de Carmen − 2 (el R del caso + el R de prueba)`, cnt.body?.total === cntC.body?.total - 2, `${who} ${cnt.body?.total}, carmen ${cntC.body?.total}`);
    const rev = await get(client, `Patient?_id=${C}&_revinclude=Observation:subject&_count=300`);
    check(`${who}: Patient + _revinclude=Observation no trae el R`, !entries(rev).some((o) => o.id === sensitive.id || o.id === restricted.id), `${entries(rev).length} entradas`);
    const drInc = await get(client, `DiagnosticReport?patient=${P}&_include=DiagnosticReport:result`);
    check(`${who}: DiagnosticReport + _include=result no trae el R`, !entries(drInc).some((o) => o.id === sensitive.id), `${entries(drInc).length}`);
    const texts = JSON.stringify([...entries(await get(client, `Task?patient=${P}&_count=100`)), ...entries(await get(client, `Communication?subject=${P}&_count=200`))]);
    check(`${who}: ni Task ni Communication mencionan el dato R`, !/confidencial|Dato sensible/i.test(texts));
  }
  const cs = entries(await get(carmen, `Observation?patient=${P}&_security=${R}`));
  check('carmen SÍ ve su dato R (búsqueda y por id)', cs.some((o) => o.id === sensitive.id) && (await get(carmen, `Observation/${sensitive.id}`)).status === 200);
  const lNotSensitive = await get(lourdes, `Observation?patient=${P}&${NOT_SENSITIVE.replace('_security:not', '_security')}`);
  check('lourdes: búsqueda explícita _security=R -> vacío', lNotSensitive.status === 200 && entries(lNotSensitive).length === 0, `${lNotSensitive.status}, ${entries(lNotSensitive).length}`);
  // WebSocket with "estudios" on: a new normal result arrives, a new R result does not.
  const lObs4 = await listen(lourdes, crit, 'lourdes-obs-estudios');
  listeners.push(lObs4);
  await sleep(1500);
  const sent4 = Date.now();
  const normal4 = await tempObservation('normal (estudios encendido)');
  const restricted4 = await tempObservation('R (estudios encendido)', true);
  await sleep(8000);
  check('lourdes (estudios) recibe el resultado nuevo en < 5 s', !!got(lObs4, normal4) && got(lObs4, normal4).at - sent4 < 5000, `${got(lObs4, normal4) ? got(lObs4, normal4).at - sent4 : '-'} ms`);
  check('lourdes (estudios) NO recibe el dato R nuevo', !got(lObs4, restricted4), `${lObs4.got.length} notificaciones`);

  // ---------- 5 ----------
  console.log('\n== 5 · Escrituras de la familia ==');
  await execute(carmen, SEED);
  r = await rawRequest(lourdes, 'POST', `fhir/R4/Bot/${bot.id}/$execute`, { familiar: LOURDES_RP, compartir: ['visita', 'estudios'] }, 'application/json');
  const still = await get(lourdes, `DiagnosticReport?patient=${P}`);
  // The backlog says 403. Lourdes may run the Bot (her own "Mi salud" patient policy lists it), and the Bot
  // itself refuses: any 4xx is a rejection; the real code is printed for the record.
  check('lourdes ejecuta compartir-familia para darse "estudios" -> rechazado y sigue sin estudios', r.status >= 400 && r.status < 500 && hidden(still, 'DiagnosticReport'), `${r.status} ${JSON.stringify(r.body?.issue?.[0]?.details?.text ?? '')}, DiagnosticReport ${still.status}/${entries(still).length}`);
  const appt = await one('Appointment', { patient: P });
  if (appt) {
    r = await rawRequest(lourdes, 'POST', 'fhir/R4/AppointmentResponse', { resourceType: 'AppointmentResponse', appointment: { reference: `Appointment/${appt.id}` }, actor: { reference: P }, participantStatus: 'accepted' });
    check('lourdes crea un AppointmentResponse por Carmen -> 403', r.status === 403, `${r.status}`);
    if (r.status === 201) {
      temp.push(r.body);
    }
  }
} finally {
  console.log('\n== Restaurar ==');
  const back = await execute(carmen, SEED);
  log(back.status === 200 ? 'ok' : 'FAIL', `Lourdes vuelve al seed: ${JSON.stringify(back.body?.compartir)}`);
  for (const l of listeners) {
    await l.close();
  }
  for (const x of temp) {
    await admin.deleteResource(x.resourceType, x.id).catch(() => undefined);
  }
  log('ok', `borrados ${temp.length} recursos de prueba (${temp.map((x) => x.resourceType).join(', ')})`);
}
if (results403.size) {
  info(`búsquedas que dieron 403 en vez de Bundle vacío (decisión abierta §1.3): ${[...results403].join(', ')}`);
} else {
  info('todas las búsquedas sin permiso dieron 200 con Bundle vacío (canon §4)');
}
console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
