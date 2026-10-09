import React,{useLayoutEffect,useState,useSyncExternalStore} from 'react';
import {View} from 'react-native';
import {useLanguage} from '../Language.jsx';
import {Action,Label} from '../ui/Action.jsx';
import {palette} from '../ui.mjs';
import {uiCopy} from '../ui-copy.mjs';
import Disclosure from '../ui/Disclosure.jsx';
import CarePanel from './CarePanel.jsx';
import {createCareController} from './controller.mjs';
export default function CareSection({session,store,textScale}){
 const {language,t}=useLanguage();
 const copy=(key)=>uiCopy(language,key);
 const [controller]=useState(()=>createCareController());
 const [scenario,setScenario]=useState('normal');
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 useLayoutEffect(()=>{
  const live=()=>{const s=store.getSnapshot();return s.status==='ready'&&s.section==='care'?s.session:null;};
  const unsubscribe=store.subscribe(()=>{if(live()!==session)controller.close();});
  controller.open(session,live,scenario);
  return()=>{unsubscribe();controller.close();};
 },[session,store,controller,scenario]);
 return <View testID="section-card" style={{gap:16,minWidth:0}}>
  {state.status==='ready'?<CarePanel language={language} patientDisplayName={session.patient.name?.[0]?.text??''} permissions={state.permissions} data={state.data} textScale={textScale}/>:<View style={{gap:12}}>
   <Label testID="section-heading" accessibilityRole="header" style={{fontSize:28*textScale,lineHeight:36*textScale,fontWeight:'700'}}>{t('care')}</Label>
   <Label accessibilityLiveRegion="polite">{t(state.status==='error'?'careError':'careLoading')}</Label>
  </View>}
  <Disclosure title={copy('demoTools')}>
   <View testID="care-simulation" style={{padding:12,gap:12,borderWidth:1,borderColor:palette.borderSoft,borderRadius:10}}>
    <Label>{t('careSimulation')}</Label>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
     {['normal','denied','noParticipant','loading','error','empty'].map(value=><Action size="compact" key={value} label={t(`care_${value}`)} selected={scenario===value} onPress={()=>{if(value!==scenario){controller.close();setScenario(value);}}}>{t(`care_${value}`)}</Action>)}
    </View>
   </View>
  </Disclosure>
 </View>;
}
