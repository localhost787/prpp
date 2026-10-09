#!/usr/bin/env node
// POR-47 / POR-48 / POR-50 permission matrix with the real demo accounts (never admin for the checks).
// Canon §4: unauthorized search -> 200 empty Bundle · unauthorized read by id -> 404 · rejected write -> 403.
// Read-only except: QuestionnaireResponse + Communication created by Carmen (deleted at the end by admin).
// Usage: node scripts/test-permissions.mjs
import { required } from '../lib/env.mjs';
import { loginUser, rawRequest } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const C = required('DEMO_CARMEN_PATIENT_ID');
const P = `Patient/${C}`;
const LP = required('DEMO_LOURDES_PATIENT_ID');
const R_SYSTEM = `${SYSTEMS.confidentiality}|R`;

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}

const get = (client, path) => rawRequest(client, 'GET', `fhir/R4/${path}`);
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);
const count = (r) => entries(r).length;

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const one = async (type, params) => (await admin.searchResources(type, { ...params, _count: '1' }, { cache: 'no-cache' }))[0];
const sample = {
  Encounter: await one('Encounter', { patient: P }),
  Task: await one('Task', { patient: P }),
  MedicationAdministration: await one('MedicationAdministration', { patient: P }),
  ServiceRequest: await one('ServiceRequest', { patient: P }),
  Specimen: await one('Specimen', { patient: P }),
  DiagnosticReport: await one('DiagnosticReport', { patient: P }),
  Observation: await one('Observation', { patient: P, code: '6690-2' }),
};
const sensitive = await one('Observation', { patient: P, _security: R_SYSTEM });
const resultNotice = await one('Communication', { subject: P, category: `${SYSTEMS.notice}|resultado` });
const medNotice = await one('Communication', { subject: P, category: `${SYSTEMS.notice}|medicina` });

const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const rafael = await loginUser(required('DEMO_RAFAEL_EMAIL'), required('DEMO_RAFAEL_PASSWORD'), projectId);

// Category of each type, and who has it (approved seed: Lourdes v+m+i, Rafael all 4).
const TYPES = {
  Encounter: 'visita',
  Task: 'visita',
  MedicationAdministration: 'medicinas',
  MedicationRequest: 'medicinas',
  CarePlan: 'instrucciones',
  Appointment: 'instrucciones',
  ServiceRequest: 'estudios',
  Specimen: 'estudios',
  DiagnosticReport: 'estudios',
  Observation: 'estudios',
};
const SHARES = {
  carmen: ['visita', 'medicinas', 'instrucciones', 'estudios'],
  lourdes: ['visita', 'medicinas', 'instrucciones'],
  rafael: ['visita', 'medicinas', 'instrucciones', 'estudios'],
};
const CLIENTS = { carmen, lourdes, rafael };

console.log('\n== Búsquedas y lecturas por id (canon §4) ==');
for (const [who, client] of Object.entries(CLIENTS)) {
  for (const [type, category] of Object.entries(TYPES)) {
    const allowed = SHARES[who].includes(category);
    const r = await get(client, `${type}?patient=${P}`);
    const hasData = !!sample[type];
    if (allowed) {
      check(`${who} busca ${type}`, r.status === 200 && (!hasData || count(r) > 0), `${r.status}, ${count(r)} resultados`);
    } else {
      check(`${who} busca ${type} (no compartido) -> Bundle vacío`, r.status === 200 && count(r) === 0, `${r.status}, ${count(r)}`);
    }
    if (sample[type]) {
      const byId = await get(client, `${type}/${sample[type].id}`);
      check(`${who} lee ${type}/<id> -> ${allowed ? 200 : 404}`, byId.status === (allowed ? 200 : 404), `${byId.status}`);
    }
  }
}

