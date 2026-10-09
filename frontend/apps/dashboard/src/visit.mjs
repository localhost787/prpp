// Provisional LOCAL MOCK only. Source: contrato-api.md API-05/06 (not approved).
// No SDK writes, hospital connection, clinical transitions, or persistent storage.
import { DEFAULT_LANGUAGE, translate } from './i18n.mjs';
export function visitPresentation(visit, permissions, language = DEFAULT_LANGUAGE) {
  const t = (key, params) => translate(language, key, params);
  const restricted = permissions.estudios !== true;
  const stages = Array.from({ length: 7 }, (_, i) => t(i === 4 && restricted ? 'visitStagePrivate' : `visitStage${i + 1}`));
  return {
    stages,
    description: t(visit.stage === 5 && restricted ? 'visitDescriptionPrivate' : `visitDescription${visit.stage}`, visit),
    next: t(visit.stage === 5 && !restricted ? 'visitNextStudies' : 'visitNextUnavailable'),
    startedAt: new Intl.DateTimeFormat(language === 'es' ? 'es-PR' : 'en-US', { timeZone: 'America/Puerto_Rico', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(visit.startedAt)),
  };
}
export async function visitFixture(patientId) {
  return patientId === 'carmen' ? {
    id: 'visita-er', patientId, status: 'in-progress', stage: 5, startedAt: '2026-10-09T08:12:00-04:00',
    cubicle: 12, clinician: 'Ana Ramos', nextKey: 'visitNextStudies', level: 3,
  } : null;
}
export function createVisitController(source = visitFixture) {
  const stages = new Map(), listeners = new Set();
  let revision = 0;
  let state = { status: 'closed', visit: null, session: null };
  const publish = next => { state = next; listeners.forEach(fn => fn()); };
  const key = v => `${v.patientId}:${v.id}`;
  return {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    async open(session, scenario = 'normal') {
      const request = ++revision;
      const clean = status => ({ status, visit: null, session, scenario });
      if (session?.permissions?.visita !== true || scenario === 'denied') { publish(clean('restricted')); return; }
      publish(clean('loading'));
      if (scenario === 'loading') return;
      if (scenario === 'error' || scenario === 'empty') { publish(clean(scenario)); return; }
      try {
        const data = await loadVisit(session, source);
        if (request !== revision) return;
        if (data.visit) {
          data.visit.stage = stages.get(key(data.visit)) ?? data.visit.stage;
          data.visit.nextKey = data.visit.stage === 5 && session.permissions.estudios === true ? 'visitNextStudies' : 'visitNextUnavailable';
        }
        publish({ ...data, session, scenario });
      } catch { if (request === revision) publish(clean('error')); }
    },
    stage(stage) {
      if (state.status !== 'ready' || !Number.isInteger(stage) || stage < 1 || stage > 7) return;
      stages.set(key(state.visit), stage);
      publish({ ...state, visit: { ...state.visit, stage, nextKey: stage === 5 && state.session.permissions.estudios === true ? 'visitNextStudies' : 'visitNextUnavailable' } });
    },
    // Integrated mode: re-read after a realtime change without flashing the loading state.
    async refresh(session) {
      if (state.status !== 'ready' && state.status !== 'empty') return;
      if (state.session !== session) return;
      const request = ++revision;
      try {
        const data = await loadVisit(session, source);
        if (request === revision) publish({ ...data, session, scenario: state.scenario });
      } catch { if (request === revision) publish({ status: 'error', visit: null, session, scenario: state.scenario }); }
    },
    close(reset = false) { ++revision; if (reset) stages.clear(); publish({ status: 'closed', visit: null, session: null }); },
  };
}
export async function loadVisit(session, source = visitFixture) {
  if (session?.permissions?.visita !== true) return { status: 'restricted', visit: null };
  // Integrated mode: the session brings its server source (src/live/portal.mjs); never mixed with the fixture.
  const visit = await (session.live?.visit ?? source)(session.patient.id);
  if (visit === null) return { status: 'empty', visit: null };
  if (!visit?.id || visit.patientId !== session.patient.id || !Number.isInteger(visit.stage) || visit.stage < 1 || visit.stage > 7) throw new Error('INVALID_VISIT_FIXTURE');
  // Explicit projection: never carry hidden fields/titles/counts from a source into the view.
  const { id, patientId, status, stage, startedAt, cubicle, clinician, level } = visit;
  const projected = { id, patientId, status, stage, startedAt, cubicle, clinician, level, nextKey: stage === 5 && session.permissions.estudios === true ? 'visitNextStudies' : 'visitNextUnavailable' };
  if (session.permissions.estudios !== true) projected.stageKey = 'visitStagePrivate';
  return { status: 'ready', visit: projected };
}
