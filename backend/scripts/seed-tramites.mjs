#!/usr/bin/env node
// POR-54 · tramites-data (API-20) + POR-57 · preauth-data (API-21). "Día 2" data, after the discharge.
// As the hospital/plan systems would (everything tagged urn:portal:origen|simulado):
//   - DocumentReference: the work excuse (content[0].attachment, inline text, synthetic)
//   - Claim (use = preauthorization) for the follow-up chest X-ray + ClaimResponse (outcome queued)
//   - 5 Task with code urn:portal:tarea|tramite for Carmen, focus = Appointment / Claim / DocumentReference
// Needs the discharge first (simulator "Alta" + POR-46 data: the follow-up Appointment).
// Idempotent: every resource is found by its identifier and only updated when its content changed.
// The simulator's "Reiniciar" deletes the Tasks (visit data); DocumentReference/Claim stay and are reused.
// Usage: node scripts/seed-tramites.mjs [--visita V-0001]
import { createReference } from '@medplum/core';
import { required } from '../lib/env.mjs';
import { log, loginUser } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';

export const TRAMITE_SYSTEM = 'urn:hospital-demo:tramite';
export const PREAUTH_SYSTEM = 'urn:hospital-demo:preautorizacion';
export const DOCUMENT_SYSTEM = 'urn:hospital-demo:documento';
const DISCHARGE_SYSTEM = 'urn:hospital-demo:alta';
const SIMULATED = { tag: [{ system: SYSTEMS.origin, code: 'simulado' }] };
const TRAMITE_CODE = { coding: [{ system: SYSTEMS.task, code: 'tramite' }], text: 'Trámite' };
const PLAN = { display: 'Plan médico (simulado)' };
const STATUS_TEXT = { completed: 'Listo', 'in-progress': 'En curso', requested: 'Le toca a usted' };

/** Same content for the keys we manage (ignores id, meta.versionId, lastUpdated...). */
function differs(current, wanted) {
  return Object.entries(wanted).some(([key, value]) =>
    key === 'meta'
      ? Object.entries(value).some(([mk, mv]) => JSON.stringify(current.meta?.[mk]) !== JSON.stringify(mv))
      : JSON.stringify(current[key]) !== JSON.stringify(value)
  );
}

export async function upsertByIdentifier(medplum, wanted) {
  const { system, value } = wanted.identifier[0];
  const found = await medplum.searchResources(wanted.resourceType, { identifier: `${system}|${value}` }, { cache: 'no-cache' });
  if (found.length > 1) {
    throw new Error(`${wanted.resourceType} ${system}|${value}: ${found.length} copies (expected 1)`);
  }
  const current = found[0];
  if (!current) {
    const created = await medplum.createResource(wanted);
    log('new', `${wanted.resourceType}/${created.id} ${value}`);
    return created;
  }
  if (!differs(current, wanted)) {
    log('same', `${wanted.resourceType}/${current.id} ${value}`);
    return current;
  }
  const updated = await medplum.updateResource(
    { ...current, ...wanted, meta: { ...current.meta, ...wanted.meta } },
    { headers: { 'If-Match': `W/"${current.meta.versionId}"` } }
  );
  log('fix', `${wanted.resourceType}/${updated.id} ${value} -> version ${updated.meta.versionId}`);
  return updated;
}

const toBase64 = (text) => Buffer.from(text, 'utf8').toString('base64');

