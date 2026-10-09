#!/usr/bin/env node
// POR-52 · audit (API-24) "¿Quién vio mi récord?": SIMULATED list, marked as such.
// Why simulated: Medplum 5.1.42 only stores AuditEvents of reads when the SERVER config has
// `saveAuditEvents: true` (packages/server/src/fhir/repo.ts). On this server it is off: the only stored
// AuditEvents are Bot executions (checked by scripts/test-auditoria.mjs). We do not change server config.
// Each entry: agent[0].who = the family member, entity[0].what = what was seen (display only, so the
// visit reset never leaves a dangling reference), entity[1].what = the patient (so
// `AuditEvent?entity=<P>` finds it), meta.tag urn:portal:origen|simulado.
// AuditEvent has no identifier: idempotent through a second tag urn:portal:auditoria-simulada|<key>.
// Usage: node scripts/seed-auditoria.mjs
import { required } from '../lib/env.mjs';
import { log, loginUser } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';

export const AUDIT_TAG_SYSTEM = 'urn:portal:auditoria-simulada';

export function simulatedEntries({ carmenId, lourdesRpId, rafaelRpId, day = '2026-10-09' }) {
  const entry = (key, who, whoDisplay, whatDisplay, time) => ({
    resourceType: 'AuditEvent',
    meta: { tag: [{ system: SYSTEMS.origin, code: 'simulado' }, { system: AUDIT_TAG_SYSTEM, code: key }] },
    type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110110', display: 'Patient Record' },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'read', display: 'read' }],
    action: 'R',
    recorded: `${day}T${time}:00-04:00`,
    outcome: '0',
    agent: [{ who: { reference: `RelatedPerson/${who}`, display: whoDisplay }, requestor: true }],
    source: { observer: { display: 'Portal PRPP (registro simulado)' } },
    entity: [
      { what: { display: whatDisplay } },
      { what: { reference: `Patient/${carmenId}`, display: 'Carmen Rivera Colón' }, role: { code: '1', display: 'Patient' } },
    ],
  });
  return [
    entry('lourdes-visita', lourdesRpId, 'Lourdes (hija)', 'Su visita a Emergencias', '09:12'),
    entry('rafael-resultados', rafaelRpId, 'Rafael (esposo)', 'Sus resultados de laboratorio', '10:05'),
  ];
}

export async function seedAudit(admin) {
  const out = [];
  for (const wanted of simulatedEntries({
    carmenId: required('DEMO_CARMEN_PATIENT_ID'),
    lourdesRpId: required('DEMO_LOURDES_RELATEDPERSON_ID'),
    rafaelRpId: required('DEMO_RAFAEL_RELATEDPERSON_ID'),
  })) {
    const key = wanted.meta.tag[1].code;
    const found = await admin.searchResources('AuditEvent', { _tag: `${AUDIT_TAG_SYSTEM}|${key}` }, { cache: 'no-cache' });
    if (found.length > 1) {
      throw new Error(`AuditEvent ${key}: ${found.length} copies (expected 1)`);
    }
    if (found[0]) {
      log('same', `AuditEvent/${found[0].id} ${key} (simulado)`);
      out.push(found[0]);
    } else {
      const created = await admin.createResource(wanted);
      log('new', `AuditEvent/${created.id} ${key} (simulado)`);
      out.push(created);
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), required('MEDPLUM_PROJECT_ID'));
  await seedAudit(admin);
}
