#!/usr/bin/env node
// POR-48 (Bot compartir-familia) and POR-49 (revoke) with the real accounts.
// Changes Lourdes' access during the test and ALWAYS restores the approved seed at the end
// (Lourdes: visita + medicinas + instrucciones).
// Usage: node scripts/test-sharing.mjs
import { required } from '../lib/env.mjs';
import { loginUser, rawRequest } from '../lib/medplum.mjs';
import { buildMessages, todayPR } from '../simulator/mensajes.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const C = required('DEMO_CARMEN_PATIENT_ID');
const P = `Patient/${C}`;
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const RAFAEL_RP = required('DEMO_RAFAEL_RELATEDPERSON_ID');
const SEED = ['visita', 'medicinas', 'instrucciones'];

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
}
const entries = (r) => (r.body?.entry ?? []).map((e) => e.resource);

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const rafael = await loginUser(required('DEMO_RAFAEL_EMAIL'), required('DEMO_RAFAEL_PASSWORD'), projectId);

// Like the portal: find the Bot by name with the patient's own session.
const bot = (await carmen.searchResources('Bot', { name: 'compartir-familia' }))[0];
const execute = (client, input) => rawRequest(client, 'POST', `fhir/R4/Bot/${bot.id}/$execute`, input, 'application/json');
const membership = async () => admin.searchOne('ProjectMembership', { profile: `RelatedPerson/${LOURDES_RP}` }, { cache: 'no-cache' });
const carmenEntries = (m) => (m.access ?? []).filter((a) => a.parameter?.some((p) => p.valueReference?.reference === P));
const policyNames = (m) => carmenEntries(m).map((a) => a.policy.display).join(' + ');
const lourdesSees = async (type) => {
  const r = await rawRequest(lourdes, 'GET', `fhir/R4/${type}?${type === 'Communication' ? 'subject' : 'patient'}=${P}`);
  return { status: r.status, n: entries(r).length };
};