/** The 3 supporting resources + the 5 tasks, in creation order. */
export function tramiteResources({ patient, visit, appointment, org }) {
  const visitNumber = visit.identifier[0].value;
  const subject = createReference(patient);
  const day = (visit.period?.end ?? visit.period?.start ?? '2026-10-09T11:30:00-04:00').slice(0, 10);
  const task = (key, status, description, focus) => ({
    resourceType: 'Task',
    meta: SIMULATED,
    identifier: [{ system: TRAMITE_SYSTEM, value: `${visitNumber}-${key}` }],
    status,
    intent: 'order',
    code: TRAMITE_CODE,
    businessStatus: { text: STATUS_TEXT[status] },
    description,
    for: subject,
    encounter: createReference(visit),
    authoredOn: visit.period?.end ?? visit.period?.start,
    ...(focus ? { focus: { reference: `${focus.resourceType}/${focus.id}` } } : {}),
  });
  return {
    document: {
      resourceType: 'DocumentReference',
      meta: SIMULATED,
      identifier: [{ system: DOCUMENT_SYSTEM, value: `${visitNumber}-excusa` }],
      status: 'current',
      type: { text: 'Excusa médica' },
      subject,
      date: visit.period?.end ?? visit.period?.start,
      description: 'Excusa para el trabajo',
      content: [
        {
          attachment: {
            contentType: 'text/plain; charset=utf-8',
            title: 'Excusa para el trabajo (simulada).txt',
            data: toBase64(
              `Hospital Demo · Emergencias\n\nCertificamos que Carmen Rivera Colón fue atendida en Emergencias el ${day} ` +
                'y necesita descanso hasta su cita de seguimiento.\n\nDocumento simulado para la demostración. No es un documento médico real.\n'
            ),
          },
        },
      ],
      context: { encounter: [createReference(visit)] },
    },
    claim: {
      resourceType: 'Claim',
      meta: SIMULATED,
      identifier: [{ system: PREAUTH_SYSTEM, value: `${visitNumber}-rx-control` }],
      status: 'active',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
      use: 'preauthorization',
      patient: subject,
      created: visit.period?.end ?? visit.period?.start,
      provider: org ? createReference(org) : { display: 'Hospital Demo' },
      priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
      insurance: [{ sequence: 1, focal: true, coverage: PLAN }],
      item: [
        {
          sequence: 1,
          productOrService: { text: 'Radiografía de tórax de control (en 6 semanas)' },
          servicedDate: '2026-11-20',
        },
      ],
    },
    claimResponse: (claimRes) => ({
      resourceType: 'ClaimResponse',
      meta: SIMULATED,
      identifier: [{ system: PREAUTH_SYSTEM, value: `${visitNumber}-rx-control-respuesta` }],
      status: 'active',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
      use: 'preauthorization',
      patient: subject,
      created: visit.period?.end ?? visit.period?.start,
      insurer: PLAN,
      request: createReference(claimRes),
      outcome: 'queued',
      disposition: 'Su plan está revisando el permiso. Decisión en hasta 7 días.',
    }),
    tasks: (claimRes, documentRes) => [
      task('receta', 'completed', 'Receta lista en la farmacia'),
      task('cita', 'requested', 'Confirmar la cita de seguimiento', appointment),
      task('radiografia', 'in-progress', 'Radiografía de control en 6 semanas: su plan está revisando el permiso', claimRes),
      task('excusa', 'requested', 'Descargar la excusa para el trabajo', documentRes),
      task('hemocultivos', 'in-progress', 'Hemocultivos pendientes: el resultado tarda unos días'),
    ],
  };
}

export async function publishTramites(admin, { mrn = 'MRN-0001', visitNumber = 'V-0001' } = {}) {
  const opts = { cache: 'no-cache' };
  const patient = await admin.searchOne('Patient', { identifier: `${SYSTEMS.mrn}|${mrn}` }, opts);
  const visit = await admin.searchOne('Encounter', { identifier: `${SYSTEMS.visit}|${visitNumber}` }, opts);
  const appointment = await admin.searchOne('Appointment', { identifier: `${DISCHARGE_SYSTEM}|${visitNumber}-cita` }, opts);
  if (!patient || !visit || visit.status !== 'finished' || !appointment) {
    throw new Error('Primero el alta: la visita tiene que estar finished y con la cita del alta (simulador: tour + Alta)');
  }
  const org = await admin.searchOne('Organization', { identifier: 'urn:hospital-demo:org|hospital-demo' }, opts);
  const r = tramiteResources({ patient, visit, appointment, org });
  const document = await upsertByIdentifier(admin, r.document);
  const claim = await upsertByIdentifier(admin, r.claim);
  const claimResponse = await upsertByIdentifier(admin, r.claimResponse(claim));
  const tasks = [];
  for (const t of r.tasks(claim, document)) {
    tasks.push(await upsertByIdentifier(admin, t));
  }
  return { patient, visit, appointment, document, claim, claimResponse, tasks };
}

async function main() {
  const i = process.argv.indexOf('--visita');
  const visitNumber = i > 0 ? process.argv[i + 1] : 'V-0001';
  const admin = await loginUser(
    required('MEDPLUM_PROJECT_ADMIN_EMAIL'),
    required('MEDPLUM_PROJECT_ADMIN_PASSWORD'),
    required('MEDPLUM_PROJECT_ID')
  );
  const out = await publishTramites(admin, { visitNumber });
  const P = `Patient/${out.patient.id}`;
  const tasks = await admin.searchResources('Task', { patient: P, code: `${SYSTEMS.task}|tramite`, _count: '100' }, { cache: 'no-cache' });
  log(tasks.length === 5 ? 'ok' : 'FAIL', `Task?patient=Carmen&code=tramite -> ${tasks.length}: ${tasks.map((t) => t.businessStatus?.text).join(' | ')}`);
  const claims = await admin.searchResources('Claim', { patient: P, use: 'preauthorization' }, { cache: 'no-cache' });
  const responses = await admin.searchResources('ClaimResponse', { request: `Claim/${out.claim.id}` }, { cache: 'no-cache' });
  log(claims.length === 1 && responses.length === 1 ? 'ok' : 'FAIL', `Claim preauthorization -> ${claims.length}, ClaimResponse -> ${responses.length} (${responses[0]?.outcome})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`FAIL ${err.message}`);
    process.exit(1);
  });
}
