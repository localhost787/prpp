// API-02: the ONE permission function of the portal. The lock comes ONLY from auth/me (explicit
// permission), never from "the search came back empty", a 403/404 or an error.
//
// Stable rule (no substring matching), observed on the live server (Medplum 5.1.42):
// - Family member: category C of patient P is allowed only if
//     (a) auth/me.accessPolicy.basedOn[] has an entry whose display EQUALS the policy name of C, and
//     (b) auth/me.accessPolicy.resource[] has an entry of C's anchor type whose criteria EQUALS
//         `<Anchor>?patient=Patient/<P>&_security:not=<v3-Confidentiality>|R` (whole-string comparison).
// - Own record ("Mi salud", e.g. Carmen, or Lourdes' own Patient): basedOn has "Paciente (portal)" and
//   resource[] has exactly `Patient?_id=<P>` and `Encounter?_compartment=Patient/<P>` → all categories.
// - auth/me without that shape → fail closed (no access).
// Policy names are the backend contract (backend/lib/policies.mjs).
export const CATEGORIES = Object.freeze(['visita', 'medicinas', 'instrucciones', 'estudios']);

export const OWN_POLICY_NAME = 'Paciente (portal)';
export const NO_ACCESS_POLICY_NAME = 'Familiar sin acceso';
export const FAMILY_POLICY_NAMES = Object.freeze({
  visita: 'Familiar: estado en Emergencias',
  medicinas: 'Familiar: medicinas',
  instrucciones: 'Familiar: instrucciones del alta',
  estudios: 'Familiar: estudios y resultados',
});

/** Anchor resource type per category (its exact criteria binds the category to one patient). */
export const ANCHOR_TYPES = Object.freeze({
  visita: 'Encounter',
  medicinas: 'MedicationAdministration',
  instrucciones: 'CarePlan',
  estudios: 'DiagnosticReport',
});
/** Kept for compatibility with earlier imports. */
export const REPRESENTATIVE_TYPES = ANCHOR_TYPES;

export const NOT_RESTRICTED = '_security:not=http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R';
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;

/** Exact criteria the backend generates for a family category of one patient. */
export const familyCriteria = (category, patientId) => `${ANCHOR_TYPES[category]}?patient=Patient/${patientId}&${NOT_RESTRICTED}`;

/** auth/me has the shape the rule needs; otherwise everything is locked. */
export function isValidMe(me) {
  const policy = me?.accessPolicy;
  return !!(
    me && typeof me === 'object' &&
    me.profile && typeof me.profile.resourceType === 'string' &&
    policy && Array.isArray(policy.basedOn) && Array.isArray(policy.resource) &&
    policy.basedOn.every(b => b && typeof b === 'object') &&
    policy.resource.every(r => r && typeof r === 'object')
  );
}

const policyNames = me => new Set(me.accessPolicy.basedOn.map(b => b.display).filter(d => typeof d === 'string'));
const hasEntry = (me, resourceType, criteria) => me.accessPolicy.resource.some(e => e.resourceType === resourceType && e.criteria === criteria);

/** Own records ("Mi salud") in this auth/me: patient ids with the exact own-record entries. */
export function ownPatientIds(me) {
  if (!isValidMe(me) || !policyNames(me).has(OWN_POLICY_NAME)) return [];
  const ids = [];
  for (const e of me.accessPolicy.resource) {
    const id = e.resourceType === 'Patient' && typeof e.criteria === 'string' ? e.criteria.match(/^Patient\?_id=([A-Za-z0-9\-.]{1,64})$/)?.[1] : null;
    if (id && !ids.includes(id) && hasEntry(me, 'Encounter', `Encounter?_compartment=Patient/${id}`)) ids.push(id);
  }
  return ids;
}

/** canView(me, patientId, category): may this session see `category` of `patientId`? Fails closed. */
export function canView(me, patientId, category) {
  if (typeof patientId !== 'string' || !FHIR_ID.test(patientId) || !CATEGORIES.includes(category)) return false;
  if (!isValidMe(me)) return false;
  if (ownPatientIds(me).includes(patientId)) return true;
  return policyNames(me).has(FAMILY_POLICY_NAMES[category]) && hasEntry(me, ANCHOR_TYPES[category], familyCriteria(category, patientId));
}

/** Binds canView to one auth/me answer. permissionsFor() returns the mock's `session.permissions` shape. */
export function createAccess(me) {
  const valid = isValidMe(me);
  return Object.freeze({
    me,
    valid,
    canView: (patientId, category) => canView(me, patientId, category),
    permissionsFor: patientId => Object.fromEntries(CATEGORIES.map(c => [c, canView(me, patientId, c)])),
    ownPatientIds: () => ownPatientIds(me),
  });
}

/** Fresh auth/me → access. Call on login, role change, focus, after the Bot, and every ~5 s in the family view (API-17). */
export async function loadAccess(client) {
  return createAccess(await client.get('auth/me', { cache: 'no-cache' }));
}
