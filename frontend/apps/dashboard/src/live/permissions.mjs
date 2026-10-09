// API-02: the ONE permission function of the portal. The lock comes from auth/me, never from
// "the search came back empty" or from an error.
export const CATEGORIES = Object.freeze(['visita', 'medicinas', 'instrucciones', 'estudios']);

/** Representative resource type per category (contract API-02). */
export const REPRESENTATIVE_TYPES = Object.freeze({
  visita: 'Encounter',
  medicinas: 'MedicationRequest',
  instrucciones: 'CarePlan',
  estudios: 'DiagnosticReport',
});

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True if the criteria string names this patient id as a whole token (not a substring of another id). */
export function criteriaMentions(criteria, patientId) {
  return new RegExp(`(^|[=/,|?&])${escape(patientId)}($|[&,|])`).test(criteria);
}

/**
 * canView(me, patientId, category): may this session see `category` of `patientId`?
 * - Own patient ("Mi salud": profile is that Patient) → always true.
 * - Otherwise: auth/me accessPolicy.resource[] must have an entry of the representative type whose
 *   criteria names the patient (or has no criteria).
 * Fails closed: unknown category, missing patient or missing policy → false.
 */
export function canView(me, patientId, category) {
  if (typeof patientId !== 'string' || !patientId || !CATEGORIES.includes(category)) return false;
  const profile = me?.profile;
  if (profile?.resourceType === 'Patient' && profile.id === patientId) return true;
  const entries = me?.accessPolicy?.resource;
  if (!Array.isArray(entries)) return false;
  const type = REPRESENTATIVE_TYPES[category];
  return entries.some(e => e?.resourceType === type && (!e.criteria || criteriaMentions(e.criteria, patientId)));
}

/** Binds canView to one auth/me answer. permissionsFor() returns the mock's `session.permissions` shape. */
export function createAccess(me) {
  return Object.freeze({
    me,
    canView: (patientId, category) => canView(me, patientId, category),
    permissionsFor: patientId => Object.fromEntries(CATEGORIES.map(c => [c, canView(me, patientId, c)])),
  });
}

/** Fresh auth/me → access. Call on login, role change, focus, after the Bot, and every ~5 s in the family view (API-17). */
export async function loadAccess(client) {
  return createAccess(await client.get('auth/me', { cache: 'no-cache' }));
}
