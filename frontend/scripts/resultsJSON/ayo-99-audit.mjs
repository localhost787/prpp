// AYO-99 audit only. Synthetic incompatible rows, NOT an integration or policy.
// Run from repository root: node scripts/resultsJSON/ayo-99-audit.mjs
import assert from 'node:assert/strict';
import { loadResults, createResultsController, filterResults, statusKey } from '../../apps/dashboard/src/results.mjs';
import { listReports } from '../../apps/dashboard/src/reports/index.mjs';

const session = { account: 'carmen', role: 'self', patient: { id: 'carmen' }, permissions: { estudios: true } };
const context = { status: 'ready', generation: 1, session };
// auditSource is deliberately an uncontracted label, not a claimed production field.
// Labels old/corrected express scenario intent; versionId is opaque, never sorted.
const row = (auditSource, versionId, status, valueString, id = 'wbc') => ({
  resourceType: 'Observation', id, auditSource, meta: { versionId }, status,
  subject: { reference: 'Patient/carmen' }, code: { text: 'SYNTHETIC AUDIT ONLY' }, valueString,
});
const old = row('sourceA', 'z-opaque-old', 'final', 'AUDIT-OLD');
const corrected = row('sourceA', 'a-opaque-corrected', 'corrected', 'AUDIT-CORRECTED');
const other = row('sourceB', 'q-opaque-independent', 'final', 'AUDIT-INDEPENDENT');
const unknown = row('sourceB', 'opaque-unmapped', 'corrected', 'AUDIT-UNMAPPED', 'audit-unmapped');
const summarize = r => ({ id: r.id, auditSource: r.auditSource, versionId: r.meta?.versionId, status: r.status, value: r.valueString });
const cases = [
  ['same-source-old-corrected', [old, corrected]],
  ['same-source-corrected-old', [corrected, old]],
  ['different-source-A-B', [old, other]],
  ['different-source-B-A', [other, old]],
  ['mixed-old-corrected-independent', [old, corrected, other]],
  ['mixed-independent-corrected-old', [other, corrected, old]],
  ['unmapped-id', [unknown]],
];
const observations = [];
for (const [name, rows] of cases) {
  const before = JSON.stringify(rows);
  let calls = 0;
  const source = patientId => { assert.equal(patientId, 'carmen'); calls++; return rows; };
  const loaded = await loadResults(session, source);
  assert.equal(loaded.items, rows); // Actual API returns the source array, not a reconciliation.
  const controller = createResultsController(source);
  await controller.open(session);
  assert.deepEqual(controller.getSnapshot().items, rows);
  controller.detail(rows[0].id);
  const selectedId = controller.getSnapshot().detail;
  const reports = listReports(context, 'en', { source });
  const projection = reports.reports.flatMap(r => r.items);
  const known = rows.filter(r => r.id === 'wbc');
  assert.equal(projection.length, known.length ? 1 : 0);
  if (known.length) assert.equal(projection[0].value, known[0].valueString);
  // These are explicit static-code-equivalent predicates, NOT a rendered React test.
  const groupedRows = rows.filter(r => reports.reports.some(report => report.items.some(item => item.id === r.id)));
  const detailMatches = groupedRows.filter(r => r.id === selectedId);
  observations.push({ name, sourceCalls: calls, input: rows.map(summarize), loaded: loaded.items.map(summarize),
    controllerDetailId: selectedId, allFilterCount: filterResults(rows, 'all').length,
    correctedFilter: filterResults(rows, 'corrected').map(summarize),
    actualReportProjection: reports,
    staticUIEquivalent: { groupedRows: groupedRows.map(summarize), detailMatches: detailMatches.map(summarize),
      duplicateReactKey: new Set(groupedRows.map(r => r.id)).size !== groupedRows.length },
  });
  assert.equal(JSON.stringify(rows), before);
  assert.equal(calls, 3);
  controller.close();
}
const statuses = [
  { status: 'corrected' }, { status: 'amended' },
  { status: 'corrected', report: { status: 'preliminary' } },
  { status: 'final', report: { status: 'corrected' } },
  { report: { status: 'corrected' } },
].map(input => ({ input, actualStatusKey: statusKey(input) }));
assert.deepEqual(statuses.map(r => r.actualStatusKey), ['corrected', 'corrected', 'preliminary', 'final', 'corrected']);
console.log(JSON.stringify({ scope: 'Synthetic injected source rows, incompatible with unique fixture IDs. Real exported modules; no backend, UI render, PDF or reconciliation policy tested.',
  cases: observations.length, statusCases: statuses.length, observations, statuses, assertions: 'passed: existing behavior only, not acceptance criteria' }, null, 2));
