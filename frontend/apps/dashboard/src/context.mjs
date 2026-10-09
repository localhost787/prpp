// Reuse the provisional identity factory, not the Vite UI or its React/Mantine stack.
import { createMockSession, accounts, accountNames, roles } from '../../../src/mock/session.ts';
export { accounts, accountNames, roles };

export async function openContext(account, role) {
  const session = await createMockSession(account, role);
  // The legacy fixture returns RelatedPerson for Lourdes even in her own context.
  // Normalize both SDK and UI profiles without modifying the preserved Vite fixture.
  // Mock profile selection is not authentication or server authorization.
  if (role === 'self') session.client.mock.setProfile(session.patient);
  const profile = session.client.getProfile();
  return { ...session, account, role, profile };
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
    } catch (error) {
      // errorCode lets the integrated mode explain a server failure (src/live/portal.mjs liveErrorKey).
      if (request === revision) publish({ ...state, status: 'error', session: null, errorCode: error?.code ?? null });
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
