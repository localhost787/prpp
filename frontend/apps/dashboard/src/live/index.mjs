// Live data layer (real Medplum server). Import from here; see docs/CONEXION-LIVE.md.
export { buildConfig, readConfig, DATA_MODES } from './config.mjs';
export { login, logout, getProfile, getAuthMe, getRoles, openLiveSession, createClient } from './session.mjs';
export { canView, createAccess, loadAccess, CATEGORIES, REPRESENTATIVE_TYPES } from './permissions.mjs';
export {
  getVisit, getCurrentEncounter, getStage, getCareTeam, getStudies, getResults, getNotices,
  getMedications, getPrescriptions, getCarePlan, getAppointments, getCare,
  liveVisitSource, liveResultsSource,
} from './queries.mjs';
export { subscribe, subscribePatient, criteriaFor } from './realtime.mjs';
export { setFamilySharing, revokeFamilyAccess, listFamily, toggleCategory, resolveSharingBot } from './sharing.mjs';
export { withFallback, withTimeout, classifyError, isUnreachable } from './fallback.mjs';
