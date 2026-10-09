// Live data layer configuration. Public values only (EXPO_PUBLIC_* ends up in the bundle).
// Never put passwords, client secrets or tokens here.
export const DATA_MODES = Object.freeze(['mock', 'live']);
export const DEFAULT_TIMEOUT_MS = 4000;

const clean = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Builds a config from a plain object (tests) using the same keys as the Expo env. */
export function buildConfig(source = {}) {
  const rawMode = clean(source.EXPO_PUBLIC_DATA_MODE)?.toLowerCase();
  const mode = DATA_MODES.includes(rawMode) ? rawMode : 'mock';
  const base = clean(source.EXPO_PUBLIC_MEDPLUM_BASE_URL);
  const baseUrl = base ? base.replace(/\/*$/, '/') : null;
  const projectId = clean(source.EXPO_PUBLIC_MEDPLUM_PROJECT_ID);
  const botCompartirId = clean(source.EXPO_PUBLIC_BOT_COMPARTIR_ID);
  const timeout = Number(source.timeoutMs);
  const missing = [
    ...(baseUrl ? [] : ['EXPO_PUBLIC_MEDPLUM_BASE_URL']),
    ...(projectId ? [] : ['EXPO_PUBLIC_MEDPLUM_PROJECT_ID']),
  ];
  return Object.freeze({
    mode,
    baseUrl,
    projectId,
    botCompartirId,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    // Live is used only when asked for AND complete; otherwise the app stays on the mock.
    live: mode === 'live' && missing.length === 0,
    missing: Object.freeze(missing),
  });
}

/** Reads the Expo public env. Each variable is referenced literally so Expo can inline it. */
export function readConfig() {
  let env = {};
  try {
    env = {
      EXPO_PUBLIC_DATA_MODE: process.env.EXPO_PUBLIC_DATA_MODE,
      EXPO_PUBLIC_MEDPLUM_BASE_URL: process.env.EXPO_PUBLIC_MEDPLUM_BASE_URL,
      EXPO_PUBLIC_MEDPLUM_PROJECT_ID: process.env.EXPO_PUBLIC_MEDPLUM_PROJECT_ID,
      EXPO_PUBLIC_BOT_COMPARTIR_ID: process.env.EXPO_PUBLIC_BOT_COMPARTIR_ID,
    };
  } catch {
    // No process.env (unusual runtime): stay on the mock.
  }
  return buildConfig(env);
}
