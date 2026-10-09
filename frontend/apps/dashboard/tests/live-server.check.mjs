// Live-server tests of the data layer with the demo accounts. Skipped when the local env file is absent.
// Env file: $PRPP_ENV_FILE or ~/.config/prpp/backend.env (outside the repo). Values are never printed.
// Changes sharing during the test and ALWAYS restores the approved seed (visita + medicinas + instrucciones).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildConfig } from '../src/live/config.mjs';
import { login, loginDemo, logout, getRoles, openLiveSession } from '../src/live/session.mjs';
import { loadAccess } from '../src/live/permissions.mjs';
import { getVisit, getStage, getResults, getNotices } from '../src/live/queries.mjs';
import { subscribe, closeAll } from '../src/live/realtime.mjs';
import { setFamilySharing } from '../src/live/sharing.mjs';

const ENV_FILE = process.env.PRPP_ENV_FILE ?? join(homedir(), '.config', 'prpp', 'backend.env');
const ALLOWED = ['MEDPLUM_BASE_URL', 'MEDPLUM_PROJECT_ID', 'DEMO_CARMEN_EMAIL', 'DEMO_CARMEN_PASSWORD', 'DEMO_LOURDES_EMAIL', 'DEMO_LOURDES_PASSWORD', 'DEMO_RAFAEL_EMAIL', 'DEMO_RAFAEL_PASSWORD', 'BOT_COMPARTIR_ID'];
const SEED = ['visita', 'medicinas', 'instrucciones'];

function readEnv() {
  if (!existsSync(ENV_FILE)) return null;
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && ALLOWED.includes(m[1])) out[m[1]] = m[2];
  }
  return out;
}
const env = readEnv();
const skip = env ? false : 'local env file not found';

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Medplum allows 5 logins per minute per IP: wait and retry on "Too Many Requests". */
async function withRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.cause?.message ?? err?.message ?? err);
      if (attempt >= 4 || err?.code !== 'LIVE_LOGIN_THROTTLED') throw new Error(`login failed for a demo account (${err?.code ?? 'unknown'})`);
      await sleep(Number(msg.match(/"_msBeforeNext":(\d+)/)?.[1] ?? 60000) + 1000);
    }
  }
}
const loginWithRetry = (email, password, cfg) => withRetry(() => login(email, password, cfg));

