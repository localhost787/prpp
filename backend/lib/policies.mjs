// AccessPolicies of the portal (contract §1.6, API-02, API-11, API-18).
// One family policy per sharing category, parameterized by %patient. A family membership has one
// `access[]` entry per shared category for each patient; "no access" = FAMILY_NONE, never an empty membership.
//
// Medplum 5.1.42 answers 403 to search/read when a resource type is missing from the policy
// (tested on the cloud server, see docs/BITACORA-noche.md). The canon wants an empty Bundle / 404,
// so every family policy also lists every clinical type with a criterion that matches nothing.

export const SYSTEMS = {
  mrn: 'urn:hospital-demo:mrn',
  visit: 'urn:hospital-demo:visita',
  order: 'urn:hospital-demo:orden',
  stageTask: 'urn:hospital-demo:etapa',
  task: 'urn:portal:tarea',
  notice: 'urn:portal:aviso',
  share: 'urn:portal:compartir',
  origin: 'urn:portal:origen',
  confidentiality: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
};

/** Excludes resources labeled R (restricted). Goes on every clinical criterion of family policies. */
export const NOT_SENSITIVE = `_security:not=${SYSTEMS.confidentiality}|R`;

/** Matches nothing: no resource has this id. Used to answer "empty" instead of 403. */
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

export const CATEGORIES = ['visita', 'medicinas', 'instrucciones', 'estudios'];

/** Clinical types a family member may ever read, by category. Communication is split by notice category. */
const CATEGORY_TYPES = {
  visita: ['Patient', 'Encounter', 'Task'],
  medicinas: ['MedicationAdministration', 'MedicationRequest'],
  instrucciones: ['CarePlan', 'Appointment'],
  estudios: ['ServiceRequest', 'Specimen', 'DiagnosticReport', 'Observation'],
};
const CATEGORY_NOTICES = {
  visita: ['visita'],
  medicinas: ['medicina'],
  instrucciones: [],
  estudios: ['estudios', 'resultado'],
};

/** Every clinical type the patient's visit can produce (also the simulator's reset list + Consent etc.). */
export const FAMILY_CLINICAL_TYPES = [...Object.values(CATEGORY_TYPES).flat(), 'Communication'];

const ALWAYS_READABLE = ['Practitioner', 'Location', 'Organization'].map((resourceType) => ({
  resourceType,
  readonly: true,
}));

const OWN_SUBSCRIPTION = { resourceType: 'Subscription', criteria: 'Subscription?type=websocket&author=%profile' };

/** Entries that make every clinical type searchable (empty result) instead of 403. */
const NO_MATCH_ENTRIES = FAMILY_CLINICAL_TYPES.map((resourceType) => ({
  resourceType,
  readonly: true,
  criteria: `${resourceType}?_id=${NO_MATCH_ID}`,
}));

function patientParamCriteria(resourceType) {
  if (resourceType === 'Patient') {
    return `Patient?_id=%patient.id&${NOT_SENSITIVE}`;
  }
  return `${resourceType}?patient=%patient&${NOT_SENSITIVE}`;
}

function categoryEntries(category) {
  const entries = CATEGORY_TYPES[category].map((resourceType) => ({
    resourceType,
    readonly: true,
    criteria: patientParamCriteria(resourceType),
    ...(resourceType === 'Patient' ? { hiddenFields: ['identifier', 'address', 'telecom'] } : {}),
  }));
  for (const notice of CATEGORY_NOTICES[category]) {
    entries.push({
      resourceType: 'Communication',
      readonly: true,
      criteria: `Communication?subject=%patient&category=${SYSTEMS.notice}|${notice}&${NOT_SENSITIVE}`,
    });
  }
  return entries;
}

const FAMILY_NAMES = {
  visita: 'Familiar: estado en Emergencias',
  medicinas: 'Familiar: medicinas',
  instrucciones: 'Familiar: instrucciones del alta',
  estudios: 'Familiar: estudios y resultados',
};

/** Family policy for one category (read-only, only that patient, never R-labeled). */
export function familyPolicy(category) {
  return {
    resourceType: 'AccessPolicy',
    name: FAMILY_NAMES[category],
    resource: [...categoryEntries(category), ...NO_MATCH_ENTRIES, ...ALWAYS_READABLE, OWN_SUBSCRIPTION],
  };
}

