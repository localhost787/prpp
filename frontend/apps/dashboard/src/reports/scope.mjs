import { downloadReport } from './index.mjs';
// View-lifetime guard for synthetic client data; not server authorization.
export function createReportScope(store) {
  let generation = 0;
  let mounted = false;
  const invalidate = () => { generation++; };
  const getContext = () => {
    const live = store.getSnapshot();
    return { ...live, generation, status: mounted && live.section === 'results' ? live.status : 'closed' };
  };
  return {
    invalidate, getContext,
    mount() {
      mounted = true; invalidate();
      const unsubscribe = store.subscribe(invalidate);
      return () => { mounted = false; invalidate(); unsubscribe(); };
    },
    download(reportId, language, expectedGeneration, options = {}) {
      if (expectedGeneration !== generation || !mounted) return Promise.resolve({ status: 'stale' });
      return downloadReport({ ...options, getContext, reportId, language });
    },
  };
}
