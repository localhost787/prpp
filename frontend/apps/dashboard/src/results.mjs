// AYO-78: local fixture boundary, NOT server authorization. No SDK seeding.
import { resultFixtures } from './result-fixtures.mjs';
import { DEFAULT_LANGUAGE, translate } from './i18n.mjs';
export function interpretationKey(item) {
  return { N: 'normal', H: 'high', L: 'low', HH: 'veryHigh', LL: 'veryLow', A: 'abnormal' }[item.interpretation?.[0]?.coding?.[0]?.code] ?? 'noInterpretation';
}
export function interpretationLabel(item, language = DEFAULT_LANGUAGE) {
  return translate(language, interpretationKey(item));
}
export function statusKey(item) {
  const statuses = [item.status, item.report?.status];
  if (statuses.some(status => ['partial', 'preliminary'].includes(status))) return 'preliminary';
  return { final: 'final', corrected: 'corrected', amended: 'corrected' }[item.status ?? item.report?.status] ?? 'unknown';
}
export function statusLabel(item, language = DEFAULT_LANGUAGE) {
  return translate(language, statusKey(item));
}
export function filterResults(items, filter) {
  return filter === 'all' ? items : items.filter(item => statusKey(item) === filter);
}
// Pure presentation of this documented synthetic case; never mutate/reload clinical state.
export function resultPresentation(item, language = DEFAULT_LANGUAGE) {
  const t = (key) => translate(language, key);
  const keys = item.presentationKeys ?? {};
  return {
    title: keys.title ? t(keys.title) : item.code?.text ?? t('unavailable'),
    note: keys.note ? t(keys.note) : item.note?.[0]?.text ?? t('explanationUnavailable'),
    value: item.valueQuantity?.value ?? (keys.value ? t(keys.value) : item.valueString ?? t('valueUnavailable')),
    unit: keys.unit ? t(keys.unit) : item.valueQuantity?.unit ?? '',
    report: keys.report ? t(keys.report) : item.report?.code?.text ?? t('unavailable'),
  };
}
export function createResultsController(source) {
  let revision = 0;
  const clean = status => ({ status, items: [], filter: 'all', detail: null });
  let state = clean('closed');
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    async open(session) {
      const request = ++revision;
      publish(clean('loading'));
      try {
        const data = await loadResults(session, source);
        if (request === revision) publish({ ...clean(data.status), items: data.items });
      } catch { if (request === revision) publish(clean('error')); }
    },
    filter(filter) { if (state.status === 'ready') publish({ ...state, filter, detail: null }); },
    detail(id) { if (state.status === 'ready' && (id === null || filterResults(state.items, state.filter).some(item => item.id === id))) publish({ ...state, detail: id }); },
    close() { ++revision; publish(clean('closed')); },
  };
}
export async function loadResults(session, source = resultFixtures) {
  if (session?.permissions?.estudios !== true) return { status: 'restricted', items: [] };
  const items = await source(session.patient.id);
  return { status: 'ready', items };
}
