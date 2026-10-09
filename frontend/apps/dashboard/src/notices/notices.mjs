// Presentation-only notices. Rows must already be authorized and selected by the caller.
// This module does not filter clinical categories, inspect text, poll, subscribe, or access a network.
export const NOTICES_COPY = Object.freeze({
  en: Object.freeze({
    title: 'Notices',
    synthetic: 'Synthetic example',
    loading: 'Loading notices…',
    empty: 'No notices loaded',
    restricted: 'Notices are private',
    unavailable: 'Access has not been confirmed',
    error: 'We could not load notices. Try again.',
    unread: count => `${count} unread`,
    open: 'Open notices',
  }),
  es: Object.freeze({
    title: 'Avisos',
    synthetic: 'Ejemplo sintético',
    loading: 'Cargando avisos…',
    empty: 'No hay avisos cargados',
    restricted: 'Los avisos son privados',
    unavailable: 'El acceso no está confirmado',
    error: 'No pudimos cargar los avisos. Intente de nuevo.',
    unread: count => `${count} sin leer`,
    open: 'Abrir avisos',
  }),
});

export const SYNTHETIC_NOTICE_FIXTURE = Object.freeze([
  Object.freeze({ id: 'arrival', sent: '2026-10-09T12:12:00Z', text: 'Synthetic arrival notice', synthetic: true }),
  Object.freeze({ id: 'triage', sent: '2026-10-09T12:25:00Z', text: 'Synthetic triage notice', synthetic: true }),
  Object.freeze({ id: 'cubicle', sent: '2026-10-09T13:05:00Z', text: 'Synthetic cubicle notice', synthetic: true }),
]);

function formatPuertoRicoTime(value, language) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', {
    timeZone: 'America/Puerto_Rico',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function createNoticesModel(options = {}) {
  const language = Object.hasOwn(NOTICES_COPY, options.language) ? options.language : 'en';
  const copy = NOTICES_COPY[language];
  if (options.permission === false) return { language, copy, status: 'restricted', message: copy.restricted, items: [] };
  if (options.permission !== true) return { language, copy, status: 'unavailable', message: copy.unavailable, items: [] };
  if (options.state === 'loading') return { language, copy, status: 'loading', message: copy.loading, items: [] };
  if (options.state === 'error') return { language, copy, status: 'error', message: copy.error, items: [] };
  if (options.state === 'empty') return { language, copy, status: 'empty', message: copy.empty, items: [] };

  const rows = Array.isArray(options.communications) ? options.communications : [];
  if (!rows.length) return { language, copy, status: 'empty', message: copy.empty, items: [] };
  const items = rows.map((row, index) => {
    const parsedSent = typeof row.sent === 'string' ? new Date(row.sent) : null;
    const sent = parsedSent && !Number.isNaN(parsedSent.getTime()) ? row.sent : null;
    return {
      id: row.id ?? `notice-${index}`,
      sent,
      time: formatPuertoRicoTime(sent, language),
      text: typeof row.text === 'string' ? row.text : null,
      synthetic: row.synthetic === true,
    };
  }).sort((left, right) => {
    if (!left.sent && !right.sent) return 0;
    if (!left.sent) return 1;
    if (!right.sent) return -1;
    return new Date(right.sent).getTime() - new Date(left.sent).getTime();
  });
  return { language, copy, status: 'ready', message: null, items };
}

export function createNoticesController(loadRows) {
  let generation = 0;
  let contextKey = null;
  let snapshot = { ...createNoticesModel({ permission: true, state: 'empty' }), unreadCount: 0 };
  return {
    getSnapshot: () => snapshot,
    changeContext(nextContextKey) {
      generation += 1;
      contextKey = nextContextKey;
      snapshot = { ...createNoticesModel({ permission: true, state: 'empty' }), unreadCount: 0 };
    },
    markOpen() {
      snapshot = { ...snapshot, unreadCount: 0 };
      return snapshot;
    },
    async load(nextContextKey, options = {}) {
      generation += 1;
      const requestGeneration = generation;
      contextKey = nextContextKey;
      snapshot = { ...createNoticesModel({ ...options, state: 'loading' }), unreadCount: 0 };
      try {
        const communications = await loadRows(options);
        if (requestGeneration !== generation || contextKey !== nextContextKey) return snapshot;
        const model = createNoticesModel({ ...options, state: 'ready', communications });
        snapshot = { ...model, unreadCount: model.status === 'ready' ? model.items.length : 0 };
      } catch {
        if (requestGeneration === generation && contextKey === nextContextKey) {
          snapshot = { ...createNoticesModel({ ...options, state: 'error' }), unreadCount: 0 };
        }
      }
      return snapshot;
    },
    close() {
      generation += 1;
      contextKey = null;
      snapshot = { ...createNoticesModel({ permission: true, state: 'empty' }), unreadCount: 0 };
    },
  };
}
