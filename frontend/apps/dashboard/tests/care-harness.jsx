import React,{useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import CareSection from '../src/care/CareSection.jsx';
import {Language} from '../src/Language.jsx';
let snapshot={status:'ready',section:'care',session:{patient:{id:'carmen',name:[{text:'Carmen'}]},permissions:{visita:true,medicinas:true}}};
const listeners=new Set();
const store={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
window.careSwitch=(patient,permissions)=>{snapshot={...snapshot,session:{patient:{id:patient,name:[{text:patient}]},permissions}};listeners.forEach(fn=>fn());};
window.careClose=()=>{snapshot={status:'closed'};listeners.forEach(fn=>fn());};
function Harness(){const state=useSyncExternalStore(store.subscribe,store.getSnapshot);return <Language.Provider value="en">{state.status==='ready'&&<CareSection key={JSON.stringify(state.session)} session={state.session} store={store} textScale={1}/>}</Language.Provider>;}
createRoot(document.getElementById('root')).render(<Harness/>);
