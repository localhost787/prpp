// Bot "pre-registro" (POR-55, API-22): when a patient sends the pre-registration form
// (QuestionnaireResponse of Questionnaire "pre-registro"), it creates or updates her PLANNED ER visit
// (Encounter status planned, class EMER) and her Coverage (plan named in the form).
// Triggered by a Subscription (rest-hook to this Bot) on QuestionnaireResponse?questionnaire=<url>.
// EMTALA: it never touches the stage Task, the queue or any visit already in progress.
// Idempotent: one planned visit per patient (identifier urn:portal:prerregistro|<patient id>);
// sending the form again updates the same Encounter. When the A04 arrives, hl7-a-fhir takes this
// planned Encounter as the visit (same id) and gives it the visit number.
// Runs as a vmcontext Bot: plain CommonJS, no imports.

const QUESTIONNAIRE_URL = 'https://prpp.example/fhir/Questionnaire/pre-registro';
const SYS = {
  prereg: 'urn:portal:prerregistro',
  preregPlan: 'urn:portal:prerregistro-plan',
  org: 'urn:hospital-demo:org',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
};
const NO_CACHE = { cache: 'no-cache' };

/** Answers by linkId, flattening groups. */
function answers(items, out = {}) {
  for (const item of items || []) {
    const a = item.answer && item.answer[0];
    if (a) {
      out[item.linkId] =
        a.valueString ?? a.valueDate ?? a.valueBoolean ?? a.valueInteger ?? (a.valueCoding && (a.valueCoding.display || a.valueCoding.code));
    }
    answers(item.item, out);
  }
  return out;
}

function clean(text, max) {
  return typeof text === 'string' ? text.trim().slice(0, max) : undefined;
}

async function upsert(medplum, wanted, isSame) {
  const { system, value } = wanted.identifier[0];
  const found = await medplum.searchResources(wanted.resourceType, { identifier: `${system}|${value}` }, NO_CACHE);
  if (found.length > 1) {
    throw new Error(`${wanted.resourceType} ${value} duplicado`);
  }
  const current = found[0];
  if (!current) {
    return { resource: await medplum.createResource(wanted), created: true };
  }
  if (isSame(current)) {
    return { resource: current, created: false };
  }
  const updated = await medplum.updateResource(
    { ...current, ...wanted, id: current.id, meta: { ...current.meta } },
    { headers: { 'If-Match': `W/"${current.meta.versionId}"` } }
  );
  return { resource: updated, created: false };
}

async function handler(medplum, event) {
  const qr = event.input;
  if (!qr || qr.resourceType !== 'QuestionnaireResponse') {
    throw new Error('Se esperaba una QuestionnaireResponse');
  }
  if (qr.questionnaire !== QUESTIONNAIRE_URL || qr.status !== 'completed') {
    return { ok: false, motivo: 'No es un pre-registro completado' };
  }
  const subjectRef = qr.subject && qr.subject.reference;
  if (!/^Patient\/[A-Za-z0-9-]{1,64}$/.test(subjectRef || '')) {
    throw new Error('El pre-registro no dice de qué paciente es');
  }
  // Only the patient herself (the patient policy requires subject = author = her).
  if (qr.author && qr.author.reference && qr.author.reference !== subjectRef) {
    throw new Error('El pre-registro solo lo envía la paciente');
  }
  const patient = await medplum.readReference({ reference: subjectRef });
  const a = answers(qr.item);

  // A visit already in progress is never touched: the planned visit is only for a future arrival.
  const reason = clean(a['motivo-texto'], 500);
  const org = await medplum.searchOne('Organization', { identifier: `${SYS.org}|hospital-demo` }, NO_CACHE);
  const encounter = {
    resourceType: 'Encounter',
    identifier: [{ system: SYS.prereg, value: patient.id }],
    status: 'planned',
    class: { system: SYS.actCode, code: 'EMER', display: 'emergency' },
    subject: { reference: `Patient/${patient.id}` },
    ...(reason ? { reasonCode: [{ text: reason }] } : {}),
    ...(org ? { serviceProvider: { reference: `Organization/${org.id}`, display: org.name } } : {}),
  };
  const enc = await upsert(medplum, encounter, (cur) => cur.status === 'planned' && JSON.stringify(cur.reasonCode) === JSON.stringify(encounter.reasonCode));

  let coverage;
  const planName = clean(a['plan-nombre'], 120);
  if (planName) {
    const memberId = clean(a['plan-numero'], 60);
    const wanted = {
      resourceType: 'Coverage',
      identifier: [{ system: SYS.preregPlan, value: patient.id }],
      status: 'active',
      beneficiary: { reference: `Patient/${patient.id}` },
      payor: [{ display: planName }],
      ...(memberId ? { subscriberId: memberId } : {}),
    };
    coverage = (
      await upsert(
        medplum,
        wanted,
        (cur) => cur.status === 'active' && cur.payor?.[0]?.display === planName && cur.subscriberId === wanted.subscriberId
      )
    ).resource;
  }
  return {
    ok: true,
    encounter: `Encounter/${enc.resource.id}`,
    nueva: enc.created,
    ...(coverage ? { coverage: `Coverage/${coverage.id}` } : {}),
  };
}

exports.handler = handler;
module.exports.QUESTIONNAIRE_URL = QUESTIONNAIRE_URL;
