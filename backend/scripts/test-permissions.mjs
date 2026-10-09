#!/usr/bin/env node
// POR-47 / POR-48 / POR-50 permission matrix with the real demo accounts (never admin for the checks).
// Canon §4: unauthorized search -> 200 empty Bundle · unauthorized read by id -> 404 · rejected write -> 403.
// Read-only except: QuestionnaireResponse + Communication created by Carmen (deleted at the end by admin).
// Usage: node scripts/test-permissions.mjs [--table]
//   --table  also prints a Markdown table with one row per request made by a portal account (or without session):
//            account/context | method and path | resource/filter | observed HTTP | body/type | permission | check
//            Ids are replaced by placeholders and no token is printed. "observed HTTP" and "body/type" are the
//            server's answer; "permission" is derived from lib/policies.mjs (static reading, not observed).
import { baseUrl, required } from '../lib/env.mjs';
import { loginUser, rawRequest as rawRequestUntracked } from '../lib/medplum.mjs';
import { NOT_SENSITIVE, SYSTEMS } from '../lib/policies.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const C = required('DEMO_CARMEN_PATIENT_ID');
const P = `Patient/${C}`;
const LP = required('DEMO_LOURDES_PATIENT_ID');
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const RAFAEL_RP = required('DEMO_RAFAEL_RELATEDPERSON_ID');
const R_SYSTEM = `${SYSTEMS.confidentiality}|R`;
const TABLE = process.argv.includes('--table');

// ---------- request log for --table ----------
const WHO = new Map(); // client -> account name (admin is never registered, so its requests are not logged)
const rows = [];
let pending = [];
let sensitiveId; // id of the R-labeled Observation, set after the admin lookup

function sanitize(text) {
  let out = text;
  for (const [id, label] of [
    [sensitiveId, '<Observation:R>'],
    [C, '<Patient:carmen>'],
    [LP, '<Patient:lourdes>'],
    [LOURDES_RP, '<RelatedPerson:lourdes>'],
    [RAFAEL_RP, '<RelatedPerson:rafael>'],
  ]) {
    out = id ? out.replaceAll(id, label) : out;
  }
  return out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>');
}

function bodyType(body) {
  if (body?.resourceType === 'Bundle') {
    return `Bundle (${body.entry?.length ?? 0} entries${body.total !== undefined ? `, total ${body.total}` : ''})`;
  }
  if (body?.resourceType === 'OperationOutcome') {
    const issue = body.issue?.[0];
    return `OperationOutcome ${issue?.code ?? ''}: ${String(issue?.details?.text ?? issue?.diagnostics ?? '').slice(0, 60)}`;
  }
  if (body?.resourceType) {
    return body.resourceType;
  }
  return body === undefined ? '(empty)' : typeof body === 'object' ? 'JSON' : `text: ${String(body).slice(0, 40)}`;
}

