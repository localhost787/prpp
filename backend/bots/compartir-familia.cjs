// Bot "compartir-familia" (API-16, API-17 · POR-48, POR-49, POR-99).
// The patient picks, for ONE family member, which of the 4 categories that person may see.
// Input (application/json): { familiar: "<RelatedPerson id>", compartir: ["visita" | "medicinas" | "instrucciones" | "estudios"] }
// Output: { ok: true, compartir: [...final list, with "visita" added when not empty], familiares: [name] }
//
// What it changes (the server is the source of truth, the Consent is only the record):
// - In that person's ProjectMembership, replaces ONLY the access[] entries whose `patient` parameter is the
//   calling patient: one entry per category, or "Familiar sin acceso" when the list is empty. Other entries
//   (e.g. Lourdes' own "Mi salud") are kept. The membership is never left without entries.
// - Writes are conditional on the version (If-Match); on 412 it re-reads and retries.
// - Upserts ONE Consent per (patient, person) with the decision.
//
// The same file is required by the setup scripts (seed) so both paths share one implementation.
// Runs as a vmcontext Bot: plain CommonJS, no imports.

const SHARE_SYSTEM = 'urn:portal:compartir';
const CATEGORIES = ['visita', 'medicinas', 'instrucciones', 'estudios'];
const POLICY_NAMES = {
  visita: 'Familiar: estado en Emergencias',
  medicinas: 'Familiar: medicinas',
  instrucciones: 'Familiar: instrucciones del alta',
  estudios: 'Familiar: estudios y resultados',
  none: 'Familiar sin acceso',
};
const MAX_ATTEMPTS = 3;
const NO_CACHE = { cache: 'no-cache' };

function badInput(message) {
  const err = new Error(message);
  err.outcome = { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid', details: { text: message } }] };
  return err;
}

/** Validates and orders the requested categories; adds "visita" (the base) when anything is shared. */
function normalizeShare(share) {
  if (!Array.isArray(share)) {
    throw badInput('compartir debe ser una lista');
  }
  for (const c of share) {
    if (!CATEGORIES.includes(c)) {
      throw badInput(`Categoría desconocida: ${c}`);
    }
  }
  const set = new Set(share);
  if (set.size > 0) {
    set.add('visita');
  }
  return CATEGORIES.filter((c) => set.has(c));
}

async function loadPolicies(medplum) {
  const out = {};
  for (const [key, name] of Object.entries(POLICY_NAMES)) {
    const policy = await medplum.searchOne('AccessPolicy', { 'name:exact': name }, NO_CACHE);
    if (!policy) {
      throw new Error(`Falta la AccessPolicy "${name}"`);
    }
    out[key] = policy;
  }
  return out;
}

function patientParam(entry) {
  return entry.parameter?.find((p) => p.name === 'patient')?.valueReference?.reference;
}

function entryFor(policy, patientRef) {
  return {
    policy: { reference: `AccessPolicy/${policy.id}`, display: policy.name },
    parameter: [{ name: 'patient', valueReference: { reference: patientRef } }],
  };
}

function isPreconditionFailed(err) {
  return err?.outcome?.issue?.[0]?.code === 'conflict' || /412|precondition/i.test(String(err?.message));
}

async function updateMembership(medplum, relatedPersonId, patientRef, share, policies) {
  const mine = share.length ? share.map((c) => entryFor(policies[c], patientRef)) : [entryFor(policies.none, patientRef)];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const membership = await medplum.searchOne('ProjectMembership', { profile: `RelatedPerson/${relatedPersonId}` }, NO_CACHE);
    if (!membership) {
      throw new Error(`RelatedPerson/${relatedPersonId} no tiene cuenta`);
    }
    const access = membership.access ?? [];
    const keep = access.filter((a) => patientParam(a) !== patientRef);
    const current = access.filter((a) => patientParam(a) === patientRef).map((a) => a.policy?.reference);
    const wanted = mine.map((a) => a.policy.reference);
    if (JSON.stringify(current) === JSON.stringify(wanted)) {
      return { membership, changed: false };
    }
    const next = [...keep, ...mine];
    if (next.length === 0) {
      throw new Error('Una membresía nunca queda sin entradas');
    }
    try {
      const updated = await medplum.updateResource(
        { ...membership, access: next },
        { headers: { 'If-Match': `W/"${membership.meta.versionId}"` } }
      );
      return { membership: updated, changed: true };
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isPreconditionFailed(err)) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('No se pudo guardar: la membresía cambió muchas veces');
}

function consentFor(patientRef, relatedPersonId, share, existing) {
  const permit = share.length > 0;
  return {
    ...(existing ?? {}),
    resourceType: 'Consent',
    status: permit ? 'active' : 'inactive',
    scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
    category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0', display: 'Patient Consent' }] }],
    patient: { reference: patientRef },
    dateTime: new Date().toISOString(),
    policyRule: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: permit ? 'OPTIN' : 'OPTOUT' }],
    },
    provision: {
      type: permit ? 'permit' : 'deny',
      actor: [
        {
          role: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass', code: 'CAREGIVER' }] },
          reference: { reference: `RelatedPerson/${relatedPersonId}` },
        },
      ],
      ...(permit ? { class: share.map((code) => ({ system: SHARE_SYSTEM, code })) } : {}),
    },
  };
}

