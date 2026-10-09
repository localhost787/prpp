// "Reiniciar" (POR-42): deletes ONLY the visit data of the patient, these 11 types (API-27).
// Keeps accounts, fixed data (Patient, Practitioner, Location, Organization) and the R-labeled test data.
// Destructive: the server asks for an explicit confirmation before calling this.
import { VISIT_TYPES } from '../lib/simulator-policy.mjs';

const R = 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality';

function isSensitive(resource) {
  return (resource.meta?.security ?? []).some((s) => s.system === R && s.code === 'R');
}

function patientParam(type) {
  return type === 'Communication' ? 'subject' : 'patient';
}

/** @returns {Promise<Record<string, number>>} deleted count per type */
export async function resetVisit(medplum, { mrn = 'MRN-0001' } = {}) {
  const opts = { cache: 'no-cache' };
  const patient = await medplum.searchOne('Patient', { identifier: `urn:hospital-demo:mrn|${mrn}` }, opts);
  if (!patient) {
    throw new Error(`No hay paciente ${mrn}`);
  }
  const deleted = {};
  // Children first, the visit last, so nothing points to a deleted Encounter while we work.
  const order = [...VISIT_TYPES.filter((t) => t !== 'Encounter'), 'Encounter'];
  for (const type of order) {
    deleted[type] = 0;
    for (;;) {
      const page = await medplum.searchResources(type, { [patientParam(type)]: `Patient/${patient.id}`, _count: '100' }, opts);
      const targets = page.filter((r) => !isSensitive(r));
      if (!targets.length) {
        break;
      }
      for (const r of targets) {
        await medplum.deleteResource(type, r.id);
        deleted[type]++;
      }
      if (page.length < 100) {
        break;
      }
    }
  }
  return deleted;
}
