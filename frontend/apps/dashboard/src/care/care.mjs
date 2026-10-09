// Provisional local mock for AYO-89. No Medplum reads, writes, subscriptions, or persistence.
// Clinical values come only from the AYO-89 synthetic case; unknown fields stay null.
export const CARE_DICTIONARIES = Object.freeze({
  en: Object.freeze({
    title: 'My care',
    provisional: 'Provisional synthetic example',
    teamTitle: 'Who is caring for you',
    instructionsTitle: 'What to do now',
    medicinesTitle: 'Medicines given today',
    emergencyPhysician: 'Emergency physician',
    teamPrivate: 'Care-team information is private',
    instructionsPrivate: 'Current instructions are private',
    medicinesPrivate: name => `${name}'s medicines are private`,
    accessUnavailable: 'Access has not been confirmed',
    noInstructions: 'No current instructions are documented in this synthetic case',
    noMedicines: 'No medicines are documented in this synthetic case',
    doseLabel: 'Dose',
    routeLabel: 'How it was given',
    timeLabel: 'Time',
    purposeLabel: 'Purpose',
    notDocumented: 'Not documented in this synthetic case',
    additionalMock: 'Additional mock item',
  }),
  es: Object.freeze({
    title: 'Mi cuidado',
    provisional: 'Ejemplo sintético provisional',
    teamTitle: 'Quién le atiende',
    instructionsTitle: 'Qué hacer ahora',
    medicinesTitle: 'Medicinas que le dieron hoy',
    emergencyPhysician: 'Médica de Emergencias',
    teamPrivate: 'La información del equipo de cuidado es privada',
    instructionsPrivate: 'Las indicaciones actuales son privadas',
    medicinesPrivate: name => `Las medicinas de ${name} son privadas`,
    accessUnavailable: 'El acceso no está confirmado',
    noInstructions: 'No hay indicaciones actuales documentadas en este caso sintético',
    noMedicines: 'No hay medicinas documentadas en este caso sintético',
    doseLabel: 'Dosis',
    routeLabel: 'Cómo se administró',
    timeLabel: 'Hora',
    purposeLabel: 'Para qué',
    notDocumented: 'No documentado en este caso sintético',
    additionalMock: 'Elemento mock adicional',
  }),
});

export const CARMEN_CARE_FIXTURE = Object.freeze({
  participant: Object.freeze({
    id: 'practitioner-ana-ramos',
    name: Object.freeze({ en: 'Dr. Ana Ramos', es: 'Dra. Ana Ramos' }),
    roleKey: 'emergencyPhysician',
    location: Object.freeze({ en: 'Cubicle 12', es: 'Cubículo 12' }),
  }),
  instructions: Object.freeze([
    Object.freeze({
      id: 'instruction-no-food-drink',
      text: Object.freeze({ en: 'Do not eat or drink for now.', es: 'No coma ni beba por ahora.' }),
    }),
  ]),
  medicines: Object.freeze([
    Object.freeze({
      id: 'medication-ceftriaxone',
      name: Object.freeze({ en: 'Ceftriaxone', es: 'Ceftriaxona' }),
      dose: '1 g',
      route: Object.freeze({ en: 'by IV', es: 'por la vena' }),
      time: '10:15 AM',
      purpose: null,
      mockOnly: false,
    }),
    Object.freeze({
      id: 'medication-acetaminophen',
      name: Object.freeze({ en: 'Acetaminophen', es: 'Acetaminofén' }),
      dose: null,
      route: null,
      time: null,
      purpose: null,
      mockOnly: true,
    }),
  ]),
});

const emptySection = (status, message = null) => ({ status, message, items: [] });
const localize = (value, language) => value?.[language] ?? value?.en ?? null;

function permissionState(permission, restrictedMessage, copy) {
  if (permission === false) return emptySection('restricted', restrictedMessage);
  if (permission !== true) return emptySection('unavailable', copy.accessUnavailable);
  return null;
}

export function createCareModel({ language = 'en', patientDisplayName = '', permissions = {}, data = {} } = {}) {
  const resolvedLanguage = Object.hasOwn(CARE_DICTIONARIES, language) ? language : 'en';
  const copy = CARE_DICTIONARIES[resolvedLanguage];

  const teamGate = permissionState(permissions.team, copy.teamPrivate, copy);
  const instructionGate = permissionState(permissions.instructions, copy.instructionsPrivate, copy);
  const medicineGate = permissionState(permissions.medicines, copy.medicinesPrivate(patientDisplayName), copy);

  let team;
  if (teamGate) {
    team = teamGate;
  } else if (!data.participant) {
    team = emptySection('hidden');
  } else {
    team = {
      status: 'ready',
      message: null,
      items: [{
        id: data.participant.id,
        name: localize(data.participant.name, resolvedLanguage),
        role: copy[data.participant.roleKey] ?? null,
        location: localize(data.participant.location, resolvedLanguage),
      }],
    };
  }

  let instructions;
  if (instructionGate) {
    instructions = instructionGate;
  } else {
    const items = (data.instructions ?? []).map(item => ({ id: item.id, text: localize(item.text, resolvedLanguage) }));
    instructions = items.length ? { status: 'ready', message: null, items } : emptySection('empty', copy.noInstructions);
  }

  let medicines;
  if (medicineGate) {
    medicines = medicineGate;
  } else {
    const items = (data.medicines ?? []).map(item => ({
      id: item.id,
      name: localize(item.name, resolvedLanguage),
      dose: item.dose ?? null,
      route: localize(item.route, resolvedLanguage),
      time: item.time ?? null,
      purpose: localize(item.purpose, resolvedLanguage),
      mockOnly: item.mockOnly === true,
    }));
    medicines = items.length ? { status: 'ready', message: null, items } : emptySection('empty', copy.noMedicines);
  }

  return {
    language: resolvedLanguage,
    copy,
    sections: { team, instructions, medicines },
  };
}
