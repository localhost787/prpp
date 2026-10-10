// Synthetic, local-only family permission model. It does not read or change Consent,
// AccessPolicy, memberships, Bots, auth/me, storage, network, or clinical resources.
export const FAMILY_CATEGORIES = Object.freeze(['status', 'medicines', 'instructions', 'studies']);

const localized = (en, es) => Object.freeze({ en, es });

export const FAMILY_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Family access',
    daughter: 'Daughter',
    spouse: 'Spouse',
    categories: Object.freeze({
      status: 'Emergency status',
      medicines: 'Medicines',
      instructions: 'Discharge instructions and follow-up',
      studies: 'Studies and results',
    }),
    allowed: 'Shared',
    restricted: 'Private',
    unknown: 'Access not confirmed',
    available: 'Available',
    empty: 'No items are loaded in this example',
    error: 'We could not load this category. Try again.',
    loadingPanel: 'Loading family access…',
    errorPanel: 'We could not load family access.',
    removeLocal: 'Turn off access in this local example',
    on: 'On',
    off: 'Off',
  }),
  es: Object.freeze({
    title: 'Acceso de familiares',
    daughter: 'Hija',
    spouse: 'Esposo',
    categories: Object.freeze({
      status: 'Estado en Emergencias',
      medicines: 'Medicinas',
      instructions: 'Instrucciones del alta y cita',
      studies: 'Estudios y resultados',
    }),
    allowed: 'Compartido',
    restricted: 'Privado',
    unknown: 'Acceso no confirmado',
    available: 'Disponible',
    empty: 'No hay elementos cargados en este ejemplo',
    error: 'No pudimos cargar esta categoría. Intente de nuevo.',
    loadingPanel: 'Cargando acceso de familiares…',
    errorPanel: 'No pudimos cargar el acceso de familiares.',
    removeLocal: 'Apagar acceso en este ejemplo local',
    on: 'Activado',
    off: 'Desactivado',
  }),
});

export const FAMILY_PERMISSION_FIXTURE = Object.freeze([
  Object.freeze({
    id: 'lourdes',
    name: 'Lourdes Santiago Rivera',
    relationship: localized('Daughter', 'Hija'),
    permissions: Object.freeze({ status: true, medicines: true, instructions: true, studies: false }),
  }),
]);

const resolveLanguage = language => Object.hasOwn(FAMILY_COPY, language) ? language : 'en';
const permissionState = value => value === true ? 'allowed' : value === false ? 'restricted' : 'unknown';

export function createDelegateFamilyModel({ language = 'en', caregiver, sources = {} } = {}) {
  const resolvedLanguage = resolveLanguage(language);
  const copy = FAMILY_COPY[resolvedLanguage];
  const categories = FAMILY_CATEGORIES.map(id => {
    const permission = permissionState(caregiver?.permissions?.[id]);
    if (permission !== 'allowed') {
      return { id, label: copy.categories[id], permission, state: permission, message: copy[permission], items: [] };
    }

    const source = sources?.[id];
    if (!source) return { id, label: copy.categories[id], permission, state: 'available', message: copy.available, items: [] };
    if (source.status === 'error') return { id, label: copy.categories[id], permission, state: 'error', message: copy.error, items: [] };
    if (source.status === 'empty') return { id, label: copy.categories[id], permission, state: 'empty', message: copy.empty, items: [] };
    if (source.status === 'ready') {
      return { id, label: copy.categories[id], permission, state: 'ready', message: null, items: Array.isArray(source.items) ? [...source.items] : [] };
    }
    return { id, label: copy.categories[id], permission, state: 'available', message: copy.available, items: [] };
  });
  return {
    language: resolvedLanguage,
    copy,
    caregiver: caregiver ? { id: caregiver.id, name: caregiver.name } : null,
    categories,
  };
}

