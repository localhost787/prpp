// READ-ONLY server check of the integrated mode (NOT part of npm test): signs in the 3 demo accounts
// through the same portal loader the app uses and asserts the shapes the screens receive.
// Run by hand: node --test tests/live-portal-server.check.mjs
// Env file: $PRPP_ENV_FILE or ~/.config/prpp/backend.env (outside the repo). Values are never printed.
// 3 sign-ins in total (server limit: 5 per minute per IP). Writes nothing.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildConfig } from '../src/live/config.mjs';
import { createIntegratedPortal } from '../src/live/portal.mjs';
import { loadVisit } from '../src/visit.mjs';
import { loadResults } from '../src/results.mjs';
import { loadCare } from '../src/care/adapter.mjs';
import { createCareModel } from '../src/care/care.mjs';

const ENV_FILE = process.env.PRPP_ENV_FILE ?? join(homedir(), '.config', 'prpp', 'backend.env');
const KEYS = ['MEDPLUM_BASE_URL', 'MEDPLUM_PROJECT_ID', 'BOT_COMPARTIR_ID', ...['CARMEN', 'LOURDES', 'RAFAEL'].flatMap(k => [`DEMO_${k}_EMAIL`, `DEMO_${k}_PASSWORD`])];
function readEnv() {
  if (!existsSync(ENV_FILE)) return null;
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && KEYS.includes(m[1])) out[m[1]] = m[2];
  }
  return out;
}
const env = readEnv();
const skip = env ? false : 'local env file not found';
const ALL = { visita: true, medicinas: true, instrucciones: true, estudios: true };

describe('integrated mode against the live server (read-only)', { skip, timeout: 300000 }, () => {
  let portal;
  const sessions = {};
  const open = async (account, role) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await portal.load(account, role);
      } catch (err) {
        if (err?.code !== 'LIVE_LOGIN_THROTTLED' || attempt >= 3) throw new Error(`could not open ${account}/${role} (${err?.code ?? 'unknown'})`);
        await new Promise(r => setTimeout(r, 61000));
      }
    }
  };

  before(async () => {
    const source = { EXPO_PUBLIC_DATA_MODE: 'live', EXPO_PUBLIC_MEDPLUM_BASE_URL: env.MEDPLUM_BASE_URL, EXPO_PUBLIC_MEDPLUM_PROJECT_ID: env.MEDPLUM_PROJECT_ID, EXPO_PUBLIC_BOT_COMPARTIR_ID: env.BOT_COMPARTIR_ID };
    for (const k of ['CARMEN', 'LOURDES', 'RAFAEL']) {
      source[`EXPO_PUBLIC_DEMO_${k}_EMAIL`] = env[`DEMO_${k}_EMAIL`];
      source[`EXPO_PUBLIC_DEMO_${k}_PASSWORD`] = env[`DEMO_${k}_PASSWORD`];
    }
    const cfg = buildConfig(source);
    assert.equal(cfg.live, true);
    assert.equal(cfg.demoAccounts.length, 3, 'the 3 demo accounts must be configured');
    portal = createIntegratedPortal({ cfg, openMock: () => { throw new Error('the mock must never be used in integrated mode'); } });
    assert.equal(portal.getSnapshot().mode, 'integrado');
    assert.equal((await portal.check()).availability, 'available');
    sessions.carmen = await open('carmen', 'self');
    sessions.lourdes = await open('lourdes', 'delegate');
    sessions.lourdesOwn = await open('lourdes', 'self'); // same sign-in reused
    sessions.rafael = await open('rafael', 'delegate');
  });

  after(async () => { await portal?.reset(); });

  test('Carmen (Mi salud): her visit and her results', async () => {
    const s = sessions.carmen;
    assert.ok(s.live);
    assert.deepEqual(s.permissions, ALL);
    assert.equal(typeof s.patient.name[0].text, 'string');
    const visit = await loadVisit(s);
    assert.equal(visit.status, 'ready');
    assert.equal(visit.visit.patientId, s.patient.id);
    assert.ok(Number.isInteger(visit.visit.stage) && visit.visit.stage >= 1 && visit.visit.stage <= 7);
    const results = await loadResults(s);
    assert.equal(results.status, 'ready');
    assert.ok(results.items.length > 0);
    assert.ok(results.items.every(i => i.resourceType === 'Observation' && i.code?.text));
    const care = await loadCare(s);
    assert.deepEqual(care.permissions, { team: true, instructions: true, medicines: true });
    assert.ok(care.data.medicines.length > 0);
    const discharge = await s.live.discharge();
    assert.equal(discharge.plan.status, 'ok');
    const family = await s.live.family();
    assert.equal(family.status, 'ok');
    const shared = Object.fromEntries(family.data.map(p => [p.relationship, [...p.categories].sort()]));
    assert.deepEqual(shared.hija, ['instrucciones', 'medicinas', 'visita'], 'seed: daughter = visita + medicinas + instrucciones');
    assert.deepEqual(shared.esposo, ['estudios', 'instrucciones', 'medicinas', 'visita'], 'seed: husband = 4 categories');
    console.log(`carmen: stage ${visit.visit.stage}, ${results.items.length} results, ${care.data.medicines.length} medicines, family ${family.data.length}`);
  });

  test('Lourdes caring for Carmen: results LOCKED; visit, medicines and instructions visible', async () => {
    const s = sessions.lourdes;
    assert.equal(s.patient.id, sessions.carmen.patient.id);
    assert.deepEqual(s.permissions, { visita: true, medicinas: true, instrucciones: true, estudios: false });
    assert.deepEqual(await loadResults(s), { status: 'restricted', items: [] });
    const visit = await loadVisit(s);
    assert.equal(visit.status, 'ready');
    assert.equal(visit.visit.stageKey, 'visitStagePrivate');
    const care = await loadCare(s);
    assert.equal(care.permissions.medicines, true);
    assert.ok(care.data.medicines.length > 0);
    assert.equal(createCareModel({ language: 'es', permissions: care.permissions, data: care.data }).sections.medicines.status, 'ready');
    const discharge = await s.live.discharge();
    assert.equal(discharge.plan.status, 'ok');
    assert.ok(discharge.plan.data);
    console.log(`lourdes/delegate: results locked, stage ${visit.visit.stage}, ${care.data.medicines.length} medicines, discharge plan ok`);
    // Her own record ("Mi salud") is a different patient with everything allowed.
    assert.notEqual(sessions.lourdesOwn.patient.id, s.patient.id);
    assert.deepEqual(sessions.lourdesOwn.permissions, ALL);
  });

  test('Rafael caring for Carmen: the 4 categories', async () => {
    const s = sessions.rafael;
    assert.deepEqual(s.permissions, ALL);
    const results = await loadResults(s);
    assert.equal(results.status, 'ready');
    assert.ok(results.items.length > 0);
    assert.equal((await loadVisit(s)).status, 'ready');
    assert.ok((await loadCare(s)).data.medicines.length > 0);
    assert.equal((await s.live.discharge()).plan.status, 'ok');
    console.log(`rafael/delegate: 4 categories, ${results.items.length} results`);
  });
});
