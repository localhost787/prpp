import test from 'node:test';
import assert from 'node:assert/strict';
import * as context from '../src/context.mjs';
import { FAMILY_PERMISSION_FIXTURE } from '../src/family/family.mjs';
import { loadResults } from '../src/results.mjs';
import { createReportScope } from '../src/reports/scope.mjs';

test('active demo fixtures contain only Carmen and Lourdes, always viewing Carmen', async () => {
  assert.deepEqual(context.accounts, ['carmen', 'lourdes']);
  assert.deepEqual(context.roles, { carmen: ['self'], lourdes: ['delegate'] });
  assert.deepEqual(FAMILY_PERMISSION_FIXTURE.map(person => person.id), ['lourdes']);
  await assert.rejects(context.openContext('rafael', 'delegate'));
  await assert.rejects(context.openContext('lourdes', 'self'));
});

test('demo opens Carmen directly and switches only to her daughter, clearing context', async () => {
  assert.equal(typeof context.createDemoStore, 'function');
  const store = context.createDemoStore();
  await new Promise(resolve => { if(store.getSnapshot().status==='ready') resolve(); else { const off=store.subscribe(()=>{if(store.getSnapshot().status==='ready'){off();resolve();}}); } });
  assert.equal(store.getSnapshot().account, 'carmen');
  assert.equal(store.getSnapshot().role, 'self');
  assert.equal(store.getSnapshot().session.patient.id, 'carmen');
  const first = store.getSnapshot().session;
  store.navigate('results');
  const switching = store.enter('lourdes', 'delegate');
  assert.equal(store.getSnapshot().session, null);
  assert.equal(store.getSnapshot().section, 'visit');
  await switching;
  const daughter=store.getSnapshot().session;
  assert.equal(daughter.patient.id,'carmen');
  assert.equal(daughter.permissions.estudios,false);
  let resultReads=0, pdfReads=0;
  assert.deepEqual(await loadResults(daughter,()=>{resultReads++;return [];}),{status:'restricted',items:[]});
  const scope=createReportScope(store); const unmount=scope.mount();
  await scope.download('a','es',scope.getContext().generation,{loadPdf:()=>{pdfReads++;return new Uint8Array();}});
  assert.equal(resultReads,0);assert.equal(pdfReads,0);unmount();
  store.navigate('results');
  assert.equal(store.getSnapshot().section,'visit');
  await store.enter('carmen','self');
  assert.notEqual(store.getSnapshot().session, first);
  assert.equal(store.getSnapshot().section,'results');
  store.close();
});
