// POR-46 · discharge-data: after the A03 (which carries no prescriptions), the simulator acts as the
// hospital system and publishes the discharge by FHIR. Data from docs/caso-de-prueba.csv ("El alta").
// Everything tagged urn:portal:origen|simulado; idempotent by identifier.

const SYS = {
  discharge: 'urn:hospital-demo:alta',
  visit: 'urn:hospital-demo:visita',
  staff: 'urn:hospital-demo:personal',
  origin: 'urn:portal:origen',
};
const SIMULATED = { tag: [{ system: SYS.origin, code: 'simulado' }] };

/** Next Friday Oct 16 2026, 10:00 AM Puerto Rico (case data, fixed). */
const FOLLOW_UP = { start: '2026-10-16T10:00:00-04:00', end: '2026-10-16T10:30:00-04:00' };

export function dischargeResources({ patient, visit, doctor }) {
  const subject = { reference: `Patient/${patient.id}` };
  const encounter = { reference: `Encounter/${visit.id}` };
  const id = (key) => [{ system: SYS.discharge, value: `${visit.identifier?.[0]?.value}-${key}` }];
  const med = (key, text, dosage, category, note) => ({
    resourceType: 'MedicationRequest',
    meta: SIMULATED,
    identifier: id(key),
    status: 'active',
    intent: 'order',
    category: [{ text: category }],
    medicationCodeableConcept: { text },
    subject,
    encounter,
    authoredOn: visit.period?.end ?? visit.period?.start,
    dosageInstruction: [{ text: dosage }],
    ...(note ? { note: [{ text: note }] } : {}),
  });
  return [
    med(
      'amoxicilina',
      'Amoxicilina/clavulanato 875 mg',
      '1 tableta cada 12 horas por 7 días',
      'nueva',
      'Receta lista en la farmacia.'
    ),
    med('metformina', 'Metformina 500 mg', 'Igual que siempre', 'sigue'),
    med('lisinopril', 'Lisinopril 10 mg', 'Igual que siempre', 'sigue'),
    {
      resourceType: 'CarePlan',
      meta: SIMULATED,
      identifier: id('instrucciones'),
      status: 'active',
      intent: 'plan',
      title: 'Su alta',
      description: 'Pulmonía (neumonía) adquirida en la comunidad',
      subject,
      encounter,
      activity: [
        ...[
          'Tome la medicina nueva todos los días hasta terminarla.',
          'Siga con sus medicinas de siempre.',
          'Vaya a su cita de seguimiento.',
        ].map((description) => ({ detail: { status: 'not-started', description } })),
        ...[
          'Le falta el aire.',
          'Fiebre de más de 101 °F después de 3 días.',
          'Confusión.',
          'Dolor de pecho.',
        ].map((description) => ({ detail: { status: 'not-started', code: { text: 'alarma' }, description } })),
      ],
    },
    {
      resourceType: 'Appointment',
      meta: SIMULATED,
      identifier: id('cita'),
      status: 'booked',
      serviceType: [{ text: 'Telemedicina' }],
      description: 'Cita de seguimiento por telemedicina',
      start: FOLLOW_UP.start,
      end: FOLLOW_UP.end,
      participant: [
        { actor: { ...subject, display: 'Carmen Rivera Colón' }, status: 'needs-action' },
        {
          actor: doctor ? { reference: `Practitioner/${doctor.id}`, display: 'Dra. Ana Colón' } : { display: 'Dra. Ana Colón' },
          status: 'accepted',
        },
      ],
    },
  ];
}

/** Publishes the discharge. Needs the A03 first. Returns a summary per resource. */
export async function publishDischarge(medplum, { mrn = 'MRN-0001', visitNumber = 'V-0001' } = {}) {
  const opts = { cache: 'no-cache' };
  const patient = await medplum.searchOne('Patient', { identifier: `urn:hospital-demo:mrn|${mrn}` }, opts);
  const visit = await medplum.searchOne('Encounter', { identifier: `${SYS.visit}|${visitNumber}` }, opts);
  if (!patient || !visit) {
    throw new Error('No hay visita: corra el tour primero');
  }
  if (visit.status !== 'finished') {
    throw new Error('Primero hay que dar de alta (A03)');
  }
  const doctor = await medplum.searchOne('Practitioner', { identifier: `${SYS.staff}|ana-colon` }, opts);
  const out = [];
  for (const resource of dischargeResources({ patient, visit, doctor })) {
    const { system, value } = resource.identifier[0];
    const existing = await medplum.searchOne(resource.resourceType, { identifier: `${system}|${value}` }, opts);
    if (existing) {
      out.push(`same ${resource.resourceType} ${value}`);
      continue;
    }
    const created = await medplum.createResource(resource);
    out.push(`new  ${resource.resourceType}/${created.id} ${value}`);
  }
  return out;
}
