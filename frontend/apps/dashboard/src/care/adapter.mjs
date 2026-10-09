import { CARMEN_CARE_FIXTURE } from './care.mjs';
import { loadLiveCare } from '../live/portal.mjs';
// Approved LOCAL MOCK mapping only. Discharge instructions are not current instructions.
export function carePermissions(session) {
 const p=session?.permissions??{};
 return {team:p.visita,instructions:p.visita,medicines:p.medicinas};
}
function fixtureCategory(patientId, category) {
 if(patientId==='lourdes') return category==='team'?null:[];
 if(patientId!=='carmen') throw new Error('Unknown mock patient');
 return CARMEN_CARE_FIXTURE[category==='team'?'participant':category];
}
export async function loadCare(session, source=fixtureCategory, isCurrent=()=>true) {
 const permissions=carePermissions(session),data={};
 // Integrated mode: server data in the same shape (src/live/portal.mjs); never the fixture.
 if(session?.live?.care)return loadLiveCare(session,permissions,isCurrent);
 const id=session?.patient?.id;
 if(!['carmen','lourdes'].includes(id))return {permissions:{},data};
 for(const category of ['team','instructions','medicines']) {
  // Check live permissions and generation BEFORE each category source, not after extraction/count.
  if(!isCurrent()) return null;
  if(carePermissions(session)[category]!==true)continue;
  const value=await source(id,category);
  if(!isCurrent())return null;
  data[category==='team'?'participant':category]=value;
 }
 return {permissions:carePermissions(session),data};
}
