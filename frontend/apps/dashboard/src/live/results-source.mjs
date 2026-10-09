// AYO-114: read-only boundary for an externally authenticated Medplum 5.1.42 client.
// getContext supplies a normalized, immutable permission snapshot from the session owner.
// This module neither authenticates nor derives permission from clinical search results.
const failure = code => Object.assign(new Error(code), { code });
export function createAuthorizedResultsSource(getContext) {
  return async patientId => {
    const context = getContext();
    if (!context || context.patientId !== patientId || !patientId || !context.account || !context.role) throw failure('CONTEXT_UNAVAILABLE');
    if (context.permissions?.estudios !== true) throw failure('ACCESS_UNCONFIRMED');
    if (typeof context.client?.searchResources !== 'function') throw failure('SESSION_UNAVAILABLE');
    const current = () => { if (getContext() !== context || context.permissions.estudios !== true) throw failure('STALE_CONTEXT'); };
    const params = { patient: `Patient/${patientId}` };
    const options = { cache: 'no-cache' };
    const observations = await context.client.searchResources('Observation', { ...params, category: 'laboratory,imaging', _sort: '-date' }, options);
    current();
    const reports = await context.client.searchResources('DiagnosticReport', params, options);
    current();
    for (const [rows, type] of [[observations, 'Observation'], [reports, 'DiagnosticReport']]) {
      if (!Array.isArray(rows) || rows.bundle?.link?.some(link => link.relation === 'next')) throw failure('INCOMPLETE_RESULTS');
      const ids = new Set();
      for (const row of rows) {
        if (row?.resourceType !== type || !row.id || ids.has(row.id) || row.subject?.reference !== `Patient/${patientId}`) throw failure('INVALID_RESULTS');
        ids.add(row.id);
      }
    }
    return observations.map(row => {
      const matches = reports.filter(report => report.result?.some(ref => ref.reference === `Observation/${row.id}`));
      if (matches.length > 1) throw failure('AMBIGUOUS_REPORT');
      return matches.length ? { ...row, report: matches[0] } : { ...row };
    });
  };
}
