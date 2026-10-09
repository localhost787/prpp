import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('results panel injects session source and bypasses mock grouping/PDF in live mode',()=>{
 const code=readFileSync(new URL('../src/ResultsPanel.jsx',import.meta.url),'utf8');
 assert.match(code,/createResultsController\(session.resultsSource\)/);
 assert.match(code,/if \(session.mode === 'live'\) return/);
});
