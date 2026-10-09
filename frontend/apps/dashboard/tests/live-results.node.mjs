import test from 'node:test';
import assert from 'node:assert/strict';
import {loadResults} from '../src/results.mjs';
import {createAuthorizedResultsSource} from '../src/live/results-source.mjs';
test('live session without a source never falls back to Carmen fixtures',async()=>{
 await assert.rejects(loadResults({mode:'live',patient:{id:'carmen'},permissions:{estudios:true}}));
});
test('late results after context replacement are discarded before reports query',async()=>{
 const x=setup();let release;x.get().client.searchResources=async()=>new Promise(r=>release=r);
 const pending=x.source(patientId);x.set({...x.get(),account:'lourdes',permissions:{estudios:false}});release([observation]);
 await assert.rejects(pending,{code:'STALE_CONTEXT'});
});
test('ambiguous identity, wrong patient, and pagination fail without presenting partial data',async()=>{
 for(const variant of ['duplicate','wrongPatient','next']){const x=setup();const rows=variant==='duplicate'?[observation,observation]:variant==='wrongPatient'?[{...observation,subject:{reference:'Patient/other'}}]:[observation];
 if(variant==='next')rows.bundle={link:[{relation:'next',url:'not-followed'}]};
 x.get().client.searchResources=async type=>type==='Observation'?rows:[];
 await assert.rejects(x.source(patientId));}
});
const patientId='synthetic-patient';
const observation={resourceType:'Observation',id:'obs-a',subject:{reference:`Patient/${patientId}`},valueQuantity:{value:15.2,unit:'mil/µL'}};
function setup(permission=true){const calls=[];let ctx={patientId,account:'carmen',role:'self',permissions:{estudios:permission},client:{async searchResources(type,params,options){calls.push({type,params,options});return type==='Observation'?[observation]:[];}}};return {calls,get:()=>ctx,set:v=>ctx=v,source:createAuthorizedResultsSource(()=>ctx)};}
test('authorized results use provided SDK client and preserve unknown interpretation',async()=>{const x=setup();const rows=await x.source(patientId);assert.equal(rows[0].valueQuantity.value,15.2);assert.equal(rows[0].interpretation,undefined);assert.equal(x.calls.length,2);assert.equal(x.calls[0].params.patient,`Patient/${patientId}`);});
test('denied and unknown access never call source',async()=>{for(const permission of [false,undefined]){const x=setup(permission);x.get().permissions.estudios=permission;await assert.rejects(x.source(patientId));assert.equal(x.calls.length,0);}});
