import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareModel} from '../src/care/care.mjs';
test('denied and unavailable model categories never extract fields or counts',()=>{
 const data={};for(const key of ['participant','instructions','medicines'])Object.defineProperty(data,key,{get(){throw new Error('Denied extraction');}});
 for(const permissions of [{},{team:false,instructions:false,medicines:false}]){
  const model=createCareModel({permissions,data});for(const section of Object.values(model.sections))assert.deepEqual(section.items,[]);
 }
});
const adapter = await import('../src/care/adapter.mjs').catch(()=>({}));
const controllerModule=await import('../src/care/controller.mjs').catch(()=>({}));
const session=(patient='carmen', permissions={visita:true,medicinas:true,instrucciones:false})=>({patient:{id:patient,name:[{text:patient}]},permissions});
test('category retrieval guards precede source invocation; discharge permission is not current instructions', async()=>{
 assert.equal(typeof adapter.loadCare,'function');
 const calls=[];
 const source=(id,category)=>{calls.push([id,category]);return category==='team'?null:[];};
 const result=await adapter.loadCare(session('carmen',{visita:true,medicinas:false,instrucciones:false}),source);
 assert.deepEqual(calls,[['carmen','team'],['carmen','instructions']]);
 assert.deepEqual(result.permissions,{team:true,instructions:true,medicines:false});
 for(const permissions of [{},{visita:'true',medicinas:1},{visita:false,medicinas:false}]){
  calls.length=0;await adapter.loadCare(session('carmen',permissions),source);assert.equal(calls.length,0);
 }
 calls.length=0;await adapter.loadCare(session('unknown'),source);assert.equal(calls.length,0);
 const own=await adapter.loadCare(session('lourdes'));
 assert.deepEqual(own.data,{participant:null,instructions:[],medicines:[]});
 const carmen=await adapter.loadCare(session());assert.equal(carmen.data.medicines[0].dose,'1 g');
});
test('local scenarios deny medicines before retrieval, preserve permitted care and reset',async()=>{
 let calls=[];
 const c=controllerModule.createCareController((id,category)=>{calls.push(category);return category==='team'?{name:{en:'Test'}}:[];});
 await c.open(session(),undefined,'denied');
 assert.deepEqual(calls,['team','instructions']);assert.equal(c.getSnapshot().permissions.medicines,false);
 calls=[];await c.open(session());assert.deepEqual(calls,['team','instructions','medicines']);
 await c.open(session(),undefined,'noParticipant');assert.equal(c.getSnapshot().data.participant,null);
 for(const scenario of ['loading','error','empty']){calls=[];await c.open(session(),undefined,scenario);assert.equal(calls.length,0);assert.equal(c.getSnapshot().status,scenario==='empty'?'ready':scenario);}
});
test('controller invalidates late categories on live context change and close',async()=>{
 assert.equal(typeof controllerModule.createCareController,'function');
 let release;let calls=0;
 let live=session();
 const controller=controllerModule.createCareController(()=>{calls++;return new Promise(resolve=>release=resolve);});
 const pending=controller.open(live,()=>live);
 assert.equal(controller.getSnapshot().status,'loading');
 live=session('lourdes');release(null);await pending;
 assert.equal(calls,1);assert.notEqual(controller.getSnapshot().status,'ready');
 const pending2=controller.open(live,()=>live);controller.close();release(null);await pending2;
 assert.equal(controller.getSnapshot().status,'idle');assert.equal(calls,2);
 const normal=controllerModule.createCareController();await normal.open(session());
 assert.equal(normal.getSnapshot().status,'ready');
 normal.close();assert.deepEqual(normal.getSnapshot().data,{});
 const broken=controllerModule.createCareController(()=>{throw new Error('private');});await broken.open(session());assert.equal(broken.getSnapshot().status,'error');assert.deepEqual(broken.getSnapshot().data,{});
});