console.log('\n== Avisos (Communication) filtrados por categoría ==');
for (const [who, client] of Object.entries(CLIENTS)) {
  const r = await get(client, `Communication?subject=${P}&_count=100`);
  const cats = new Set(entries(r).flatMap((c) => c.category.map((x) => x.coding[0].code)));
  const sees = (c) => cats.has(c);
  check(`${who} ve avisos de la visita`, sees('visita'), [...cats].join(','));
  check(`${who} avisos "medicina" ${SHARES[who].includes('medicinas') ? 'sí' : 'no'}`, sees('medicina') === SHARES[who].includes('medicinas'));
  const est = SHARES[who].includes('estudios');
  check(`${who} avisos "resultado"/"estudios" ${est ? 'sí' : 'no'}`, sees('resultado') === est && sees('estudios') === est);
  check(`${who} ve el aviso neutral "Hay un resultado nuevo (privado)"`, sees('neutral-familia'));
}
const ln = await get(lourdes, `Communication/${resultNotice.id}`);
check('lourdes lee por id un aviso "resultado" -> 404', ln.status === 404, `${ln.status}`);
const lm = await get(lourdes, `Communication/${medNotice.id}`);
check('lourdes lee por id un aviso "medicina" (compartido) -> 200', lm.status === 200, `${lm.status}`);

console.log('\n== Ficha de Carmen vista por la familia (campos ocultos) ==');
for (const who of ['lourdes', 'rafael']) {
  const r = await get(CLIENTS[who], `Patient/${C}`);
  check(
    `${who} lee Patient de Carmen sin identifier/address/telecom`,
    r.status === 200 && !r.body.identifier && !r.body.address && !r.body.telecom,
    `${r.status}, keys: ${Object.keys(r.body ?? {}).join(',')}`
  );
}
const cp = await get(carmen, `Patient/${C}`);
check('carmen ve su propio MRN', cp.body?.identifier?.[0]?.value === 'MRN-0001');

console.log('\n== Lo sensible (POR-50, etiqueta R) ==');
for (const [who, client] of Object.entries(CLIENTS)) {
  const r = await get(client, `Observation?patient=${P}&_count=100`);
  const included = entries(r).some((o) => o.id === sensitive.id);
  const byId = await get(client, `Observation/${sensitive.id}`);
  if (who === 'carmen') {
    check('carmen SÍ ve su dato sensible (búsqueda y por id)', included && byId.status === 200, `${byId.status}`);
  } else {
    check(`${who} NO ve el dato sensible (búsqueda)`, !included);
    check(`${who} lee el dato sensible por id -> 404`, byId.status === 404, `${byId.status}`);
  }
}
const rafCount = await get(rafael, `Observation?patient=${P}&_summary=count`);
const carCount = await get(carmen, `Observation?patient=${P}&_summary=count`);
check('conteo de Rafael = conteo de Carmen − 1 (el R no se cuenta)', rafCount.body?.total === carCount.body?.total - 1, `rafael ${rafCount.body?.total}, carmen ${carCount.body?.total}`);
const lourCount = await get(lourdes, `Observation?patient=${P}&_summary=count`);
check('conteo de Lourdes (sin estudios) = 0', lourCount.body?.total === 0, `${lourCount.body?.total}`);
const rev = await get(rafael, `Patient?_id=${C}&_revinclude=Observation:subject&_count=200`);
check('Rafael: Patient + _revinclude=Observation no trae el dato R', !entries(rev).some((o) => o.id === sensitive.id), `${count(rev)} entradas`);
const revL = await get(lourdes, `Encounter?patient=${P}&_revinclude=Observation:encounter&_revinclude=DiagnosticReport:encounter`);
const leaked = entries(revL).filter((x) => x.resourceType !== 'Encounter');
check('Lourdes: Encounter + _revinclude de Observation/DiagnosticReport no trae estudios', revL.status === 200 && leaked.length === 0, `${revL.status}, ${leaked.length} extra`);
const incL = await get(lourdes, `DiagnosticReport?patient=${P}&_include=DiagnosticReport:result`);
check('Lourdes: DiagnosticReport + _include=result -> vacío', incL.status === 200 && count(incL) === 0, `${incL.status}, ${count(incL)}`);
const taskText = JSON.stringify((await get(lourdes, `Task?patient=${P}`)).body);
check('Lourdes: la Task de etapa no menciona el dato sensible', !taskText.includes('confidencial'));

