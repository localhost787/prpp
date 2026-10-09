#!/usr/bin/env node
// POR-54 (API-20) + POR-57 (API-21) with the real demo accounts (never admin for the checks).
// Runs the seed twice (idempotence), then checks what Carmen and Lourdes (visita + medicinas + instrucciones)
// can read and write. Creates only AppointmentResponses (deleted at the end).
// Usage: node scripts/test-tramites.mjs
import { required } from '../lib/env.mjs';
import { loginUser, rawRequest } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';
import { publishTramites } from './seed-tramites.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const P = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const info = (msg) => console.log(`info  ${msg}`);
const get = (client, path) => rawRequest(client, 'GET', `fhir/R4/${path}`);
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
console.log('== Carga (dos veces: idempotente) ==');
const first = await publishTramites(admin);
const second = await publishTramites(admin);
const sameIds = [first.document, first.claim, first.claimResponse, ...first.tasks].every(
  (r, i) => r.id === [second.document, second.claim, second.claimResponse, ...second.tasks][i].id
);
check('cargar dos veces deja los mismos 8 recursos (mismo id)', sameIds);

const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const TRAMITES = `Task?patient=${P}&code=${SYSTEMS.task}|tramite`;

console.log('\n== API-20 · Mis trámites (Carmen) ==');
const ct = await get(carmen, TRAMITES);
const tasks = entries(ct);
check('carmen: Task?patient=<Carmen>&code=urn:portal:tarea|tramite -> 5', ct.status === 200 && tasks.length === 5, `${ct.status}, ${tasks.length}`);
const byKey = Object.fromEntries(tasks.map((t) => [t.identifier[0].value.split('-').pop(), t]));
const expected = {
  receta: ['completed', undefined],
  cita: ['requested', 'Appointment'],
  radiografia: ['in-progress', 'Claim'],
  excusa: ['requested', 'DocumentReference'],
  hemocultivos: ['in-progress', undefined],
};
for (const [key, [status, focusType]] of Object.entries(expected)) {
  const t = byKey[key];
  const focus = t?.focus?.reference?.split('/')[0];
  check(`carmen: trámite "${t?.description}" -> ${status}${focusType ? `, focus ${focusType}` : ''}`, t?.status === status && focus === focusType, `${t?.status}, ${t?.businessStatus?.text}, focus ${t?.focus?.reference ?? '-'}`);
}
check('todos los trámites marcados simulado', tasks.every((t) => t.meta?.tag?.some((x) => x.system === SYSTEMS.origin && x.code === 'simulado')));
const doc = await get(carmen, byKey.excusa.focus.reference);
const text = doc.body?.content?.[0]?.attachment?.data ? Buffer.from(doc.body.content[0].attachment.data, 'base64').toString('utf8') : '';
check('carmen: GET del DocumentReference en focus (excusa) -> 200 con content[0].attachment', doc.status === 200 && /simulado/i.test(text), `${doc.status}, ${text.length} caracteres`);
const appt = await get(carmen, byKey.cita.focus.reference);
check('carmen: GET del Appointment en focus (cita) -> 200', appt.status === 200 && appt.body.status === 'booked', `${appt.status}, ${appt.body?.start}`);

console.log('\n== API-21 · Pre-autorización (Carmen) ==');
const cc = await get(carmen, `Claim?patient=${P}&use=preauthorization`);
const claim = entries(cc)[0];
check('carmen: Claim?patient=<Carmen>&use=preauthorization -> 1 (active, item[0] radiografía)', cc.status === 200 && entries(cc).length === 1 && claim.status === 'active' && /Radiografía/.test(claim.item?.[0]?.productOrService?.text), `${cc.status}, ${entries(cc).length}`);
const cr = await get(carmen, `ClaimResponse?request=Claim/${claim?.id}`);
const resp = entries(cr)[0];
check('carmen: ClaimResponse?request=Claim/<id> -> 1 (outcome queued + disposition)', cr.status === 200 && entries(cr).length === 1 && resp.outcome === 'queued' && !!resp.disposition, `${cr.status}, "${resp?.disposition}"`);
check('Claim y ClaimResponse marcados simulado', [claim, resp].every((r) => r?.meta?.tag?.some((x) => x.code === 'simulado')));
check('el trámite de la radiografía apunta a este Claim', byKey.radiografia.focus.reference === `Claim/${claim?.id}`);

console.log('\n== Confirmar la cita (AppointmentResponse) ==');
const answer = (client) =>
  rawRequest(client, 'POST', 'fhir/R4/AppointmentResponse', {
    resourceType: 'AppointmentResponse',
    appointment: { reference: byKey.cita.focus.reference },
    actor: { reference: P },
    participantStatus: 'accepted',
  });
const created = [];
const ar = await answer(carmen);
created.push(ar);
check('carmen confirma su cita -> 201', ar.status === 201, `${ar.status}`);
const arL = await answer(lourdes);
created.push(arL);
check('lourdes confirma la cita de Carmen -> 403', arL.status === 403, `${arL.status}`);

console.log('\n== Familia ==');
for (const [who, client] of [['lourdes', lourdes]]) {
  const r = await get(client, TRAMITES);
  check(`${who} (con visita) ve los 5 trámites (API-20)`, r.status === 200 && entries(r).length === 5, `${r.status}, ${entries(r).length}`);
  // API-21: family "POR CONFIRMAR"; today no category includes Claim. Expected (contract): empty Bundle.
  for (const path of [`Claim?patient=${P}`, `ClaimResponse?patient=${P}`, `DocumentReference?patient=${P}`]) {
    const s = await get(client, path);
    const type = path.split('?')[0];
    check(`${who} no ve ${type} de Carmen (búsqueda: Bundle vacío o 403)`, (s.status === 200 && entries(s).length === 0) || s.status === 403, `${s.status}${s.status === 200 ? `, ${entries(s).length}` : ''}`);
    info(`${who} GET ${path.split('=')[0]}=<Carmen> -> ${s.status}${s.status === 403 ? ' (tipo fuera de su política; contrato pide 200 vacío, decisión abierta)' : ''}`);
  }
  for (const ref of [`Claim/${claim.id}`, byKey.excusa.focus.reference]) {
    const s = await get(client, ref);
    check(`${who} lee ${ref.split('/')[0]}/<id> -> no lo ve (404 o 403)`, s.status === 404 || s.status === 403, `${s.status}`);
  }
}

for (const r of created) {
  if (r.status === 201) {
    await admin.deleteResource('AppointmentResponse', r.body.id);
  }
}
console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
