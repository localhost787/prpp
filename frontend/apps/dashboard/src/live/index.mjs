// Live data layer (real Medplum server). Import from here; see docs/CONEXION-LIVE.md.
export { buildConfig, readConfig, demoButtons, DATA_MODES, DEMO_ACCOUNTS } from './config.mjs';
export { login, loginDemo, logout, getProfile, getAuthMe, getRoles, openLiveSession, createClient, resolveLoginResponse, LiveLoginError } from './session.mjs';
export {
  canView, createAccess, loadAccess, isValidMe, ownPatientIds, familyCriteria,
  CATEGORIES, ANCHOR_TYPES, REPRESENTATIVE_TYPES, FAMILY_POLICY_NAMES, OWN_POLICY_NAME, NO_ACCESS_POLICY_NAME,
} from './permissions.mjs';
export {
  getVisit, getCurrentEncounter, getStage, getCareTeam, getStudies, getResults, getNotices,
  getMedications, getPrescriptions, getCarePlan, getAppointments, getCare,
  liveVisitSource, liveResultsSource,
} from './queries.mjs';
export { subscribe, subscribePatient, criteriaFor, closeAll } from './realtime.mjs';
export { setFamilySharing, revokeFamilyAccess, listFamily, toggleCategory, resolveSharingBot } from './sharing.mjs';
export { withLive, checkLive, resolveDataMode, withTimeout, classifyError, isUnreachable } from './fallback.mjs';