describe('live server (demo accounts)', { skip, timeout: 300000 }, () => {
  let cfg, carmen, lourdes, rafael, carmenId;
  const clients = [];
  const ctx = async (client, patientId) => ({ client, patientId, access: await loadAccess(client) });

  before(async () => {
    cfg = buildConfig({
      EXPO_PUBLIC_DATA_MODE: 'live',
      EXPO_PUBLIC_MEDPLUM_BASE_URL: env.MEDPLUM_BASE_URL,
      EXPO_PUBLIC_MEDPLUM_PROJECT_ID: env.MEDPLUM_PROJECT_ID,
      EXPO_PUBLIC_BOT_COMPARTIR_ID: env.BOT_COMPARTIR_ID,
    });
    assert.equal(cfg.live, true, 'env file must define the server and project');
    carmen = await loginWithRetry(env.DEMO_CARMEN_EMAIL, env.DEMO_CARMEN_PASSWORD, cfg);
    // Lourdes through the one-click demo path (EXPO_PUBLIC_DEMO_* shape; values only from the local env file).
    const demoCfg = buildConfig({
      EXPO_PUBLIC_MEDPLUM_BASE_URL: env.MEDPLUM_BASE_URL,
      EXPO_PUBLIC_MEDPLUM_PROJECT_ID: env.MEDPLUM_PROJECT_ID,
      EXPO_PUBLIC_DEMO_LOURDES_EMAIL: env.DEMO_LOURDES_EMAIL,
      EXPO_PUBLIC_DEMO_LOURDES_PASSWORD: env.DEMO_LOURDES_PASSWORD,
    });
    lourdes = await withRetry(() => loginDemo(demoCfg, 'lourdes'));
    rafael = await loginWithRetry(env.DEMO_RAFAEL_EMAIL, env.DEMO_RAFAEL_PASSWORD, cfg);
    clients.push(carmen, lourdes, rafael);
    carmenId = carmen.getProfile().id;
  });

  after(async () => {
    for (const c of clients) {
      closeAll(c);
      await logout(c);
    }
  });

  test('Carmen (Mi salud): one self role, visit + stage + results ok', async () => {
    const roles = await getRoles(carmen);
    assert.deepEqual(roles.map(r => r.role), ['self']);
    const session = await openLiveSession(carmen, roles[0]);
    assert.deepEqual(session.permissions, { visita: true, medicinas: true, instrucciones: true, estudios: true });
    const c = await ctx(carmen, carmenId);
    const visit = await getVisit(c);
    assert.equal(visit.status, 'ok');
    assert.ok(visit.data && Number.isInteger(visit.data.stage) && visit.data.patientId === carmenId);
    const stage = await getStage({ ...c, encounterId: visit.data.id });
    assert.equal(stage.status, 'ok');
    assert.equal(stage.data.stage, visit.data.stage);
    const results = await getResults({ ...c, encounterId: visit.data.id });
    assert.equal(results.status, 'ok');
    assert.ok(results.data.length > 0);
    assert.ok(results.data.every(o => o.resourceType === 'Observation'));
    assert.equal((await getNotices(c)).status, 'ok');
  });

  test('Lourdes caring for Carmen: results locked, visit ok; her own record is hers', async () => {
    const roles = await getRoles(lourdes);
    const delegate = roles.find(r => r.role === 'delegate');
    assert.equal(delegate?.patientId, carmenId);
    const c = await ctx(lourdes, carmenId);
    assert.deepEqual(await getResults(c), { status: 'locked' });
    const visit = await getVisit(c);
    assert.equal(visit.status, 'ok');
    assert.ok(visit.data);
    assert.deepEqual(c.access.permissionsFor(carmenId), { visita: true, medicinas: true, instrucciones: true, estudios: false });
    const own = roles.find(r => r.role === 'self');
    assert.ok(own, 'second role "Mi salud" from auth/me');
    assert.notEqual(own.patientId, carmenId);
    assert.equal(c.access.canView(own.patientId, 'estudios'), true);
  });

  test('Rafael caring for Carmen: 4 categories from auth/me, results ok, no own record', async () => {
    const c = await ctx(rafael, carmenId);
    assert.deepEqual(c.access.permissionsFor(carmenId), { visita: true, medicinas: true, instrucciones: true, estudios: true });
    assert.deepEqual((await getRoles(rafael)).map(r => r.role), ['delegate']);
    const results = await getResults(c);
    assert.equal(results.status, 'ok');
    assert.ok(results.data.length > 0);
  });

  test('realtime: Carmen binds a subscription over the WebSocket', async () => {
    let sub;
    try {
      const connected = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no binding within 15 s')), 15000);
        sub = subscribe(carmen, `Task?patient=Patient/${carmenId}`, {
          onConnect: info => { clearTimeout(timer); resolve(info); },
          onError: err => { clearTimeout(timer); reject(err); },
        });
      });
      assert.equal(typeof connected.subscriptionId, 'string');
      assert.ok(connected.subscriptionId.length > 0);
    } finally {
      sub?.unsubscribe();
    }
  });

  test('sharing: Carmen grants then revokes "estudios" to Lourdes (ok → locked); seed restored', async () => {
    const lourdesRp = lourdes.getProfile().id;
    try {
      const grant = await setFamilySharing(carmen, { relatedPersonId: lourdesRp, categories: [...SEED, 'estudios'] }, cfg);
      assert.equal(grant.status, 'ok');
      assert.deepEqual([...grant.data.compartir].sort(), [...SEED, 'estudios'].sort());
      const granted = await getResults(await ctx(lourdes, carmenId));
      assert.equal(granted.status, 'ok');
      assert.ok(granted.data.length > 0);
      const revoke = await setFamilySharing(carmen, { relatedPersonId: lourdesRp, categories: SEED }, cfg);
      assert.equal(revoke.status, 'ok');
      assert.deepEqual(await getResults(await ctx(lourdes, carmenId)), { status: 'locked' });
      // A family member cannot run the Bot.
      assert.equal((await setFamilySharing(lourdes, { relatedPersonId: lourdesRp, categories: [...SEED, 'estudios'] }, cfg)).status, 'error');
    } finally {
      const restore = await setFamilySharing(carmen, { relatedPersonId: lourdesRp, categories: SEED }, cfg);
      assert.equal(restore.status, 'ok', 'seed restore must succeed');
      assert.deepEqual([...restore.data.compartir].sort(), [...SEED].sort());
    }
  });
});
