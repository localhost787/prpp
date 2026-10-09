#!/usr/bin/env node
// POR-52 (API-24) with the real demo accounts.
// 1. Real source? Lourdes reads Carmen's visit; then (as admin) look for AuditEvents of reads created since.
// 2. Simulated list: seed twice (idempotent), then Carmen's search and Lourdes'.
// Read-only except the 2 simulated AuditEvents (kept: they are the list the screen shows).
// Usage: node scripts/test-auditoria.mjs
import { required } from '../lib/env.mjs';
import { loginUser, rawRequest } from '../lib/medplum.mjs';
import { seedAudit } from './seed-auditoria.mjs';

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
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);

console.log('== ¿Medplum guarda AuditEvent de lecturas en este servidor? ==');
const since = new Date(Date.now() - 1000).toISOString();
const visits = entries(await get(lourdes, `Encounter?patient=${P}`));
if (visits[0]) {
  await get(lourdes, `Encounter/${visits[0].id}`);
}
await get(lourdes, `Patient/${P.split('/')[1]}`);
await new Promise((r) => setTimeout(r, 4000));
const recent = await admin.searchResources('AuditEvent', { _lastUpdated: `gt${since}`, _count: '100' }, { cache: 'no-cache' });
const reads = recent.filter((e) => e.subtype?.some((s) => s.code === 'read' || s.code === 'search-type') || e.action === 'R');
check('Lourdes leyó la visita y la ficha de Carmen (3 lecturas)', visits.length > 0, `${visits.length} visita(s)`);
info(`AuditEvent creados desde entonces: ${recent.length} (de lectura: ${reads.length})`);
const realSource = reads.length > 0;
console.log(`info  fuente de "¿Quién vio mi récord?": ${realSource ? 'REAL' : 'SIMULADA (el servidor no guarda AuditEvent de lecturas: saveAuditEvents apagado)'}`);
const kinds = new Set((await admin.searchResources('AuditEvent', { _count: '200' }, { cache: 'no-cache' })).map((e) => e.type?.code));
info(`tipos de AuditEvent guardados en el proyecto: ${[...kinds].join(', ')}`);

console.log('\n== Lista simulada (carga dos veces) ==');
const a = await seedAudit(admin);
const b = await seedAudit(admin);
check('cargar dos veces no duplica (mismos 2 ids)', a.length === 2 && a.every((x, i) => x.id === b[i].id));

console.log('\n== Como Carmen: AuditEvent?entity=<P>&_sort=-date&_count=20 ==');
const cr = await get(carmen, `AuditEvent?entity=${P}&_sort=-date&_count=20`);
const list = entries(cr);
const sim = list.filter((e) => e.meta?.tag?.some((t) => t.code === 'simulado'));
check('carmen ve las 2 entradas simuladas', cr.status === 200 && sim.length === 2, `${cr.status}, ${list.length} entradas`);
for (const e of sim) {
  console.log(`      ${e.recorded} · ${e.agent?.[0]?.who?.display} vio "${e.entity?.[0]?.what?.display}" · simulado`);
}
check('  cada una con agent[0].who (quién), entity[0].what (qué), recorded (cuándo), action R', sim.every((e) => e.agent?.[0]?.who?.reference && e.entity?.[0]?.what?.display && e.recorded && e.action === 'R'));
check('  ordenadas de la más nueva a la más vieja', sim.length < 2 || sim[0].recorded >= sim[1].recorded, sim.map((e) => e.recorded.slice(11, 16)).join(' > '));
const pr = await get(carmen, `AuditEvent?patient=${P}&_sort=-date&_count=20`);
info(`parámetro alterno AuditEvent?patient=<P> -> ${pr.status}, ${entries(pr).length} entradas`);
const w = await rawRequest(carmen, 'POST', 'fhir/R4/AuditEvent', { ...sim[0], id: undefined, meta: undefined });
check('carmen NO puede crear AuditEvent -> 403', w.status === 403, `${w.status}`);
if (w.status === 201) {
  await admin.deleteResource('AuditEvent', w.body.id);
}

console.log('\n== Familia (solo la paciente ve su auditoría) ==');
const lr = await get(lourdes, `AuditEvent?entity=${P}&_sort=-date&_count=20`);
check('lourdes: la misma búsqueda -> Bundle vacío', lr.status === 200 && entries(lr).length === 0, `${lr.status}, ${entries(lr).length}`);
const lid = await get(lourdes, `AuditEvent/${sim[0]?.id}`);
check('lourdes lee una entrada por id -> no la ve (404 o 403)', lid.status === 404 || lid.status === 403, `${lid.status}`);

console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