console.log('\n== Escrituras (403) ==');
const w1 = await rawRequest(lourdes, 'POST', 'fhir/R4/Communication', {
  resourceType: 'Communication',
  status: 'completed',
  subject: { reference: P },
});
check('lourdes crea Communication de Carmen -> 403', w1.status === 403, `${w1.status}`);
const w2 = await rawRequest(carmen, 'POST', 'fhir/R4/Observation', {
  resourceType: 'Observation',
  status: 'final',
  code: { text: 'x' },
  subject: { reference: P },
});
check('carmen crea Observation -> 403 (solo lectura)', w2.status === 403, `${w2.status}`);
const w3 = await rawRequest(carmen, 'POST', 'fhir/R4/Communication', {
  resourceType: 'Communication',
  status: 'completed',
  subject: { reference: `Patient/${LP}` },
  category: [{ coding: [{ system: SYSTEMS.notice, code: 'pregunta' }] }],
});
check('carmen crea Communication de OTRO paciente -> 403', w3.status === 403, `${w3.status}`);
const w4 = await rawRequest(rafael, 'PUT', `fhir/R4/Encounter/${sample.Encounter.id}`, { ...sample.Encounter, status: 'cancelled' });
check('rafael modifica la visita -> 403', w4.status === 403, `${w4.status}`);

console.log('\n== Paciente (POR-47) ==');
const other1 = await get(carmen, `Patient?_id=${LP}`);
check('carmen busca a otro paciente (Lourdes) -> Bundle vacío', other1.status === 200 && count(other1) === 0, `${other1.status}, ${count(other1)}`);
const other2 = await get(carmen, `Patient/${LP}`);
check('carmen lee a otro paciente por id -> 404', other2.status === 404, `${other2.status}`);
const me = await rawRequest(carmen, 'GET', 'auth/me');
const policyText = JSON.stringify(me.body?.accessPolicy ?? {});
check('auth/me de Carmen trae la política con su id real (sin %patient)', policyText.includes(C) && !policyText.includes('%patient'));
const qr = await rawRequest(carmen, 'POST', 'fhir/R4/QuestionnaireResponse', {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  subject: { reference: P },
});
check('carmen crea QuestionnaireResponse (API-22) -> 201', qr.status === 201, `${qr.status}`);
const q = await rawRequest(carmen, 'POST', 'fhir/R4/Communication', {
  resourceType: 'Communication',
  status: 'completed',
  subject: { reference: P },
  sender: { reference: P },
  category: [{ coding: [{ system: SYSTEMS.notice, code: 'pregunta' }] }],
  payload: [{ contentString: 'Prueba automática de permisos (se borra).' }],
});
check('carmen crea Communication "pregunta" (API-25) -> 201', q.status === 201, `${q.status}`);
for (const path of [`Consent?patient=${P}`, `RelatedPerson?patient=${P}`, `AuditEvent?entity=${P}`, 'HealthcareService', 'Condition?patient=' + P, 'AllergyIntolerance?patient=' + P, 'Immunization?patient=' + P]) {
  const r = await get(carmen, path);
  check(`carmen lee ${path.split('?')[0]} -> 200`, r.status === 200, `${r.status}, ${count(r)}`);
}
const hl7 = await get(carmen, 'Bot?name=hl7-a-fhir');
check('carmen busca Bot hl7-a-fhir -> Bundle vacío', hl7.status === 200 && count(hl7) === 0, `${hl7.status}, ${count(hl7)}`);
const share = await get(carmen, 'Bot?name=compartir-familia');
check('carmen encuentra el Bot compartir-familia', count(share) === 1);
const pm = await get(carmen, 'ProjectMembership');
check('carmen no lee ProjectMembership', pm.status === 403 || count(pm) === 0, `${pm.status}`);
const ca = await get(carmen, 'ClientApplication');
check('carmen no lee ClientApplication', ca.status === 403 || count(ca) === 0, `${ca.status}`);
const lc = await get(lourdes, `Consent?patient=${P}`);
check('lourdes busca los Consent de Carmen -> Bundle vacío', lc.status === 200 && count(lc) === 0, `${lc.status}, ${count(lc)}`);

console.log('\n== Lourdes "Mi salud" (POR-101) ==');
const own = await get(lourdes, `Patient/${LP}`);
check('lourdes lee su propia ficha con su MRN', own.status === 200 && own.body.identifier?.[0]?.value === 'MRN-0002', `${own.status}`);
const person = await get(lourdes, `Person?relatedperson=RelatedPerson/${required('DEMO_LOURDES_RELATEDPERSON_ID')}`);
check('lourdes encuentra su Person (dos roles)', count(person) === 1, `${person.status}, ${count(person)}`);

// cleanup of the two resources Carmen created
for (const r of [qr, q]) {
  if (r.status === 201) {
    await admin.deleteResource(r.body.resourceType, r.body.id);
  }
}

console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