/** One Consent per (patient, person): created once, then new versions. */
async function upsertConsent(medplum, patientRef, relatedPersonId, share) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const found = await medplum.searchResources(
      'Consent',
      { patient: patientRef, actor: `RelatedPerson/${relatedPersonId}`, _sort: '-_lastUpdated' },
      NO_CACHE
    );
    const existing = found[0];
    if (!existing) {
      return medplum.createResource(consentFor(patientRef, relatedPersonId, share));
    }
    const sameClasses = JSON.stringify((existing.provision?.class ?? []).map((c) => c.code)) === JSON.stringify(share);
    if (sameClasses && existing.status === (share.length ? 'active' : 'inactive')) {
      return existing;
    }
    try {
      return await medplum.updateResource(consentFor(patientRef, relatedPersonId, share, existing), {
        headers: { 'If-Match': `W/"${existing.meta.versionId}"` },
      });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isPreconditionFailed(err)) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('No se pudo guardar el Consent');
}

/** Core logic, shared by the Bot and the seed scripts. */
async function applySharing(medplum, { patientRef, relatedPersonId, share, policies }) {
  const finalShare = normalizeShare(share);
  const loaded = policies ?? (await loadPolicies(medplum));
  const { changed } = await updateMembership(medplum, relatedPersonId, patientRef, finalShare, loaded);
  const consent = await upsertConsent(medplum, patientRef, relatedPersonId, finalShare);
  return { share: finalShare, changed, consent };
}

async function handler(medplum, event) {
  const requester = event.requester?.reference;
  if (!requester || !requester.startsWith('Patient/')) {
    throw badInput('Solo la paciente puede cambiar lo que comparte');
  }
  const input = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
  const familiar = String(input?.familiar ?? '').replace(/^RelatedPerson\//, '');
  if (!familiar) {
    throw badInput('Falta el familiar');
  }
  let relatedPerson;
  try {
    relatedPerson = await medplum.readResource('RelatedPerson', familiar, NO_CACHE);
  } catch {
    relatedPerson = undefined;
  }
  // Same message for "does not exist" and "not yours": never reveal other patients' family.
  if (relatedPerson?.patient?.reference !== requester) {
    throw badInput('Ese familiar no está en su lista');
  }
  const result = await applySharing(medplum, { patientRef: requester, relatedPersonId: familiar, share: input?.compartir });
  const name = relatedPerson.name?.[0];
  return {
    ok: true,
    compartir: result.share,
    familiares: [[name?.given?.join(' '), name?.family].filter(Boolean).join(' ')],
  };
}

exports.handler = handler;
module.exports.applySharing = applySharing;
module.exports.normalizeShare = normalizeShare;
module.exports.POLICY_NAMES = POLICY_NAMES;
