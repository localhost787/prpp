// Test-only frontend harness: no network, login, credentials, or product entrypoint.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ResultsPanel from '../src/ResultsPanel.jsx';
import {Language} from '../src/Language.jsx';
import {Action,Label,Scale} from '../src/ui/Action.jsx';
import {surfaceStyles} from '../src/ui.mjs';
import {createAuthorizedResultsSource} from '../src/live/results-source.mjs';
let context;
window.reads=[];
const client={async searchResources(type){window.reads.push(type);if(window.fail)throw Error('test-only failure');if(window.pause)await new Promise(r=>window.releaseResults=r);return type==='Observation'&&!window.empty?[{resourceType:'Observation',id:'test-observation',subject:{reference:'Patient/test-patient'},code:{text:'Resultado de prueba aislada'},valueQuantity:{value:27,unit:'u'},status:'preliminary'}]:[];}};
function Harness(){
 const [session,setSession]=useState(null);
 window.enterResults=(account='carmen',permission=true)=>{
  context={client,patientId:'test-patient',account,role:account==='carmen'?'self':'delegate',permissions:{estudios:permission}};
  setSession({mode:'live',account,role:context.role,patient:{id:context.patientId},permissions:context.permissions,resultsSource:createAuthorizedResultsSource(()=>context)});
 };
 return <Language.Provider value="es"><Scale.Provider value={1}>{session&&<ResultsPanel session={session} Label={Label} Action={Action} styles={{...surfaceStyles,card:surfaceStyles.card}} scale={1} wide={false}/>}</Scale.Provider></Language.Provider>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