try {
  console.log('== Bot compartir-familia (POR-48) ==');
  // 1. Only "visita": medicines disappear.
  let t0 = Date.now();
  let r = await execute(carmen, { familiar: LOURDES_RP, compartir: [] .concat(['visita']) });
  check('Carmen comparte solo "visita" -> ok', r.status === 200 && r.body?.ok === true, `${r.status} ${JSON.stringify(r.body)}`);
  let meds = await lourdesSees('MedicationAdministration');
  check('Lourdes: MedicationAdministration -> Bundle vacío en la siguiente lectura', meds.status === 200 && meds.n === 0, `${meds.status}, ${meds.n}, ${Date.now() - t0} ms desde la orden`);
  for (const type of ['MedicationRequest', 'CarePlan', 'Appointment']) {
    const x = await lourdesSees(type);
    check(`Lourdes solo con "visita": ${type} -> Bundle vacío`, x.status === 200 && x.n === 0, `${x.status}, ${x.n}`);
  }
  const enc = await lourdesSees('Encounter');
  check('Lourdes sigue viendo la visita', enc.n === 1);
  const notices = entries(await rawRequest(lourdes, 'GET', `fhir/R4/Communication?subject=${P}&_count=100`));
  check('Lourdes ya no ve avisos "medicina"', !notices.some((c) => c.category.some((x) => x.coding[0].code === 'medicina')));

  // 2. Medicines again: back without logging in again (same session).
  t0 = Date.now();
  r = await execute(carmen, { familiar: LOURDES_RP, compartir: ['medicinas'] });
  check('Carmen comparte "medicinas" -> el Bot añade "visita"', JSON.stringify(r.body?.compartir) === '["visita","medicinas"]', JSON.stringify(r.body));
  check('salida trae familiares', Array.isArray(r.body?.familiares) && r.body.familiares[0] === 'Lourdes Rivera', JSON.stringify(r.body?.familiares));
  meds = await lourdesSees('MedicationAdministration');
  check('Lourdes ve las medicinas sin volver a entrar', meds.n > 0, `${meds.n}, ${Date.now() - t0} ms`);

  // 3. Idempotent + other entries untouched.
  await execute(carmen, { familiar: LOURDES_RP, compartir: ['medicinas'] });
  let m = await membership();
  check('idempotente: una entrada por categoría', policyNames(m) === 'Familiar: estado en Emergencias + Familiar: medicinas', policyNames(m));
  check('la entrada "Mi salud" de Lourdes no se toca', (m.access ?? []).some((a) => a.policy.display === 'Paciente (portal)' || a.parameter?.some((p) => p.valueReference?.reference === `Patient/${required('DEMO_LOURDES_PATIENT_ID')}`)));

  // 4. Consent as the record (API-15).
  const consent = (await carmen.searchResources('Consent', { patient: P, actor: `RelatedPerson/${LOURDES_RP}`, _sort: '-_lastUpdated', _count: '1' }, { cache: 'no-cache' }))[0];
  check('Carmen lee el Consent de Lourdes con las categorías', JSON.stringify(consent?.provision?.class?.map((c) => c.code)) === '["visita","medicinas"]', JSON.stringify(consent?.provision?.class));
  const allConsents = await admin.searchResources('Consent', { patient: P, actor: `RelatedPerson/${LOURDES_RP}` }, { cache: 'no-cache' });
  check('un solo Consent por persona (versiones nuevas)', allConsents.length === 1, `${allConsents.length}, version ${allConsents[0]?.meta?.versionId}`);
  const lc = await rawRequest(lourdes, 'GET', `fhir/R4/Consent?patient=${P}`);
  check('Lourdes no ve los Consent -> Bundle vacío', lc.status === 200 && entries(lc).length === 0);

  // 5. Negatives.
  const before = JSON.stringify(carmenEntries(await membership()));
  r = await execute(lourdes, { familiar: LOURDES_RP, compartir: ['visita', 'medicinas', 'instrucciones', 'estudios'] });
  check('Lourdes ejecuta el Bot -> rechazado', r.status >= 400, `${r.status} ${JSON.stringify(r.body?.issue?.[0]?.details?.text ?? r.body)}`);
  r = await execute(rafael, { familiar: RAFAEL_RP, compartir: ['estudios'] });
  check('Rafael ejecuta el Bot -> 403', r.status === 403, `${r.status}`);
  r = await execute(carmen, { familiar: LOURDES_RP, compartir: ['radiografias'] });
  check('categoría desconocida -> OperationOutcome', r.status >= 400, `${r.status} ${JSON.stringify(r.body?.issue?.[0]?.details?.text ?? '')}`);
  r = await execute(carmen, { familiar: '00000000-0000-0000-0000-000000000000', compartir: ['visita'] });
  check('familiar que no es suyo -> OperationOutcome', r.status >= 400, `${r.status} ${JSON.stringify(r.body?.issue?.[0]?.details?.text ?? '')}`);
  r = await execute(carmen, { familiar: `${LOURDES_RP}/../${RAFAEL_RP}`, compartir: ['visita'] });
  check('familiar con "/.." -> rechazado', r.status >= 400, `${r.status}`);
  check('nada cambió tras los intentos rechazados', JSON.stringify(carmenEntries(await membership())) === before);

  console.log('\n== Quitar el acceso (POR-49) ==');
  const visitMsg = buildMessages(todayPR()).find((x) => x.id === 'a04');
  void visitMsg;
  t0 = Date.now();
  r = await execute(carmen, { familiar: LOURDES_RP, compartir: [] });
  const botMs = Date.now() - t0;
  check('Carmen quita todo -> ok, compartir vacío', r.status === 200 && JSON.stringify(r.body?.compartir) === '[]', `${botMs} ms`);
  const reads = {};
  for (const type of ['Encounter', 'Task', 'Communication', 'MedicationAdministration']) {
    reads[type] = await lourdesSees(type);
  }
  const elapsed = Date.now() - t0;
  check(
    `Lourdes: Encounter/Task/Communication/MedicationAdministration -> Bundle vacío (${elapsed} ms desde la orden)`,
    Object.values(reads).every((x) => x.status === 200 && x.n === 0) && elapsed < 10000,
    JSON.stringify(reads)
  );
  const me = await rawRequest(lourdes, 'GET', 'auth/me');
  const withCarmen = (me.body?.accessPolicy?.basedOn ?? []).map((b) => b.display);
  m = await membership();
  check('membresía: solo "Familiar sin acceso" para Carmen, nunca vacía', policyNames(m) === 'Familiar sin acceso' && m.access.length > 0, `${policyNames(m)} · total entradas ${m.access.length}`);
  check('auth/me de Lourdes ya no da acceso clínico a Carmen', !JSON.stringify(me.body?.accessPolicy ?? {}).includes(`Encounter?patient=${P}`), withCarmen.join(', '));
  const consent2 = (await carmen.searchResources('Consent', { patient: P, actor: `RelatedPerson/${LOURDES_RP}` }, { cache: 'no-cache' }))[0];
  check(
    'Consent: inactive, deny, OPTOUT',
    consent2.status === 'inactive' && consent2.provision.type === 'deny' && consent2.policyRule.coding[0].code === 'OPTOUT'
  );
  const own = await rawRequest(lourdes, 'GET', `fhir/R4/Patient/${required('DEMO_LOURDES_PATIENT_ID')}`);
  check('la cuenta de Lourdes y su "Mi salud" siguen intactas', own.status === 200, `${own.status}`);
  const raf = await rawRequest(rafael, 'GET', `fhir/R4/DiagnosticReport?patient=${P}`);
  check('Rafael (otro cuidador) sigue viendo sus 4 categorías', entries(raf).length > 0, `${entries(raf).length} reportes`);
  r = await execute(lourdes, { familiar: LOURDES_RP, compartir: ['visita'] });
  check('Lourdes no puede devolverse el acceso', r.status >= 400, `${r.status}`);

  // 6. "visita" again brings the stage back without logging in.
  r = await execute(carmen, { familiar: LOURDES_RP, compartir: ['visita'] });
  const task = await lourdesSees('Task');
  check('volver a compartir "visita" le devuelve la etapa', task.n > 0, `${task.n}`);
} finally {
  const restore = await execute(carmen, { familiar: LOURDES_RP, compartir: SEED });
  console.log(`\nrestaurado el seed aprobado de Lourdes: ${JSON.stringify(restore.body?.compartir)}`);
}
console.log(`Resultado: ${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
