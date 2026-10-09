// Synthetic discharge presentation. No FHIR, ADT, orders, results, network, or clinical inference.
const localized = (en, es) => Object.freeze({ en, es });

export const DISCHARGE_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Your discharge',
    diagnosis: 'Diagnosis',
    medicines: 'Medicines',
    instructions: 'What to do at home',
    appointment: 'Appointment',
    alarms: 'Return to the Emergency Department if…',
    restricted: 'This section is private',
    unavailable: 'Access has not been confirmed',
    notDocumented: 'Not documented',
    empty: 'None documented in this synthetic example',
    error: 'We could not load discharge information.',
    newLabel: 'NEW',
    continuesLabel: 'CONTINUES',
  }),
  es: Object.freeze({
    title: 'Su alta',
    diagnosis: 'Diagnóstico',
    medicines: 'Medicinas',
    instructions: 'Qué hacer en casa',
    appointment: 'Cita',
    alarms: 'Vuelva a Emergencias si…',
    restricted: 'Esta sección es privada',
    unavailable: 'El acceso no está confirmado',
    notDocumented: 'No documentado',
    empty: 'Ninguno documentado en este ejemplo sintético',
    error: 'No pudimos cargar la información del alta.',
    newLabel: 'NUEVA',
    continuesLabel: 'SIGUE',
  }),
});

export const SYNTHETIC_DISCHARGE_FIXTURE = Object.freeze({
  diagnosis: 'Pulmonía (neumonía) adquirida en la comunidad',
  homeInstructions: null,
  medicines: Object.freeze([
    Object.freeze({ id: 'amoxicillin-clavulanate', name: 'Amoxicilina/clavulanato', strength: '875 mg', directions: localized('Every 12 hours for 7 days', 'Cada 12 horas por 7 días'), label: 'NEW' }),
    Object.freeze({ id: 'metformin', name: 'Metformina', strength: '500 mg', directions: null, label: 'CONTINUES' }),
    Object.freeze({ id: 'lisinopril', name: 'Lisinopril', strength: '10 mg', directions: null, label: 'CONTINUES' }),
  ]),
  alarms: Object.freeze([
    'Falta de aire',
    'Fiebre de más de 101 °F después de 3 días',
    'Confusión',
    'Dolor de pecho',
  ]),
  appointment: Object.freeze({
    startsAt: '2026-10-16T14:00:00Z',
    mode: localized('Telemedicine', 'Telemedicina'),
    clinician: 'Dra. Ana Colón',
  }),
});

const permissionState = value => value === true ? 'allowed' : value === false ? 'restricted' : 'unavailable';
const emptySection = (status, message) => ({ status, message, items: [] });

function formatPuertoRicoDateTime(value, language) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', {
    timeZone: 'America/Puerto_Rico',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function createDischargeModel(options = {}) {
  const language = Object.hasOwn(DISCHARGE_COPY, options.language) ? options.language : 'en';
  const copy = DISCHARGE_COPY[language];
  if (options.state === 'loading') return { language, copy, status: 'loading', message: null, discharge: null };
  if (options.state === 'error') return { language, copy, status: 'error', message: copy.error, discharge: null };
  if (options.visit?.status !== 'finished' || options.visit?.disposition !== 'home') {
    return { language, copy, status: 'empty', message: null, discharge: null };
  }

  const data = options.data ?? {};
  const diagnosis = typeof data.diagnosis === 'string' && data.diagnosis
    ? { status: 'ready', value: data.diagnosis }
    : { status: 'not-documented', value: null };
  const alarms = Array.isArray(data.alarms)
    ? { status: data.alarms.length ? 'ready' : 'empty', items: [...data.alarms] }
    : { status: 'not-documented', items: [] };

  const medicinePermission = permissionState(options.permissions?.medicines);
  let medicines;
  if (medicinePermission !== 'allowed') {
    medicines = emptySection(medicinePermission, copy[medicinePermission]);
  } else if (!Array.isArray(data.medicines)) {
    medicines = emptySection('not-documented', copy.notDocumented);
  } else if (!data.medicines.length) {
    medicines = emptySection('empty', copy.empty);
  } else {
    medicines = {
      status: 'ready',
      message: null,
      items: data.medicines.map(item => ({
        id: item.id,
        name: item.name,
        strength: item.strength ?? null,
        directions: item.directions?.[language] ?? item.directions?.en ?? null,
        label: item.label === 'NEW' ? 'NEW' : item.label === 'CONTINUES' ? 'CONTINUES' : null,
        labelText: item.label === 'NEW' ? copy.newLabel : item.label === 'CONTINUES' ? copy.continuesLabel : null,
      })),
    };
  }

  const instructionPermission = permissionState(options.permissions?.instructions);
  let instructions;
  let appointment;
  if (instructionPermission !== 'allowed') {
    instructions = { status: instructionPermission, message: copy[instructionPermission], value: null };
    appointment = { status: instructionPermission, message: copy[instructionPermission], time: null, mode: null, clinician: null };
  } else {
    instructions = typeof data.homeInstructions === 'string' && data.homeInstructions
      ? { status: 'ready', message: null, value: data.homeInstructions }
      : { status: 'not-documented', message: copy.notDocumented, value: null };
    const time = formatPuertoRicoDateTime(data.appointment?.startsAt, language);
    appointment = data.appointment && time
      ? { status: 'ready', message: null, time, mode: data.appointment.mode?.[language] ?? data.appointment.mode?.en ?? null, clinician: data.appointment.clinician ?? null }
      : { status: data.appointment ? 'not-documented' : 'empty', message: data.appointment ? copy.notDocumented : copy.empty, time: null, mode: null, clinician: null };
  }

  return { language, copy, status: 'ready', message: null, diagnosis, alarms, medicines, instructions, appointment };
}
