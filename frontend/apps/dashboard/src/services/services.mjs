// Provisional local mock for AYO-98. No geolocation, maps, FHIR, network, or persistence.
// Unknown wait and plan-acceptance fields stay null until an approved source provides them.
const localized = (en, es) => Object.freeze({ en, es });

export const SERVICES_DICTIONARIES = Object.freeze({
  en: Object.freeze({
    title: 'Services',
    directoryNotice: 'General fictional directory — the same for every account. Not personalized and not evidence of health plan coverage. Distances use an example origin, not your location; no GPS is requested.',
    loading: 'Loading services…',
    error: 'We could not load services.',
    empty: 'No services loaded',
    retry: 'Try again',
    distance: 'Distance from example origin',
    estimatedWait: 'Estimated wait (simulated)',
    planAcceptance: 'Health plan acceptance',
    acceptsPlan: 'Accepts your plan',
    doesNotAcceptPlan: 'Does not accept your plan',
    notDocumented: 'Not documented',
  }),
  es: Object.freeze({
    title: 'Servicios',
    directoryNotice: 'Directorio general ficticio: igual para todas las cuentas. No es personalizado ni confirma cobertura del plan. Las distancias usan un origen de ejemplo, no su ubicación; no se solicita GPS.',
    loading: 'Cargando servicios…',
    error: 'No pudimos cargar los servicios.',
    empty: 'No hay servicios cargados',
    retry: 'Intentar de nuevo',
    distance: 'Distancia desde un origen de ejemplo',
    estimatedWait: 'Espera estimada (simulada)',
    planAcceptance: 'Aceptación del plan',
    acceptsPlan: 'Acepta su plan',
    doesNotAcceptPlan: 'No acepta su plan',
    notDocumented: 'No documentado',
  }),
});

export const SYNTHETIC_SERVICES = Object.freeze([
  Object.freeze({
    id: 'demo-hospital-emergency',
    name: localized('Demo Hospital Emergency Department', 'Emergencias del Hospital Demo'),
    type: localized('Emergency services', 'Servicios de Emergencias'),
    distanceKm: 3.2,
    estimatedWait: null,
    acceptsPlan: null,
  }),
  Object.freeze({
    id: 'jayuya-demo-cdt',
    name: localized('Jayuya Demo CDT', 'CDT Demo de Jayuya'),
    type: localized('Diagnostic and treatment center', 'Centro de Diagnóstico y Tratamiento'),
    distanceKm: 14.8,
    estimatedWait: null,
    acceptsPlan: null,
  }),
  Object.freeze({
    id: 'health-plan-telemedicine',
    name: localized('Health plan telemedicine', 'Telemedicina del plan'),
    type: localized('Telemedicine', 'Telemedicina'),
    distanceKm: null,
    estimatedWait: null,
    acceptsPlan: null,
  }),
  Object.freeze({
    id: 'primary-care-ana-colon',
    name: localized('Dr. Ana Colón, primary care physician', 'Dra. Ana Colón, médico primario'),
    type: localized('Primary care', 'Cuidado primario'),
    distanceKm: 2.1,
    estimatedWait: null,
    acceptsPlan: null,
  }),
]);

export function createServicesModel({ language = 'en', state = 'list', services = SYNTHETIC_SERVICES } = {}) {
  const resolvedLanguage = Object.hasOwn(SERVICES_DICTIONARIES, language) ? language : 'en';
  const copy = SERVICES_DICTIONARIES[resolvedLanguage];
  const sourceItems = Array.isArray(services) ? services : [];
  const requestedState = ['loading', 'error', 'empty', 'list'].includes(state) ? state : 'error';
  const resolvedState = requestedState === 'list' && sourceItems.length === 0 ? 'empty' : requestedState;
  const items = resolvedState === 'list' ? sourceItems.map(service => ({
    id: service.id,
    name: service.name?.[resolvedLanguage] ?? service.name?.en ?? null,
    type: service.type?.[resolvedLanguage] ?? service.type?.en ?? null,
    distanceKm: Number.isFinite(service.distanceKm) ? service.distanceKm : null,
    estimatedWait: service.estimatedWait?.[resolvedLanguage] ?? service.estimatedWait?.en ?? service.estimatedWait ?? null,
    acceptsPlan: typeof service.acceptsPlan === 'boolean' ? service.acceptsPlan : null,
  })) : [];
  return {
    language: resolvedLanguage,
    state: resolvedState,
    copy,
    message: resolvedState === 'list' ? null : copy[resolvedState],
    items,
  };
}