/** "Familiar sin acceso": sees nothing clinical, but searches answer empty (not 403). */
export const FAMILY_NONE = {
  resourceType: 'AccessPolicy',
  name: 'Familiar sin acceso',
  resource: [...NO_MATCH_ENTRIES, ...ALWAYS_READABLE, OWN_SUBSCRIPTION],
};

/** Patient types readable through the patient compartment (own record, including R-labeled data). */
const PATIENT_COMPARTMENT_TYPES = [
  'Encounter',
  'Task',
  'Communication',
  'ServiceRequest',
  'Specimen',
  'DiagnosticReport',
  'Observation',
  'MedicationAdministration',
  'MedicationRequest',
  'CarePlan',
  'Appointment',
  'Condition',
  'AllergyIntolerance',
  'Immunization',
  'MedicationStatement',
  'Procedure',
  'Coverage',
  'DocumentReference',
  'Claim',
  'ClaimResponse',
  'Provenance',
  'Goal',
  'CareTeam',
  'ImagingStudy',
];

function fhirpath(expressions) {
  return expressions.map((expression) => ({ language: 'text/fhirpath', expression }));
}

/** "Paciente (portal)": the patient reads her whole record; creates only what the contract lists. */
export const PATIENT_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'Paciente (portal)',
  resource: [
    { resourceType: 'Patient', readonly: true, criteria: 'Patient?_id=%patient.id' },
    ...PATIENT_COMPARTMENT_TYPES.map((resourceType) => ({
      resourceType,
      readonly: true,
      criteria: `${resourceType}?_compartment=%patient`,
    })),
    { resourceType: 'Consent', readonly: true, criteria: 'Consent?patient=%patient' },
    { resourceType: 'RelatedPerson', readonly: true, criteria: 'RelatedPerson?patient=%patient' },
    { resourceType: 'Person', readonly: true, criteria: 'Person?patient=%patient' },
    { resourceType: 'AuditEvent', readonly: true, criteria: 'AuditEvent?entity=%patient' },
    { resourceType: 'Bot', readonly: true, criteria: 'Bot?name=compartir-familia' },
    { resourceType: 'HealthcareService', readonly: true },
    { resourceType: 'Questionnaire', readonly: true },
    // API-20 and API-22: the patient creates these (and reads them back).
    {
      resourceType: 'AppointmentResponse',
      criteria: 'AppointmentResponse?actor=%patient',
      interaction: ['create', 'read', 'search', 'vread', 'history'],
      writeConstraint: fhirpath(["actor.reference = '%patient'"]),
    },
    {
      resourceType: 'QuestionnaireResponse',
      criteria: 'QuestionnaireResponse?subject=%patient',
      interaction: ['create', 'read', 'search', 'vread', 'history'],
      writeConstraint: fhirpath([
        "subject.reference = '%patient'",
        "author.exists().not() or author.reference = '%patient'",
        "source.exists().not() or source.reference = '%patient'",
        'encounter.exists().not() and basedOn.exists().not() and partOf.exists().not()',
      ]),
    },
    // API-25: non-urgent question to the nurse. Only about herself and only with category "pregunta".
    // Write constraints (FHIRPath, checked by the server on every write): exactly one category "pregunta",
    // about herself, sent by herself, only to staff. Without them she could forge hospital notices
    // ("visita"/"resultado" categories, another sender) or drop a message into another patient's record.
    {
      resourceType: 'Communication',
      criteria: `Communication?subject=%patient&category=${SYSTEMS.notice}|pregunta`,
      interaction: ['create', 'read', 'search', 'vread'],
      writeConstraint: fhirpath([
        "subject.reference = '%patient'",
        `category.count() = 1 and category.coding.count() = 1 and category.coding.system = '${SYSTEMS.notice}' and category.coding.code = 'pregunta'`,
        "sender.exists().not() or sender.reference = '%patient'",
        "recipient.all(reference.startsWith('Practitioner/'))",
        'about.exists().not() and partOf.exists().not() and inResponseTo.exists().not() and basedOn.exists().not() and encounter.exists().not()',
      ]),
    },
    ...ALWAYS_READABLE,
    OWN_SUBSCRIPTION,
  ],
};

export const ALL_PORTAL_POLICIES = [PATIENT_POLICY, FAMILY_NONE, ...CATEGORIES.map(familyPolicy)];
