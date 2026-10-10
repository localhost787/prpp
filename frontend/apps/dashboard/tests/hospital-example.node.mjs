import test from 'node:test';
import assert from 'node:assert/strict';
import { listReports } from '../src/reports/index.mjs';

const context = { status: 'ready', generation: 0, session: { patient: { id: 'carmen' }, permissions: { estudios: true } } };
test('the story uses a clearly fictitious hospital hemogram without changing clinical data', () => {
  for (const [language, hospital] of [['en', 'Demo Hospital'], ['es', 'Hospital de demostración']]) {
    const report = listReports(context, language).reports.find(report => report.id === 'a');
    assert.equal(report.institution, hospital);
    assert.equal(report.fictitious, true);
    assert.equal(report.synthetic, true);
    assert.match(report.story, /9:41/);
    assert.match(report.story, language === 'en' ? /fictional scenario/ : /escenario ficticio/);
    assert.deepEqual(report.items.map(item => [item.id, item.value, item.status, item.interpretationCode]), [
      ['wbc', 15.2, 'final', 'H'], ['hb', 12.8, 'final', 'N'],
    ]);
  }
});
