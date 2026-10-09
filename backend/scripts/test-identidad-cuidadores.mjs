#!/usr/bin/env node
// POR-98 (identity and login), POR-99 (the caregiver sees only what the patient shares) and
// POR-101 (one account, two roles), with the real demo accounts. Changes what Carmen shares during the
// test and ALWAYS restores the approved seed at the end (Lourdes: visita + medicinas + instrucciones).
// Usage: node scripts/test-identidad-cuidadores.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, required } from '../lib/env.mjs';
import { loginUser, newClient, rawRequest } from '../lib/medplum.mjs';
import { CATEGORIES, SYSTEMS } from '../lib/policies.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const C = required('DEMO_CARMEN_PATIENT_ID');
const P = `Patient/${C}`;
const LP = required('DEMO_LOURDES_PATIENT_ID');
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const SEED = ['visita', 'medicinas', 'instrucciones'];
const MRN = (value) => `${SYSTEMS.mrn}|${value}`;

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);
const get = (client, path) => rawRequest(client, 'GET', `fhir/R4/${path}`);
const count = async (client, path) => {
  const r = await get(client, path);
  return r.status === 200 ? entries(r).length : -r.status;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- POR-98 (sin red): repo sin seguro social ni contraseñas ----------
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim();
const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
const thisFile = fileURLToPath(import.meta.url);
// Built from pieces so this file does not match itself.
const ssnPattern = new RegExp(['seguro' + ' social', '\\bs' + 'sn\\b', 'social' + ' security'].join('|'), 'i');
// The fictional demo passwords (DEMO_*_PASSWORD) are public by decision and listed in the root README,
// so they are skipped here, same rule as check-secrets.sh.
const secrets = Object.entries(env)
  .filter(([k, v]) => /PASSWORD|SECRET/.test(k) && !/^DEMO_[A-Z]+_PASSWORD$/.test(k) && v && v.length >= 8)
  .map(([, v]) => v);
const ssnHits = [];
const secretHits = [];
for (const file of tracked) {
  const full = join(repoRoot, file);
  if (full === thisFile || /package-lock\.json$|\.(png|jpe?g|gif|ico|pdf|woff2?)$/i.test(file)) {
    continue;
  }
  let text;
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  if (ssnPattern.test(text)) {
    ssnHits.push(file);
  }
  if (secrets.some((s) => text.includes(s))) {
    secretHits.push(file);
  }
}

console.log('== POR-98 · identidad y login ==');
check('ningún archivo del repo menciona seguro social / SSN', ssnHits.length === 0, ssnHits.join(', '));
check(`los secretos (no las contraseñas demo públicas) no están en el repo (${tracked.length} archivos)`, secretHits.length === 0, secretHits.join(', '));

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);

const bot = (await carmen.searchResources('Bot', { name: 'compartir-familia' }))[0];
const execute = (client, input) => rawRequest(client, 'POST', `fhir/R4/Bot/${bot.id}/$execute`, input, 'application/json');
const membershipOf = (rp) => admin.searchOne('ProjectMembership', { profile: `RelatedPerson/${rp}` }, { cache: 'no-cache' });
const carmenPolicies = (m) =>
  (m.access ?? [])
    .filter((a) => a.parameter?.some((p) => p.valueReference?.reference === P))
    .map((a) => a.policy.display)
    .join(' + ');