export function createOwnerFamilyModel({ language = 'en', caregivers = [] } = {}) {
  const resolvedLanguage = resolveLanguage(language);
  const copy = FAMILY_COPY[resolvedLanguage];
  const source = (Array.isArray(caregivers) ? caregivers : []).filter(Boolean);
  const ids = source.map(caregiver => caregiver.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    return { language: resolvedLanguage, copy, status: 'error', caregivers: [] };
  }
  return {
    language: resolvedLanguage,
    copy,
    status: 'ready',
    caregivers: source.map(caregiver => ({
      id: caregiver.id,
      name: caregiver.name,
      relationship: caregiver.relationship?.[resolvedLanguage] ?? caregiver.relationship?.en ?? null,
      categories: FAMILY_CATEGORIES.map(id => ({
        id,
        label: copy.categories[id],
        state: permissionState(caregiver.permissions?.[id]),
      })),
    })),
  };
}

export async function changeFamilyPermission({
  caregivers = [],
  caregiverId,
  category,
  enabled,
  save,
} = {}) {
  const original = Array.isArray(caregivers) ? caregivers : [];
  if (!FAMILY_CATEGORIES.includes(category) || typeof enabled !== 'boolean' || typeof save !== 'function') {
    return { status: 'error', caregivers: original, message: 'Could not save. The local example was restored.' };
  }

  let found = false;
  const optimistic = original.map(caregiver => {
    if (caregiver?.id !== caregiverId) return caregiver;
    found = true;
    const permissions = category === 'status' && enabled === false
      ? Object.fromEntries(FAMILY_CATEGORIES.map(id => [id, false]))
      : { ...caregiver.permissions, [category]: enabled };
    if (enabled && category !== 'status') permissions.status = true;
    return { ...caregiver, permissions };
  });
  if (!found) return { status: 'error', caregivers: original, message: 'Could not save. The local example was restored.' };

  try {
    await save({ caregiverId, permissions: optimistic.find(caregiver => caregiver.id === caregiverId).permissions });
    return { status: 'saved', caregivers: optimistic, message: 'Example access settings saved locally.' };
  } catch {
    return { status: 'error', caregivers: original, message: 'Could not save. The local example was restored.' };
  }
}

export async function removeFamilyAccess({ caregivers = [], caregiverId, language = 'en', save } = {}) {
  const original = Array.isArray(caregivers) ? caregivers : [];
  const target = original.find(caregiver => caregiver?.id === caregiverId);
  if (!target || typeof save !== 'function') {
    return { status: 'error', caregivers: original, message: language === 'es' ? 'No se pudo guardar. Se restauró el ejemplo local.' : 'Could not save. The local example was restored.' };
  }
  const permissions = Object.fromEntries(FAMILY_CATEGORIES.map(category => [category, false]));
  const optimistic = original.map(caregiver => caregiver?.id === caregiverId ? { ...caregiver, permissions } : caregiver);
  try {
    await save({ caregiverId, permissions });
    const message = language === 'es'
      ? `El acceso de ${target.name} está apagado en este ejemplo local.`
      : `Access for ${target.name} is off in this local example.`;
    return { status: 'saved', caregivers: optimistic, message };
  } catch {
    return { status: 'error', caregivers: original, message: language === 'es' ? 'No se pudo guardar. Se restauró el ejemplo local.' : 'Could not save. The local example was restored.' };
  }
}

export function createFamilyMutationQueue(initialCaregivers = [], save = async () => {}) {
  let caregivers = initialCaregivers.map(caregiver => ({ ...caregiver, permissions: { ...caregiver.permissions } }));
  let pending = Promise.resolve();
  const enqueue = operation => {
    const result = pending.then(async () => {
      const next = await operation(caregivers);
      if (next.status === 'saved') caregivers = next.caregivers;
      return next;
    });
    pending = result.catch(() => undefined);
    return result;
  };
  return {
    getCaregivers: () => caregivers,
    change: input => enqueue(current => changeFamilyPermission({ ...input, caregivers: current, save })),
    remove: input => enqueue(current => removeFamilyAccess({ ...input, caregivers: current, save })),
  };
}
