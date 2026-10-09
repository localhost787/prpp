// Live data layer configuration. Public values only (EXPO_PUBLIC_* ends up in the bundle).
// Never put client secrets or tokens here. Demo passwords: see DEMO_ACCOUNTS below.
export const DATA_MODES = Object.freeze(['mock', 'live']);
export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Demo accounts (team decision): their email/password come ONLY from public env vars
 * EXPO_PUBLIC_DEMO_{CARMEN,LOURDES,RAFAEL}_{EMAIL,PASSWORD}, set in Vercel or in a local .env
 * that git ignores. Accepted risk: the values are visible in the public bundle (synthetic data,
 * non-admin least-privilege accounts, rotated after the hackathon). Never commit the values.
 */
export const DEMO_ACCOUNTS = Object.freeze([
  Object.freeze({ key: 'carmen', envKey: 'CARMEN', label: Object.freeze({ es: 'Carmen (paciente)', en: 'Carmen (patient)' }) }),
  Object.freeze({ key: 'lourdes', envKey: 'LOURDES', label: Object.freeze({ es: 'Lourdes (hija)', en: 'Lourdes (daughter)' }) }),
  Object.freeze({ key: 'rafael', envKey: 'RAFAEL', label: Object.freeze({ es: 'Rafael (esposo)', en: 'Rafael (husband)' }) }),
]);

const clean = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Demo accounts whose email AND password are both set. A missing variable hides that button. */
function demoAccountsFrom(source) {
  const out = [];
  for (const account of DEMO_ACCOUNTS) {
    const email = clean(source[`EXPO_PUBLIC_DEMO_${account.envKey}_EMAIL`]);
    const rawPassword = source[`EXPO_PUBLIC_DEMO_${account.envKey}_PASSWORD`];
    const password = typeof rawPassword === 'string' && rawPassword.length > 0 ? rawPassword : null;
    if (email && password) out.push(Object.freeze({ key: account.key, label: account.label, email, password }));
  }
  return Object.freeze(out);
}

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
  const complete = missing.length === 0;
  return Object.freeze({
    mode,
    baseUrl,
    projectId,
    botCompartirId,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    // Live is used only when asked for AND complete; otherwise the app stays on the mock.
    live: mode === 'live' && complete,
    missing: Object.freeze(missing),
    // Demo buttons log in to the REAL server, so they also need the server config.
    demoAccounts: complete ? demoAccountsFrom(source) : Object.freeze([]),
  });
}

/** What the UI may render for the demo buttons: key + label only (never the credentials). */
export const demoButtons = cfg => (cfg?.demoAccounts ?? []).map(({ key, label }) => ({ key, label }));

/** Reads the Expo public env. Each variable is referenced literally so Expo can inline it. */
export function readConfig() {
  let env = {};
  try {
    env = {
      EXPO_PUBLIC_DATA_MODE: process.env.EXPO_PUBLIC_DATA_MODE,
      EXPO_PUBLIC_MEDPLUM_BASE_URL: process.env.EXPO_PUBLIC_MEDPLUM_BASE_URL,
      EXPO_PUBLIC_MEDPLUM_PROJECT_ID: process.env.EXPO_PUBLIC_MEDPLUM_PROJECT_ID,
      EXPO_PUBLIC_BOT_COMPARTIR_ID: process.env.EXPO_PUBLIC_BOT_COMPARTIR_ID,
      EXPO_PUBLIC_DEMO_CARMEN_EMAIL: process.env.EXPO_PUBLIC_DEMO_CARMEN_EMAIL,
      EXPO_PUBLIC_DEMO_CARMEN_PASSWORD: process.env.EXPO_PUBLIC_DEMO_CARMEN_PASSWORD,
      EXPO_PUBLIC_DEMO_LOURDES_EMAIL: process.env.EXPO_PUBLIC_DEMO_LOURDES_EMAIL,
      EXPO_PUBLIC_DEMO_LOURDES_PASSWORD: process.env.EXPO_PUBLIC_DEMO_LOURDES_PASSWORD,
      EXPO_PUBLIC_DEMO_RAFAEL_EMAIL: process.env.EXPO_PUBLIC_DEMO_RAFAEL_EMAIL,
      EXPO_PUBLIC_DEMO_RAFAEL_PASSWORD: process.env.EXPO_PUBLIC_DEMO_RAFAEL_PASSWORD,
    };
  } catch {
    // No process.env (unusual runtime): stay on the mock.
  }
  return buildConfig(env);
}
