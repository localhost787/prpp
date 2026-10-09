// AccessPolicies of the Bots (canon §5: the minimum each one needs).

const WRITE = ['create', 'read', 'vread', 'search', 'update', 'history'];
const READ = ['read', 'vread', 'search'];

/** hl7-a-fhir: reads the patient and fixed data; writes only the visit data it translates. */
export const HL7_BOT_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'Bot hl7-a-fhir',
  resource: [
    ...['Patient', 'Practitioner', 'Location', 'Organization'].map((resourceType) => ({ resourceType, interaction: READ })),
    ...[
      'Encounter',
      'Observation',
      'Task',
      'Communication',
      'ServiceRequest',
      'Specimen',
      'DiagnosticReport',
      'MedicationAdministration',
    ].map((resourceType) => ({ resourceType, interaction: WRITE })),
    { resourceType: 'Provenance', interaction: ['create'] },
  ],
};

/**
 * compartir-familia: reads policies and the family member, writes the Consent.
 * It also rewrites ProjectMembership.access, a project-admin-only type in Medplum 5.1.42
 * (server/src/fhir/accesspolicy.ts: non-admin memberships drop ProjectMembership from any policy),
 * so its membership is admin:true + this policy. Tested in POR-48 (see docs/BITACORA-noche.md).
 */
export const SHARING_BOT_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'Bot compartir-familia',
  resource: [
    { resourceType: 'AccessPolicy', interaction: READ },
    { resourceType: 'RelatedPerson', interaction: READ },
    { resourceType: 'Consent', interaction: WRITE },
  ],
};