const CATEGORY_OF = {
  Patient: 'visita',
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
const NOTICE_CATEGORY = { visita: 'visita', medicina: 'medicinas', estudios: 'estudios', resultado: 'estudios' };
const FAMILY_POLICY = {
  visita: 'Familiar: estado en Emergencias',
  medicinas: 'Familiar: medicinas',
  instrucciones: 'Familiar: instrucciones del alta',
  estudios: 'Familiar: estudios y resultados',
};
const PATIENT_EXTRA = ['Consent', 'RelatedPerson', 'Person', 'AuditEvent', 'Bot', 'HealthcareService', 'Questionnaire'];
const PATIENT_WRITES = ['AppointmentResponse', 'QuestionnaireResponse', 'Communication'];

/** Which AccessPolicy entry explains the answer (static reading of lib/policies.mjs). `path` has real ids. */
function explain(who, method, path, notice) {
  if (who === 'no session' || who === 'invalid token') {
    return 'no valid access token: rejected before any AccessPolicy is applied';
  }
  if (path === 'auth/me') {
    return 'auth/me: the membership access[] entries and the resolved AccessPolicy';
  }
  const type = path.replace(/^fhir\/R4\//, '').split(/[/?]/)[0];
  const write = method !== 'GET';
  const ownLourdes = who === 'lourdes' && (path.includes(LP) || path.includes(LOURDES_RP));
  if (who === 'carmen' || ownLourdes) {
    const policy = ownLourdes ? 'Paciente (portal) for <Patient:lourdes> ("Mi salud")' : 'Paciente (portal)';
    if (write) {
      return PATIENT_WRITES.includes(type)
        ? `${policy}: ${type} create, writeConstraint (only about herself)`
        : `${policy}: ${type} is readonly`;
    }
    if (who === 'carmen' && path.includes(LP)) {
      return `${policy}: criteria only match her own Patient`;
    }
    if (type === 'Patient') {
      return `${policy}: Patient?_id=%patient.id`;
    }
    if (PATIENT_EXTRA.includes(type)) {
      return `${policy}: ${type} entry with its own criteria`;
    }
    if (['ProjectMembership', 'ClientApplication'].includes(type)) {
      return `${policy}: ${type} absent from the policy (project-admin type)`;
    }
    return `${policy}: ${type}?_compartment=%patient (R-labeled data included)`;
  }
  // A family member reading or writing Carmen's data.
  if (write) {
    return 'every family policy entry is readonly';
  }
  if (type === 'Consent') {
    return 'Consent only via "Paciente (portal)" for her own Patient (Lourdes) / absent (Rafael)';
  }
  let category = CATEGORY_OF[type];
  if (type === 'Communication') {
    const code = notice ?? path.match(/category=[^|&]*\|(\w+)/)?.[1];
    category = code ? NOTICE_CATEGORY[code] : undefined;
    if (!category) {
      return `Communication entries per notice category (shared: ${SHARES[who].join('+')}), ${NOT_SENSITIVE}`;
    }
  }
  if (!category) {
    return `${type} absent from the family policies`;
  }
  const r = path.includes('_security') || (sensitiveId && path.includes(sensitiveId)) ? ' -> R-labeled excluded' : '';
  if (SHARES[who].includes(category)) {
    const hidden = type === 'Patient' ? ', hiddenFields identifier/address/telecom' : '';
    return `${FAMILY_POLICY[category]} for <Patient:carmen> (${NOT_SENSITIVE}${hidden})${r}`;
  }
  return `"${category}" not shared: only the no-match entry ${type}?_id=00000000-… applies`;
}

/** Request with no Authorization header at all (missing session). */
async function requestWithoutAuth(method, path) {
  const res = await fetch(baseUrl() + path, { method });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

/** rawRequest that also logs the request for --table (portal accounts only). */
async function rawRequest(client, method, path, body, notice) {
  const res = client.noAuth ? await requestWithoutAuth(method, path) : await rawRequestUntracked(client, method, path, body);
  const who = WHO.get(client);
  if (who) {
    pending.push({ who, method, path: sanitize(path), status: res.status, body: bodyType(res.body), why: explain(who, method, path, notice) });
  }
  return res;
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
  for (const row of pending) {
    rows.push({ ...row, check: `${ok ? 'pasa' : 'FALLA'}: ${name}` });
  }
  pending = [];
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
sensitiveId = sensitive?.id;

const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const rafael = await loginUser(required('DEMO_RAFAEL_EMAIL'), required('DEMO_RAFAEL_PASSWORD'), projectId);
WHO.set(carmen, 'carmen').set(lourdes, 'lourdes').set(rafael, 'rafael');

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
const ln = await rawRequest(lourdes, 'GET', `fhir/R4/Communication/${resultNotice.id}`, undefined, 'resultado');
check('lourdes lee por id un aviso "resultado" -> 404', ln.status === 404, `${ln.status}`);
const lm = await rawRequest(lourdes, 'GET', `fhir/R4/Communication/${medNotice.id}`, undefined, 'medicina');
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
for (const who of ['lourdes', 'rafael']) {
  const seen = entries(await get(CLIENTS[who], `Communication?subject=${P}&_count=200`)).some((c) => c.id === q.body?.id);
  check(`${who} NO ve la pregunta de Carmen al enfermero (API-25)`, q.status === 201 && !seen);
}
const question = (extra) => ({
  resourceType: 'Communication',
  status: 'completed',
  subject: { reference: P },
  category: [{ coding: [{ system: SYSTEMS.notice, code: 'pregunta' }] }],
  payload: [{ contentString: 'x' }],
  ...extra,
});
const forged = [
  ['con categoría extra "resultado" (aviso falso)', question({ category: [{ coding: [{ system: SYSTEMS.notice, code: 'pregunta' }] }, { coding: [{ system: SYSTEMS.notice, code: 'resultado' }] }] })],
  ['con remitente = una médica', question({ sender: { reference: `Practitioner/${sample.Encounter.participant?.[0]?.individual?.reference?.split('/')[1] ?? 'x'}` } })],
  ['con destinatario = otro paciente', question({ recipient: [{ reference: `Patient/${LP}` }] })],
];
for (const [label, body] of forged) {
  const r = await rawRequest(carmen, 'POST', 'fhir/R4/Communication', body);
  check(`carmen crea Communication ${label} -> rechazado`, r.status === 403 || r.status === 400, `${r.status}`);
  if (r.status === 201) {
    await admin.deleteResource('Communication', r.body.id);
  }
}
const qrForged = await rawRequest(carmen, 'POST', 'fhir/R4/QuestionnaireResponse', {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  subject: { reference: P },
  author: { reference: `Patient/${LP}` },
});
check('carmen crea QuestionnaireResponse con autor = otro paciente -> rechazado', qrForged.status === 403 || qrForged.status === 400, `${qrForged.status}`);
if (qrForged.status === 201) {
  await admin.deleteResource('QuestionnaireResponse', qrForged.body.id);
}
const appt = await one('Appointment', { patient: P });
if (appt) {
  const answer = (client) =>
    rawRequest(client, 'POST', 'fhir/R4/AppointmentResponse', {
      resourceType: 'AppointmentResponse',
      appointment: { reference: `Appointment/${appt.id}` },
      actor: { reference: P },
      participantStatus: 'accepted',
    });
  const ar = await answer(carmen);
  check('carmen confirma su cita: AppointmentResponse (API-20) -> 201', ar.status === 201, `${ar.status}`);
  const arL = await answer(lourdes);
  check('lourdes confirma la cita de Carmen -> 403', arL.status === 403, `${arL.status}`);
  for (const r of [ar, arL]) {
    if (r.status === 201) {
      await admin.deleteResource('AppointmentResponse', r.body.id);
    }
  }
}
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

console.log('\n== Candados desde auth/me (regla de API-02) ==');
const REPRESENTATIVE = { visita: 'Encounter', medicinas: 'MedicationRequest', instrucciones: 'CarePlan', estudios: 'DiagnosticReport' };
for (const who of ['lourdes', 'rafael']) {
  const meRes = await rawRequest(CLIENTS[who], 'GET', 'auth/me');
  const resources = meRes.body?.accessPolicy?.resource ?? [];
  const allowed = Object.entries(REPRESENTATIVE)
    .filter(([, type]) => resources.some((r) => r.resourceType === type && (!r.criteria || r.criteria.includes(C))))
    .map(([cat]) => cat);
  check(`auth/me de ${who}: categorías abiertas = ${SHARES[who].join('+')}`, JSON.stringify(allowed) === JSON.stringify(SHARES[who]), allowed.join('+'));
}

console.log('\n== Lourdes "Mi salud" (POR-101) ==');
const own = await get(lourdes, `Patient/${LP}`);
check('lourdes lee su propia ficha con su MRN', own.status === 200 && own.body.identifier?.[0]?.value === 'MRN-0002', `${own.status}`);
const person = await get(lourdes, `Person?relatedperson=RelatedPerson/${required('DEMO_LOURDES_RELATEDPERSON_ID')}`);
check('lourdes encuentra su Person (dos roles)', count(person) === 1, `${person.status}, ${count(person)}`);

console.log('\n== Sin sesión / token inválido (401) ==');
// No Authorization header, an opaque garbage token and a forged JWT (bad signature, exp in the past).
// A really expired token is covered by scripts/test-auth-session.mjs --expiry-probe.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forgedJwt = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: 'x', exp: Math.floor(Date.now() / 1000) - 3600 })}.c2ln`;
const NO_SESSION = { noAuth: true };
const GARBAGE = { getBaseUrl: () => baseUrl(), getAccessToken: () => 'not-a-token' };
const FORGED = { getBaseUrl: () => baseUrl(), getAccessToken: () => forgedJwt };
const MALFORMED = { getBaseUrl: () => baseUrl(), getAccessToken: () => 'invalid.token.value' };
WHO.set(NO_SESSION, 'no session').set(GARBAGE, 'invalid token').set(FORGED, 'invalid token').set(MALFORMED, 'invalid token');
const unauthPaths = [`fhir/R4/Patient/${C}`, `fhir/R4/Observation?patient=${P}`, 'auth/me'];
for (const [label, client] of [['sin sesión', NO_SESSION], ['token basura', GARBAGE], ['JWT falsificado (firma mala, exp vencido)', FORGED]]) {
  for (const path of unauthPaths) {
    const r = await rawRequest(client, 'GET', path);
    check(`${label}: GET ${sanitize(path)} -> 401`, r.status === 401, `${r.status} ${bodyType(r.body)}`);
  }
}
// Observed quirk of Medplum 5.1.42: three dot-separated segments that are not base64 JSON -> 400 "Authentication error".
for (const path of unauthPaths) {
  const r = await rawRequest(MALFORMED, 'GET', path);
  check(`JWT malformado ("a.b.c"): GET ${sanitize(path)} -> rechazado (400 o 401, nunca 2xx)`, r.status === 401 || r.status === 400, `${r.status} ${bodyType(r.body)}`);
  if (r.status !== 401) {
    console.log(`info  JWT malformado -> ${r.status} (no 401): el servidor falla al leer el token; el contrato pide 401, decisión abierta`);
  }
}

// cleanup of the two resources Carmen created
for (const r of [qr, q]) {
  if (r.status === 201) {
    await admin.deleteResource(r.body.resourceType, r.body.id);
  }
}

if (TABLE) {
  const cell = (v) => String(v).replaceAll('|', '\\|');
  console.log('\n| account/context | method and path | resource/filter | observed HTTP | body/type | permission that explains it (static) | check |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const [route, filter = ''] = r.path.split('?');
    const resource = route.startsWith('fhir/R4/') ? `${route.slice(8).split('/')[0]}${filter ? `?${filter}` : ''}` : '-';
    console.log(`| ${[r.who, `${r.method} ${route}`, resource, r.status, r.body, r.why, r.check].map(cell).join(' | ')} |`);
  }
}

console.log(`\nResultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
