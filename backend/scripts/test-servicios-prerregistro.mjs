#!/usr/bin/env node
// POR-56 (API-23) and POR-55 (API-22) live, with the real demo accounts (never admin for the checks).
// Needs scripts/seed-dia2.mjs first. Creates QuestionnaireResponses as Carmen; the Bot pre-registro
// turns them into a planned visit + Coverage. Everything it created is deleted at the end, so the
// portal's "current visit" is never left pointing at a test visit.
// Usage: node scripts/test-servicios-prerregistro.mjs
import { required } from '../lib/env.mjs';
import { log, loginUser, rawRequest } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const P = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
const URL_PREREG = 'https://prpp.example/fhir/Questionnaire/pre-registro';
const opts = { cache: 'no-cache' };
let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const info = (msg) => console.log(`info  ${msg}`);
const get = (client, path) => rawRequest(client, 'GET', `fhir/R4/${path}`);
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);

console.log('== API-23 · Servicios cerca de usted ==');
const sr = await get(carmen, 'HealthcareService?active=true&_include=HealthcareService:location');
const svcs = entries(sr).filter((r) => r.resourceType === 'HealthcareService');
const locs = entries(sr).filter((r) => r.resourceType === 'Location');
check('carmen: HealthcareService?active=true&_include=HealthcareService:location -> 4 servicios', sr.status === 200 && svcs.length === 4, `${sr.status}, ${svcs.map((s) => s.name).join(' | ')}`);
const located = svcs.filter((s) => s.location?.length);
check('  sus Location vienen en el mismo Bundle', located.every((s) => locs.some((l) => `Location/${l.id}` === s.location[0].reference)), `${locs.length} Location incluidas para ${located.length} servicios con lugar`);
check('  cada uno con type[0].text', svcs.every((s) => !!s.type?.[0]?.text), svcs.map((s) => s.type?.[0]?.text).join(', '));
check('  cada uno con characteristic "Acepta su plan"', svcs.every((s) => s.characteristic?.some((c) => c.text === 'Acepta su plan')));
check('  cada uno con extraDetails (distancia y espera simulada)', svcs.every((s) => /\(simulada\)/.test(s.extraDetails ?? '')), svcs.map((s) => s.extraDetails).join(' | '));
check('  marcados simulado', svcs.every((s) => s.meta?.tag?.some((t) => t.code === 'simulado')));
{
  const r = await get(lourdes, 'HealthcareService?active=true');
  info(`lourdes HealthcareService?active=true -> ${r.status}${r.status === 200 ? `, ${entries(r).length}` : ''} (contrato: solo la paciente)`);
}

console.log('\n== API-22 · Pre-registro ==');
const qr = await get(carmen, 'Questionnaire?name=pre-registro');
const q = entries(qr)[0];
const sections = (q?.item ?? []).filter((i) => i.type === 'group').map((i) => i.text);
check('carmen: Questionnaire?name=pre-registro -> 1 con 5 secciones', qr.status === 200 && entries(qr).length === 1 && sections.length === 5, sections.join(' · '));

