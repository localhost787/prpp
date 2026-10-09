// Integrated mode for the existing screens: turns the live layer into the SAME session shape the mock
// screens consume ({ client, patient, permissions, profile, account, role }) plus `session.live`, which
// the screen loaders use instead of their fixtures. Two explicit modes, never mixed:
//   'integrado'     real server, demo accounts sign in with EXPO_PUBLIC_DEMO_* (one click)
//   'demostracion'  the local mock (only when chosen, or when the build is not configured for live)
// If the server fails, the loaders throw and the screens show their error state (never mock data).
import { loginDemo, logout, getRoles, openLiveSession } from './session.mjs';
import { loadAccess, CATEGORIES } from './permissions.mjs';
import { checkLive, classifyError } from './fallback.mjs';
import { getVisit, getResults, getCare, getCarePlan, getPrescriptions, getAppointments } from './queries.mjs';
import { closeAll } from './realtime.mjs';
import { listFamily, setFamilySharing } from './sharing.mjs';

export const PORTAL_MODES = Object.freeze(['integrado', 'demostracion']);

const unwrap = result => {
  if (result.status === 'ok') return result.data;
  if (result.status === 'locked') throw Object.assign(new Error('LIVE_LOCKED'), { code: 'LIVE_LOCKED' });
  throw result.error ?? new Error('LIVE_READ_FAILED');
};
const nameText = (resource, fallback = '') => resource?.name?.[0]?.text
  ?? ([resource?.name?.[0]?.given?.join(' '), resource?.name?.[0]?.family].filter(Boolean).join(' ') || fallback);

/** Patient as the screens read it: name[0].text is always a string. */
export function screenPatient(patient, displayName = '') {
  const text = nameText(patient, displayName ?? '');
  const [first = {}, ...rest] = patient?.name ?? [];
  return { ...patient, name: [{ ...first, text }, ...rest] };
}

/**
 * Live session → screen session. `client` is a small handle: the store calls client.clear() when the
 * context changes; that releases subscriptions but keeps the sign-in (5 logins/min/IP).
 */
export function adaptSession({ account, role, live, client, cfg }) {
  const patientId = role.patientId;
  const ctx = { client, access: live.access, patientId };
  return {
    client: { clear: () => closeAll(client), getProfile: () => client.getProfile() },
    patient: screenPatient(live.patient, role.displayName),
    permissions: { ...live.permissions },
    profile: live.profile,
    account,
    role: role.role,
    live: Object.freeze({
      client, access: live.access, patientId, relationship: role.relationship ?? null,
      // Same contracts as the fixtures: source(patientId) → data (throws on failure).
      // The screen adds its own "Dr." prefix; the server name already has one ("Dra. …").
      visit: async id => {
        const visit = unwrap(await getVisit({ ...ctx, patientId: id }));
        return visit && { ...visit, clinician: typeof visit.clinician === 'string' ? visit.clinician.replace(/^(dra?\.)\s*/i, '') : visit.clinician };
      },
      results: async id => unwrap(await getResults({ ...ctx, patientId: id })),
      care: () => getCare(ctx),
      discharge: () => loadDischarge(ctx),
      family: () => listFamily(client, patientId),
      share: (relatedPersonId, categories) => setFamilySharing(client, { relatedPersonId, categories }, cfg),
    }),
  };
}

/** Care-plan + prescriptions + appointment, each with its own lock (instrucciones / medicinas). */
export async function loadDischarge(ctx) {
  const [plan, prescriptions, appointments] = await Promise.all([getCarePlan(ctx), getPrescriptions(ctx), getAppointments(ctx)]);
  const failed = [plan, prescriptions, appointments].find(r => r.status === 'error');
  if (failed) throw failed.error;
  return { plan, prescriptions, appointments };
}

/** loadCare() for live sessions: same { permissions, data } shape; any failed section = error (no partial mock). */
export async function loadLiveCare(session, permissions, isCurrent = () => true) {
  const result = await session.live.care();
  if (!isCurrent()) return null;
  const failed = Object.entries(result.statuses ?? {}).find(([, status]) => status === 'error');
  if (failed) throw Object.assign(new Error('LIVE_CARE_FAILED'), { section: failed[0] });
  return { permissions, data: result.data };
}

/** Results grouped by their DiagnosticReport for ResultsPanel (no PDF: those are mock-only assets). */
export function liveReportGroups(items, { statusLabel, title = item => item.code?.text ?? '', source = '' } = {}) {
  const groups = new Map();
  for (const item of items) {
    const id = item.report?.id ?? 'otros';
    if (!groups.has(id)) groups.set(id, { id, institution: source, title: item.report?.code?.text ?? title(item), items: [], imaging: false });
    const group = groups.get(id);
    group.items.push({ id: item.id, statusLabel: statusLabel ? statusLabel(item) : item.status ?? '' });
    if ((item.category ?? []).some(c => (c.coding ?? []).some(x => x.code === 'imaging'))) group.imaging = true;
  }
  return [...groups.values()].map(({ imaging, ...g }) => ({ ...g, typeKey: imaging ? 'reportImaging' : 'reportLaboratory', grouping: '', downloadable: false }));
}

