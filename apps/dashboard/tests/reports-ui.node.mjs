import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listReports } from '../src/reports/index.mjs';
import { resultFixtures } from '../src/result-fixtures.mjs';
const api = await import('../src/reports/scope.mjs').catch(() => ({}));
test('unmount uses synchronous layout cleanup, not a deferred passive cleanup', async () => {
 const source=await readFile(new URL('../src/ResultsPanel.jsx',import.meta.url),'utf8');
 assert.match(source,/useLayoutEffect\(\(\) => reportScope.mount\(\), \[reportScope\]\)/);
});
test('live report listing never retrieves restricted titles/counts; language uses existing rows', async () => {
 const h=harness();const scope=api.createReportScope(h.store);const stop=scope.mount();
 let reads=0;const rows=resultFixtures('carmen');const source=()=>{reads++;return rows;};
 for(const language of ['en','es','en']) assert.equal(listReports(scope.getContext(),language,{source}).reports.length,3);
 assert.equal(reads,3);
 for(const session of [
  {account:'lourdes',role:'delegate',patient:{id:'carmen'},permissions:{estudios:false}},
  {account:'lourdes',role:'self',patient:{id:'lourdes'},permissions:{estudios:true}},
 ]) {
  h.change({session});
  assert.deepEqual(listReports(scope.getContext(),'en',{source}).reports,[]);
  let loads=0;
  assert.equal((await scope.download('a','en',scope.getContext().generation,{loadPdf:()=>loads++})).status,'restricted');
  assert.equal(loads,0);
 }
 assert.equal(reads,3);stop();
});
function harness() {
 let state = {status:'ready', section:'results', session:{account:'carmen', role:'self', patient:{id:'carmen'}, permissions:{estudios:true}}};
 const listeners = new Set();
 const store = {getSnapshot:()=>state, subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};
 return {store, change(next) {state={...state,...next};listeners.forEach(fn=>fn());}};
}
test('UI report scope invalidates pending and retained actions across all lifetimes', async () => {
 assert.equal(typeof api.createReportScope, 'function');
 for (const reason of ['language','navigation','account','role','permission','close','unmount','away-back']) {
  const h=harness(); const scope=api.createReportScope(h.store); const stop=scope.mount();
  const token=scope.getContext().generation; let resolve; let saves=0;
  const options={loadPdf:()=>new Promise(r=>resolve=r),save:()=>saves++};
  const pending=scope.download('a','en',token,options);
  if(reason==='language') scope.invalidate();
  if(reason==='navigation') h.change({section:'visit'});
  if(reason==='account'||reason==='role') h.change({session:{...h.store.getSnapshot().session,[reason]:'other'}});
  if(reason==='permission') h.change({session:{...h.store.getSnapshot().session,permissions:{estudios:false}}});
  if(reason==='close') h.change({status:'closed',session:null});
  if(reason==='unmount') stop();
  if(reason==='away-back') {h.change({section:'visit'});h.change({section:'results'});}
  resolve(new Uint8Array([1]));
  assert.equal((await pending).status,'stale',reason);
  assert.equal((await scope.download('a','en',token,options)).status,'stale',reason);
  assert.equal(saves,0);stop();
 }
});
