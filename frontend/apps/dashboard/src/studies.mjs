// AYO-37 local synthetic studies model. This is not Medplum authorization or live clinical data.
import { DEFAULT_LANGUAGE, translate } from './i18n.mjs';

const progressByState = { ordered: 15, collected: 35, processing: 60, preliminary: 80, ready: 100, corrected: 100 };

export async function studyFixtures(patientId) {
  if (patientId !== 'carmen') return [];
  return [
    { id: 'panel-metabolico', patientId, nameKey: 'studyNameMetabolic', state: 'collected' },
    { id: 'hemocultivos', patientId, nameKey: 'studyNameBloodCulture', state: 'processing', purposeKey: 'studyPurposeBloodCulture' },
    { id: 'radiografia', patientId, nameKey: 'studyNameChestXray', state: 'preliminary' },
    { id: 'hemograma', patientId, nameKey: 'studyNameCbc', state: 'ready' },
  ];
}

export async function restrictedStudyCount(patientId) {
  return patientId === 'carmen' ? 1 : 0;
}

export function studyPresentation(item, language = DEFAULT_LANGUAGE) {
  return {
    name: translate(language, item.nameKey),
    status: translate(language, `studyState_${item.state}`),
    explanation: translate(language, `studyExplanation_${item.state}`),
    purpose: translate(language, item.purposeKey ?? 'studyPurposeUnknown'),
    typicalTime: translate(language, 'studyTypicalUnknown'),
    progress: progressByState[item.state],
  };
}

export async function loadStudies(session, detailSource = studyFixtures, countSource = restrictedStudyCount) {
  const permission = session?.permissions?.estudios;
  if (permission !== true && permission !== false) return { status: 'unavailable', items: [], count: null };
  if (permission === false) {
    if (session?.permissions?.visita !== true) return { status: 'unavailable', items: [], count: null };
    const count = await countSource(session.patient.id);
    return { status: 'restricted', items: [], count: Number.isInteger(count) && count >= 0 ? count : null };
  }
  const sourceItems = await detailSource(session.patient.id);
  if (!Array.isArray(sourceItems)) throw new Error('INVALID_STUDIES_FIXTURE');
  const items = sourceItems.map(item => {
    if (!item?.id || item.patientId !== session.patient.id || !item.nameKey || !(item.state in progressByState)) throw new Error('INVALID_STUDY_FIXTURE');
    return { id: item.id, patientId: item.patientId, nameKey: item.nameKey, state: item.state, ...(item.purposeKey ? { purposeKey: item.purposeKey } : {}) };
  });
  return { status: items.length ? 'ready' : 'empty', items, count: items.length };
}

export function createStudiesController(detailSource = studyFixtures, countSource = restrictedStudyCount) {
  let revision = 0;
  const listeners = new Set();
  const clean = status => ({ status, items: [], count: null, session: null });
  let state = clean('closed');
  const publish = next => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async open(session) {
      const request = ++revision;
      publish({ ...clean('loading'), session });
      try {
        const loaded = await loadStudies(session, detailSource, countSource);
        if (request === revision) publish({ ...loaded, session });
      } catch {
        if (request === revision) publish({ ...clean('error'), session });
      }
    },
    close() { ++revision; publish(clean('closed')); },
  };
}
