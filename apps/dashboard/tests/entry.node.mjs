import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalStore } from '../src/context.mjs';
test('entry requires explicit account and role; selection never loads a clinical session', async()=>{
 const calls=[];const store=createPortalStore(async(account,role)=>{calls.push([account,role]);return {client:{clear(){}},patient:{id:account},permissions:{}};});
 assert.equal(store.getSnapshot().session,null);
 store.selectAccount('lourdes');assert.equal(store.getSnapshot().status,'choosing');assert.equal(store.getSnapshot().role,null);assert.deepEqual(calls,[]);
 await store.enter('lourdes','self');assert.deepEqual(calls,[['lourdes','self']]);assert.equal(store.getSnapshot().session.patient.id,'lourdes');
 store.close();await assert.rejects(store.enter());await assert.rejects(store.enter('rafael','self'));assert.equal(calls.length,1);
});


test('returning to account/role selection clears the client synchronously and discards late sessions', async()=>{
 const pending=[],cleared=[];
 const store=createPortalStore((account,role)=>new Promise(resolve=>pending.push({account,role,resolve})));
 const session=id=>({patient:{id},client:{clear(){cleared.push(id);}},permissions:{estudios:true}});
 const first=store.enter('carmen','self');store.selectAccount('lourdes');
 assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().role,null);
 pending[0].resolve(session('late-carmen'));await first;
 assert.equal(store.getSnapshot().status,'choosing');assert.equal(store.getSnapshot().account,'lourdes');assert.deepEqual(cleared,['late-carmen']);
 const own=store.enter('lourdes','self');pending[1].resolve(session('lourdes'));await own;store.navigate('results');
 store.selectAccount('lourdes');assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().section,'visit');assert.ok(cleared.includes('lourdes'));
 const delegated=store.selectRole('delegate');store.close();pending[2].resolve(session('late-delegate'));await delegated;
 assert.equal(store.getSnapshot().status,'closed');assert.ok(cleared.includes('late-delegate'));
});

test('all four allowed selections load only their explicitly chosen account and role', async()=>{
 for(const [account,role] of [['carmen','self'],['lourdes','self'],['lourdes','delegate'],['rafael','delegate']]) {
  const calls=[];const store=createPortalStore(async(a,r)=>{calls.push([a,r]);return {client:{clear(){}},patient:{id:a},permissions:{}};});
  store.selectAccount(account);assert.deepEqual(calls,[]);await store.selectRole(role);assert.deepEqual(calls,[[account,role]]);store.close();
 }
});
