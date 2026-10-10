import test from 'node:test';
import assert from 'node:assert/strict';
import { resultFixtures } from '../src/result-fixtures.mjs';
import { studyFixtures } from '../src/studies.mjs';
import { listReports } from '../src/reports/index.mjs';
test('simplified Carmen demo omits lactate from studies and result reports', async () => {
  assert.ok(!resultFixtures('carmen').some(row => row.id === 'lactato'));
  assert.ok(!(await studyFixtures('carmen')).some(row => row.id === 'lactato'));
  const context={status:'ready',generation:0,session:{patient:{id:'carmen'},permissions:{estudios:true}}};
  for(const language of ['en','es']) assert.doesNotMatch(JSON.stringify(listReports(context,language)),/lactat/i);
});
