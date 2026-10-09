// AccessPolicy of the hospital simulator client (API-27, canon §5: minimum needed).
// - run the translator Bot (hl7-a-fhir): read that Bot only
// - publish the discharge (POR-46) and reset the visit (POR-42): create/read/search/delete the 11 visit types
// - find the patient by MRN: read Patient
// Anything else (Practitioner, AccessPolicy, ProjectMembership...) -> 403.

export const VISIT_TYPES = [
  'Encounter',
  'Task',
  'Communication',
  'ServiceRequest',
  'Specimen',
  'DiagnosticReport',
  'Observation',
  'MedicationAdministration',
  'MedicationRequest',
  'Appointment',
  'CarePlan',
];

export const SIMULATOR_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'Simulador del hospital',
  resource: [
    { resourceType: 'Bot', readonly: true, criteria: 'Bot?name=hl7-a-fhir' },
    { resourceType: 'Patient', readonly: true },
    ...VISIT_TYPES.map((resourceType) => ({
      resourceType,
      interaction: ['create', 'read', 'vread', 'search', 'delete'],
    })),
  ],
};