const stageBefore = await admin.searchOne('Task', { identifier: `${SYSTEMS.stageTask}|V-0001` }, opts);
const plannedBefore = await admin.searchResources('Encounter', { patient: P, status: 'planned' }, opts);
const coverageBefore = await admin.searchResources('Coverage', { patient: P }, opts);
if (plannedBefore.length) {
  info(`ya había ${plannedBefore.length} visita(s) planned de Carmen antes de la prueba: no se borran`);
}
const answer = (subject = P, motivo = 'Fiebre y tos desde hace 3 días (prueba automática, se borra)') => ({
  resourceType: 'QuestionnaireResponse',
  questionnaire: URL_PREREG,
  status: 'completed',
  subject: { reference: subject },
  authored: new Date().toISOString(),
  item: [
    { linkId: 'datos', item: [{ linkId: 'datos-nombre', answer: [{ valueString: 'Carmen Rivera Colón' }] }] },
    { linkId: 'plan', item: [{ linkId: 'plan-nombre', answer: [{ valueString: 'Plan médico Demo' }] }, { linkId: 'plan-numero', answer: [{ valueString: 'SOCIO-0001' }] }] },
    { linkId: 'motivo', item: [{ linkId: 'motivo-texto', answer: [{ valueString: motivo }] }] },
  ],
});
const createdQr = [];
async function waitPlanned(n, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const r = await get(carmen, `Encounter?patient=${P}&status=planned`);
    if (entries(r).length >= n || Date.now() - t0 > ms) {
      return { list: entries(r), ms: Date.now() - t0 };
    }
    await sleep(500);
  }
}
try {
  const t0 = Date.now();
  const c1 = await rawRequest(carmen, 'POST', 'fhir/R4/QuestionnaireResponse', answer());
  createdQr.push(c1);
  check('carmen envía el pre-registro (QuestionnaireResponse) -> 201', c1.status === 201, `${c1.status}`);
  const w1 = await waitPlanned(plannedBefore.length + 1);
  const mine = w1.list.filter((e) => !plannedBefore.some((b) => b.id === e.id));
  check('carmen: Encounter?patient=<Carmen>&status=planned -> 1 (lo crea el Bot pre-registro)', mine.length === 1, `${mine.length}, ${Date.now() - t0} ms`);
  check('  la visita planned es EMER y lleva el motivo', mine[0]?.class?.code === 'EMER' && /Fiebre/.test(mine[0]?.reasonCode?.[0]?.text ?? ''), `${mine[0]?.class?.code}`);
  const cov = entries(await get(carmen, `Coverage?patient=${P}`));
  check('carmen: su Coverage del plan del formulario', cov.some((c) => c.payor?.[0]?.display === 'Plan médico Demo'), `${cov.length}`);

  const c2 = await rawRequest(carmen, 'POST', 'fhir/R4/QuestionnaireResponse', answer(P, 'Fiebre y tos (segundo envío, prueba automática)'));
  createdQr.push(c2);
  await sleep(4000);
  const w2 = await waitPlanned(99, 1000);
  const mine2 = w2.list.filter((e) => !plannedBefore.some((b) => b.id === e.id));
  check('enviar el pre-registro dos veces deja UNA visita planned (la misma, actualizada)', c2.status === 201 && mine2.length === 1 && mine2[0].id === mine[0]?.id && /segundo/.test(mine2[0].reasonCode?.[0]?.text ?? ''), `${mine2.length}, "${mine2[0]?.reasonCode?.[0]?.text}"`);

  const lr = await rawRequest(lourdes, 'POST', 'fhir/R4/QuestionnaireResponse', answer());
  createdQr.push(lr);
  check('lourdes envía un pre-registro para Carmen -> 403', lr.status === 403, `${lr.status}`);
  const lv = await get(lourdes, `Encounter?patient=${P}&status=planned`);
  info(`lourdes (visita) Encounter?patient=<Carmen>&status=planned -> ${lv.status}, ${entries(lv).length} (la política de visita deja ver Encounter)`);
  const lq = await get(lourdes, `QuestionnaireResponse?subject=${P}`);
  check('lourdes no ve las respuestas del formulario de Carmen', (lq.status === 200 && entries(lq).length === 0) || lq.status === 403, `${lq.status}`);

  const stageAfter = await admin.searchOne('Task', { identifier: `${SYSTEMS.stageTask}|V-0001` }, opts);
  check('EMTALA: el pre-registro no toca la Task de etapa (misma versión)', stageBefore?.meta?.versionId === stageAfter?.meta?.versionId, stageBefore ? 'misma versión' : 'no hay Task de etapa');
  info('A04 que reutiliza la visita planned: probado con MockClient (test/prerregistro.test.mjs); en vivo hace falta desplegar hl7-a-fhir con este cambio');
} finally {
  console.log('\n== Limpieza ==');
  const doomed = [];
  for (const r of createdQr) {
    if (r.status === 201) {
      doomed.push(['QuestionnaireResponse', r.body.id]);
    }
  }
  for (const e of await admin.searchResources('Encounter', { patient: P, status: 'planned' }, opts)) {
    if (!plannedBefore.some((b) => b.id === e.id)) {
      doomed.push(['Encounter', e.id]);
    }
  }
  for (const c of await admin.searchResources('Coverage', { patient: P }, opts)) {
    if (!coverageBefore.some((b) => b.id === c.id)) {
      doomed.push(['Coverage', c.id]);
    }
  }
  for (const [type, id] of doomed) {
    await admin.deleteResource(type, id);
  }
  log('ok', `borrados: ${doomed.map(([t]) => t).join(', ') || 'nada'}`);
}
console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
