import {loadCare,carePermissions} from './adapter.mjs';
export function createCareController(source){
 let generation=0,state={status:'idle',data:{},permissions:{}};
 const listeners=new Set();
 const publish=next=>{state=next;listeners.forEach(fn=>fn());};
 return {
  getSnapshot:()=>state,
  subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  close(){++generation;publish({status:'idle',data:{},permissions:{}});},
  async open(session,getLive=()=>session,scenario='normal'){
   const request=++generation;
   const permissions=carePermissions(session);
   const signature=JSON.stringify(permissions);
   const current=()=>request===generation&&getLive()===session&&JSON.stringify(carePermissions(session))===signature;
   publish({status:'loading',data:{},permissions});
   if(['loading','error','empty'].includes(scenario)){
    publish({status:scenario==='empty'?'ready':scenario,data:{participant:null,instructions:[],medicines:[]},permissions});return;
   }
   const scoped=scenario==='denied'?{...session,permissions:{...session.permissions,medicinas:false}}:session;
   try{
    const result=await loadCare(scoped,source,current);
    if(current()&&result){
     if(scenario==='noParticipant')result.data.participant=null;
     publish({status:'ready',...result});
    }
   }catch{if(current())publish({status:'error',data:{},permissions});}
  }
 };
}
