import { createMockSession, accounts, accountNames, roles } from './mock-session.mjs';
export { accounts, accountNames, roles };

export async function openContext(account, role) {
  const session = await createMockSession(account, role);
  // Mock profile selection is not authentication or server authorization.
  const profile = session.client.getProfile();
  return { ...session, account, role, profile };
}

// Direct synthetic demo entry; this is not authentication.
export function createDemoStore(load = openContext) {
  const store = createPortalStore(load);
  void store.enter('carmen', 'self');
  return store;
}

export const sections = ['visit', 'results', 'care', 'family', 'more'];

export function createPortalStore(load = openContext) {
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
      publish({ ...state, status: 'ready', session });
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