try {
  const carmenRecord = await admin.readResource('Patient', C);
  check(
    'Carmen tiene MRN-0001 en su ficha (como admin)',
    carmenRecord.identifier?.some((i) => i.system === SYSTEMS.mrn && i.value === 'MRN-0001'),
    JSON.stringify(carmenRecord.identifier?.map((i) => i.value))
  );
  check('Patient?identifier=MRN-0001 -> una sola ficha', (await admin.searchResources('Patient', { identifier: MRN('MRN-0001') })).length === 1);

  const method = await rawRequest(newClient(), 'POST', 'auth/method', { email: required('DEMO_CARMEN_EMAIL') }, 'application/json');
  check('paso 1 del login: POST auth/method con el email -> 200', method.status === 200, `${method.status}`);
  const meCarmen = await carmen.get('auth/me', { cache: 'no-cache' });
  check('Carmen entra con email + contraseña y auth/me devuelve su Patient', `${meCarmen.profile?.resourceType}/${meCarmen.profile?.id}` === P);

  // MRN as user name -> no login. Medplum allows 5 logins per minute: on 429 wait and retry.
  let mrnLogin;
  for (let i = 0; i < 3; i++) {
    mrnLogin = await rawRequest(
      newClient(),
      'POST',
      'auth/login',
      { email: 'MRN-0001', password: required('DEMO_CARMEN_PASSWORD'), projectId, scope: 'openid' },
      'application/json'
    );
    if (mrnLogin.status !== 429) {
      break;
    }
    await sleep(61000);
  }
  check('entrar con "MRN-0001" como usuario -> no entra', mrnLogin.status >= 400 && !mrnLogin.body?.code, `${mrnLogin.status}`);

  for (const key of ['CARMEN', 'LOURDES']) {
    const user = await admin.searchOne('User', { email: required(`DEMO_${key}_EMAIL`) });
    check(`cuenta ${key.toLowerCase()}: usuario = email, alcance de proyecto`, user?.project?.reference === `Project/${projectId}`);
  }

  const hl7Source = readFileSync(join(here, '..', 'bots', 'hl7-a-fhir.cjs'), 'utf8');
  check(
    'el Bot traductor busca a la paciente por PID-3 en el sistema MRN',
    /field\(msg\.getSegment\('PID'\), 3\)/.test(hl7Source) && hl7Source.includes(SYSTEMS.mrn) && /identifier: `\$\{SYS\.mrn\}\|\$\{mrn\}`/.test(hl7Source)
  );
  const reports = await count(admin, `DiagnosticReport?patient=${P}`);
  check('los resultados del traductor quedaron en la ficha de Carmen', reports > 0, `${reports} DiagnosticReport`);

  const lourdesRecord = await admin.readResource('Patient', LP);
  check('Lourdes tiene MRN-0002 en su ficha propia', lourdesRecord.identifier?.some((i) => i.system === SYSTEMS.mrn && i.value === 'MRN-0002'));

  console.log('\n== POR-101 · una cuenta, dos roles ==');
  const ownL = await get(lourdes, `Patient/${LP}`);
  check(
    'Lourdes ve su ficha con su MRN',
    ownL.status === 200 && ownL.body.identifier?.some((i) => i.value === 'MRN-0002'),
    `${ownL.status}`
  );
  const carmenAsL = await get(lourdes, `Patient/${C}`);
  check(
    'Lourdes ve a Carmen sin identifier, address ni telecom',
    carmenAsL.status === 200 && !carmenAsL.body.identifier && !carmenAsL.body.address && !carmenAsL.body.telecom,
    `${carmenAsL.status}`
  );
  const personL = entries(await get(lourdes, `Person?relatedperson=RelatedPerson/${LOURDES_RP}`));
  check(
    'Person?relatedperson=Lourdes -> 1 Person que enlaza su Patient',
    personL.length === 1 && personL[0].link?.some((l) => l.target?.reference === `Patient/${LP}`),
    `${personL.length}`
  );
  const meL = await lourdes.get('auth/me', { cache: 'no-cache' });
  // auth/me does not return membership.access; it returns the combined policy with %patient already replaced.
  const basedOn = (meL.accessPolicy?.basedOn ?? []).map((b) => b.display);
  const resolved = JSON.stringify(meL.accessPolicy?.resource ?? []);
  check(
    'auth/me de Lourdes: una sola cuenta con el rol de familia (Carmen) y el de paciente (ella)',
    meL.profile?.resourceType === 'RelatedPerson' &&
      basedOn.includes('Paciente (portal)') &&
      basedOn.some((d) => d?.startsWith('Familiar')) &&
      resolved.includes(P) &&
      resolved.includes(LP),
    basedOn.join(' + ')
  );
  check('Lourdes ve su propia cita', (await count(lourdes, `Appointment?patient=Patient/${LP}`)) >= 1);
  check('Carmen: Patient?identifier=MRN-0002 -> Bundle vacío', (await count(carmen, `Patient?identifier=${MRN('MRN-0002')}`)) === 0);
  const lAsC = await get(carmen, `Patient/${LP}`);
  check('Carmen: GET Patient/<Lourdes> -> 404', lAsC.status === 404, `${lAsC.status}`);
  check('Carmen: Person?relatedperson=Lourdes -> Bundle vacío', (await count(carmen, `Person?relatedperson=RelatedPerson/${LOURDES_RP}`)) === 0);
  check('idempotente: una sola ficha MRN-0002 (admin)', (await admin.searchResources('Patient', { identifier: MRN('MRN-0002') })).length === 1);
  check('Carmen: Appointment?patient=<Lourdes> -> Bundle vacío', (await count(carmen, `Appointment?patient=Patient/${LP}`)) === 0);
  check('idempotente: una sola cita propia de Lourdes (admin)', (await count(admin, `Appointment?patient=Patient/${LP}`)) === 1);
  check('idempotente: un solo Person de Lourdes (admin)', (await admin.searchResources('Person', { relatedperson: `RelatedPerson/${LOURDES_RP}` })).length === 1);

  console.log('\n== POR-99 · un cuidador (Lourdes): ve solo lo que Carmen comparte ==');
  // The demo has one caregiver since the scope change of 2026-10-09; independence between two caregivers
  // is no longer tested. What is tested: shared vs not shared, share more, revoke, and her own record.
  const rps = await admin.searchResources('RelatedPerson', { patient: P }, { cache: 'no-cache' });
  check(
    'RelatedPerson?patient=Carmen -> solo Lourdes (hija)',
    rps.length === 1 && rps[0].id === LOURDES_RP && rps[0].relationship?.[0]?.text === 'hija',
    rps.map((x) => `RelatedPerson/${x.id} ${x.relationship?.[0]?.text}`).join(', ')
  );
  const consents = await admin.searchResources('Consent', { patient: P }, { cache: 'no-cache' });
  check(
    'Consent?patient=Carmen -> uno solo, de Lourdes',
    consents.length === 1 && consents[0].provision?.actor?.[0]?.reference?.reference === `RelatedPerson/${LOURDES_RP}`,
    consents.map((c) => c.provision?.actor?.[0]?.reference?.reference).join(', ')
  );

  const types = ['Encounter', 'Task', 'MedicationRequest', 'CarePlan', 'Observation', 'DiagnosticReport'];
  const lourdesSees = async () => Object.fromEntries(await Promise.all(types.map(async (t) => [t, await count(lourdes, `${t}?patient=${P}`)])));
  const carmenMemBefore = await admin.searchOne('ProjectMembership', { profile: P }, { cache: 'no-cache' });

  let seen = await lourdesSees();
  check('seed: Lourdes ve la visita (Encounter y Task)', seen.Encounter > 0 && seen.Task > 0, JSON.stringify(seen));
  check('seed: Lourdes no ve resultados (Observation y DiagnosticReport -> Bundle vacío)', seen.Observation === 0 && seen.DiagnosticReport === 0);

  let r = await execute(carmen, { familiar: LOURDES_RP, compartir: [...CATEGORIES] });
  check('Carmen le comparte también "estudios"', r.status === 200 && r.body?.compartir?.length === 4, `${r.status} ${JSON.stringify(r.body?.compartir)}`);
  seen = await lourdesSees();
  check('Lourdes ve los resultados (Observation y DiagnosticReport)', seen.Observation > 0 && seen.DiagnosticReport > 0, JSON.stringify(seen));
  const cL = (await carmen.searchResources('Consent', { patient: P, actor: `RelatedPerson/${LOURDES_RP}`, _sort: '-_lastUpdated', _count: '1' }, { cache: 'no-cache' }))[0];
  check('el Consent de Lourdes registra las 4 categorías', JSON.stringify((cL?.provision?.class ?? []).map((x) => x.code)) === JSON.stringify(CATEGORIES), JSON.stringify((cL?.provision?.class ?? []).map((x) => x.code)));

  r = await execute(carmen, { familiar: LOURDES_RP, compartir: SEED });
  seen = await lourdesSees();
  check('Carmen vuelve al seed: los resultados desaparecen para Lourdes', r.status === 200 && seen.Observation === 0 && seen.DiagnosticReport === 0 && seen.Encounter > 0, JSON.stringify(seen));

  r = await execute(carmen, { familiar: LOURDES_RP, compartir: [] });
  check('Carmen le quita todo a Lourdes', r.status === 200 && JSON.stringify(r.body?.compartir) === '[]', `${r.status}`);
  const lNow = await Promise.all([...types.map((t) => count(lourdes, `${t}?patient=${P}`)), count(lourdes, `Communication?subject=${P}`)]);
  check('Lourdes sin acceso: Bundle vacío en todo lo de Carmen', lNow.every((n) => n === 0), lNow.join(','));
  const lMem = await membershipOf(LOURDES_RP);
  check(
    'membresía de Lourdes nunca vacía: "Familiar sin acceso" para Carmen',
    lMem.access?.length > 0 && carmenPolicies(lMem) === 'Familiar sin acceso',
    `${carmenPolicies(lMem)} · ${lMem.access?.length} entradas`
  );
  const cOff = (await carmen.searchResources('Consent', { patient: P, actor: `RelatedPerson/${LOURDES_RP}` }, { cache: 'no-cache' }))[0];
  check('Consent de Lourdes: inactive + deny tras quitar todo', cOff?.status === 'inactive' && cOff?.provision?.type === 'deny', `${cOff?.status} ${cOff?.provision?.type}`);
  check('POR-101: Lourdes conserva su cita propia sin el acceso de Carmen', (await count(lourdes, `Appointment?patient=Patient/${LP}`)) >= 1);
  check('POR-101: Lourdes sigue leyendo su ficha', (await get(lourdes, `Patient/${LP}`)).status === 200);
  const carmenMemAfter = await admin.searchOne('ProjectMembership', { profile: P }, { cache: 'no-cache' });
  check('compartir y quitar no tocan la membresía de Carmen (versionId igual)', carmenMemAfter.meta.versionId === carmenMemBefore.meta.versionId);

  // Negatives: the caregiver cannot run the Bot; nothing changes.
  const before = (await membershipOf(LOURDES_RP)).meta.versionId;
  r = await execute(lourdes, { familiar: LOURDES_RP, compartir: [...CATEGORIES] });
  check('Lourdes ejecuta el Bot -> rechazado', r.status >= 400, `${r.status}`);
  r = await execute(carmen, { compartir: ['visita'] });
  check('Carmen sin "familiar" -> OperationOutcome (el portal siempre lo manda)', r.status >= 400, `${r.status} ${r.body?.issue?.[0]?.details?.text ?? ''}`);
  check('la membresía de Lourdes no cambió tras los intentos rechazados', (await membershipOf(LOURDES_RP)).meta.versionId === before);

  // No membership of the demo is ever left without entries.
  const sizes = [carmenMemAfter, await membershipOf(LOURDES_RP)].map((m) => m?.access?.length ?? 0);
  check('ninguna membresía del demo queda sin entradas (Carmen, Lourdes)', sizes.every((n) => n > 0), sizes.join(','));
} finally {
  const res = await execute(carmen, { familiar: LOURDES_RP, compartir: SEED });
  console.log(`\nrestaurado el seed aprobado: Lourdes ${JSON.stringify(res.body?.compartir)}`);
}
console.log(`Resultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
