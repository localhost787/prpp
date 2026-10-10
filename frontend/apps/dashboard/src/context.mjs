import { createMockSession, accounts, accountNames, roles } from './mock-session.mjs';
import { FAMILY_PERMISSION_FIXTURE, FAMILY_CATEGORIES } from './family/family.mjs';
export { accounts, accountNames, roles };

export async function openContext(account, role) {
  const session = await createMockSession(account, role);
  // Mock profile selection is not authentication or server authorization.
  const profile = session.client.getProfile();
  return { ...session, account, role, profile };
}

// Direct synthetic demo entry; this is not authentication.
export function createDemoStore(load = openContext) {
  // One in-memory permission map per demo instance. Never persisted or sent to a server.
  const clone = rows => rows.map(row => ({ ...row, permissions: { ...row.permissions } }));
  let familyAccess = clone(FAMILY_PERMISSION_FIXTURE);
  const store = createPortalStore(async (account, role) => {
    const session = await load(account, role);
    if (account !== 'lourdes' || role !== 'delegate' || session.patient?.id !== 'carmen') return session;
    const permission = familyAccess.find(row => row.id === account)?.permissions;
    return { ...session, permissions: {
      visita: permission?.status === true,
      medicinas: permission?.status === true && permission?.medicines === true,
      instrucciones: permission?.status === true && permission?.instructions === true,
      estudios: permission?.status === true && permission?.studies === true,
    } };
  }, 'results');
  const close = store.close;
  store.getFamilyAccess = () => clone(familyAccess);
  store.saveFamilyPermissions = ({ caregiverId, permissions } = {}, expectedSession) => {
    const live = store.getSnapshot();
    if (live.status !== 'ready' || live.account !== 'carmen' || live.role !== 'self' ||
        !expectedSession || live.session !== expectedSession || live.session.patient?.id !== 'carmen' ||
        caregiverId !== 'lourdes' || !permissions ||
        Object.keys(permissions).length !== FAMILY_CATEGORIES.length ||
        FAMILY_CATEGORIES.some(key => !Object.hasOwn(permissions, key) || typeof permissions[key] !== 'boolean') ||
        (!permissions.status && FAMILY_CATEGORIES.some(key => permissions[key]))) {
      throw new Error('DEMO_PERMISSION_CHANGE_UNAVAILABLE');
    }
    familyAccess = familyAccess.map(row => row.id === caregiverId ? { ...row, permissions: { ...permissions } } : row);
  };
  store.close = () => { familyAccess = clone(FAMILY_PERMISSION_FIXTURE); close(); };
  void store.enter('carmen', 'self');
  return store;
}

export const sections = ['visit', 'results', 'care', 'family', 'more'];

export function createPortalStore(load = openContext, initialSection = 'visit') {
  let revision = 0;
  let state = { status: 'closed', account: null, role: null, session: null, section: 'visit' };
  const listeners = new Set();
  const publish = (next) => { state = next; listeners.forEach(listener => listener()); };
  async function switchContext(account, role) {
    if (!accounts.includes(account) || !roles[account].includes(role)) throw Object.assign(new Error('CONTEXT_UNAVAILABLE'), { translationKey: 'contextUnavailable' });
    const request = ++revision;
    state.session?.client.clear();
    publish({ status: 'loading', account, role, session: null, section: 'visit' });
    try {
      const session = await load(account, role);
      if (request !== revision) { session.client.clear(); return; }
      publish({ ...state, status: 'ready', session, section: initialSection === 'results' && session.permissions.estudios === true ? 'results' : 'visit' });
    } catch {
      if (request === revision) publish({ ...state, status: 'error', session: null });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    enter: (account, role) => switchContext(account, role),
    selectAccount(account) {
      if (!accounts.includes(account)) throw new Error('CONTEXT_UNAVAILABLE');
      ++revision;
      state.session?.client.clear();
      publish({ status: 'choosing', account, role: null, session: null, section: 'visit' });
    },
    selectRole: role => switchContext(state.account, role),
    navigate(section) {
      if (state.status !== 'ready' || !sections.includes(section)) return;
      if (section === 'results' && state.session.permissions.estudios !== true) return;
      publish({ ...state, section });
    },
    close() {
      ++revision;
      state.session?.client.clear();
      publish({ status: 'closed', account: null, role: null, session: null, section: 'visit' });
    },
  };
}