/** Error code → i18n key for the context card. */
export function liveErrorKey(code) {
  return {
    LIVE_LOGIN_THROTTLED: 'liveThrottled',
    LIVE_UNAVAILABLE: 'liveUnavailable',
    LIVE_DEMO_ACCOUNT_NOT_CONFIGURED: 'liveNotConfigured',
    LIVE_CONFIG_INCOMPLETE: 'liveNotConfigured',
    LIVE_ROLE_NOT_OFFERED: 'liveRoleMissing',
  }[code] ?? 'liveContextError';
}

const defaultDeps = { loginDemo, logout, getRoles, openLiveSession, checkLive, closeAll, loadAccess };

/**
 * Mode controller + loader for createPortalStore(load).
 * createIntegratedPortal({ cfg, openMock, deps? }) → { getSnapshot, subscribe, load, choose, check, reset, watchAccess }
 * Snapshot: { configured, mode, availability: 'unknown'|'checking'|'available'|'unavailable' }.
 */
export function createIntegratedPortal({ cfg, openMock, deps: overrides = {} } = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const configured = cfg?.live === true;
  let state = { configured, mode: configured ? 'integrado' : 'demostracion', availability: 'unknown' };
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(fn => fn()); };
  const clients = new Map(); // account → Promise<MedplumClient>, memory only

  async function clientFor(account) {
    if (!clients.has(account)) {
      const pending = deps.loginDemo(cfg, account);
      clients.set(account, pending);
      pending.catch(() => { if (clients.get(account) === pending) clients.delete(account); });
    }
    return clients.get(account);
  }

  async function reset() {
    const pending = [...clients.values()];
    clients.clear();
    await Promise.all(pending.map(p => p.then(c => { deps.closeAll(c); return deps.logout(c); }, () => {})));
  }

  async function check() {
    if (!configured) return state;
    publish({ ...state, availability: 'checking' });
    // Browser-safe path: the healthcheck has no CORS headers on this deployment (observed).
    const result = await deps.checkLive(cfg, { path: '.well-known/openid-configuration' });
    publish({ ...state, availability: result.status === 'available' ? 'available' : 'unavailable' });
    return state;
  }

  async function loadIntegrated(account, role) {
    if (!configured) throw Object.assign(new Error('LIVE_CONFIG_INCOMPLETE'), { code: 'LIVE_CONFIG_INCOMPLETE' });
    let client = await clientFor(account);
    let roles;
    try {
      roles = await deps.getRoles(client);
    } catch (error) {
      if (classifyError(error) !== 'session') throw error;
      clients.delete(account); // expired sign-in: one fresh login, never a loop
      client = await clientFor(account);
      roles = await deps.getRoles(client);
    }
    const match = roles.find(r => r.role === role);
    if (!match) throw Object.assign(new Error('LIVE_ROLE_NOT_OFFERED'), { code: 'LIVE_ROLE_NOT_OFFERED' });
    const live = await deps.openLiveSession(client, match);
    return adaptSession({ account, role: match, live, client, cfg });
  }

  return {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    /** Loader for createPortalStore: the mode decides, explicitly. */
    load: (account, role) => (state.mode === 'integrado' ? loadIntegrated(account, role) : openMock(account, role)),
    /** Explicit mode change: drops every sign-in (the caller also closes the store). */
    async choose(mode) {
      if (!PORTAL_MODES.includes(mode) || (mode === 'integrado' && !configured)) return state;
      await reset();
      publish({ ...state, mode });
      if (mode === 'integrado') await check();
      return state;
    },
    check,
    reset,
    /** Polls auth/me (~5 s) and calls onChange when the permissions of this session change. Returns stop(). */
    watchAccess(session, onChange, intervalMs = 5000) {
      if (!session?.live) return () => {};
      const before = JSON.stringify(CATEGORIES.map(c => session.permissions[c] === true));
      let stopped = false;
      const timer = setInterval(async () => {
        try {
          const access = await deps.loadAccess(session.live.client);
          const now = JSON.stringify(CATEGORIES.map(c => access.canView(session.live.patientId, c)));
          if (!stopped && now !== before) { stopped = true; clearInterval(timer); onChange(); }
        } catch {
          // Transient: the screens show their own errors on the next read.
        }
      }, intervalMs);
      return () => { stopped = true; clearInterval(timer); };
    },
  };
}
