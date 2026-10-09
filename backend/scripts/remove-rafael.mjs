#!/usr/bin/env node
// One-off cleanup after the scope change of 2026-10-09: the demo has two people (Carmen and Lourdes).
// Removes the former third demo account (RelatedPerson rafael@example.com) from the project:
//   1. its ProjectMembership, through DELETE admin/projects/<project>/members/<membership> (the "Remove User"
//      action of the Medplum App; Medplum 5.1.42 also deletes the User when it is project-scoped and this was
//      its only membership — packages/server/src/admin/project.ts)
//   2. the Consent(s) of Carmen that name it as actor
//   3. AuditEvents that name it and were created by our seeds (tag urn:portal:origen|simulado)
//   4. Subscriptions it authored (left over by a live test)
//   5. the RelatedPerson
//   6. the User, if step 1 did not already delete it
// Idempotent: a second run prints "nothing to remove". Prints only resource types and ids, never secrets.
// Then it checks: login with the old password fails (if DEMO_RAFAEL_PASSWORD is still in the env file),
// Consent?patient=Carmen and RelatedPerson?patient=Carmen only name Lourdes.
// Usage: node scripts/remove-rafael.mjs
import { env, required } from '../lib/env.mjs';
import { log, loginUser, newClient, rawRequest } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';

const EMAIL = 'rafael@example.com';
const projectId = required('MEDPLUM_PROJECT_ID');
const P = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
const LOURDES = `RelatedPerson/${required('DEMO_LOURDES_RELATEDPERSON_ID')}`;
const opts = { cache: 'no-cache' };

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
log('ok', 'project admin login');

let removed = 0;
let failed = 0;
async function remove(resourceType, id, how = () => admin.deleteResource(resourceType, id)) {
  try {
    await how();
    removed++;
    log('del', `${resourceType}/${id}`);
  } catch (err) {
    failed++;
    log('FAIL', `${resourceType}/${id}: ${err.message}`);
  }
}

const people = await admin.searchResources('RelatedPerson', { email: EMAIL }, opts);
for (const rp of people) {
  const ref = `RelatedPerson/${rp.id}`;
  log('info', `found ${ref}`);

  for (const m of await admin.searchResources('ProjectMembership', { profile: ref }, opts)) {
    await remove('ProjectMembership', m.id, async () => {
      const r = await rawRequest(admin, 'DELETE', `admin/projects/${projectId}/members/${m.id}`);
      if (r.status !== 200) {
        throw new Error(`HTTP ${r.status} ${r.body?.issue?.[0]?.details?.text ?? ''}`);
      }
    });
  }

  for (const c of await admin.searchResources('Consent', { actor: ref }, opts)) {
    await remove('Consent', c.id);
  }

  const audits = new Map();
  for (const param of ['agent', 'entity']) {
    for (const a of await admin.searchResources('AuditEvent', { [param]: ref, _count: '200' }, opts)) {
      audits.set(a.id, a);
    }
  }
  for (const a of audits.values()) {
    if (a.meta?.tag?.some((t) => t.system === SYSTEMS.origin && t.code === 'simulado')) {
      await remove('AuditEvent', a.id);
    } else {
      log('keep', `AuditEvent/${a.id} names ${ref} but was not created by our seeds (server record)`);
    }
  }

  for (const s of await admin.searchResources('Subscription', { _count: '500' }, opts)) {
    if (s.meta?.author?.reference === ref) {
      await remove('Subscription', s.id);
    }
  }

  await remove('RelatedPerson', rp.id);
}

for (const u of await admin.searchResources('User', { email: EMAIL }, opts)) {
  if (u.project?.reference !== `Project/${projectId}`) {
    log('keep', `User/${u.id} is not scoped to this project: not ours to delete`);
    continue;
  }
  await remove('User', u.id);
}

log(removed || failed ? 'ok' : 'same', removed || failed ? `removed ${removed}, failed ${failed}` : 'nothing to remove');

// ---------- verification ----------
const left = {
  RelatedPerson: (await admin.searchResources('RelatedPerson', { email: EMAIL }, opts)).length,
  User: (await admin.searchResources('User', { email: EMAIL }, opts)).length,
};
log(left.RelatedPerson === 0 && left.User === 0 ? 'ok' : 'FAIL', `left with ${EMAIL}: RelatedPerson ${left.RelatedPerson}, User ${left.User}`);
const rps = await admin.searchResources('RelatedPerson', { patient: P }, opts);
log(rps.length === 1 && `RelatedPerson/${rps[0].id}` === LOURDES ? 'ok' : 'FAIL', `RelatedPerson?patient=Carmen -> ${rps.map((r) => `RelatedPerson/${r.id}`).join(', ') || 'none'} (expected Lourdes only)`);
const consents = await admin.searchResources('Consent', { patient: P }, opts);
const actors = consents.map((c) => c.provision?.actor?.[0]?.reference?.reference);
log(consents.length === 1 && actors[0] === LOURDES ? 'ok' : 'FAIL', `Consent?patient=Carmen -> ${consents.length} (actors: ${actors.join(', ') || 'none'}; expected Lourdes only)`);
const lourdesMembership = await admin.searchOne('ProjectMembership', { profile: LOURDES }, opts);
log(lourdesMembership?.access?.length > 0 ? 'ok' : 'FAIL', `Lourdes membership entries = ${lourdesMembership?.access?.length ?? 0} (never empty)`);

if (env.DEMO_RAFAEL_PASSWORD) {
  const body = { email: EMAIL, password: env.DEMO_RAFAEL_PASSWORD, projectId, scope: 'openid', codeChallenge: 'x'.repeat(43), codeChallengeMethod: 'S256' };
  let r;
  for (let i = 0; i < 3; i++) {
    r = await rawRequest(newClient(), 'POST', 'auth/login', body, 'application/json');
    if (r.status !== 429) {
      break;
    }
    log('wait', 'login rate limit, retrying in 61 s');
    await new Promise((resolve) => setTimeout(resolve, 61000));
  }
  const text = r.body?.issue?.[0]?.details?.text ?? r.body?.error ?? '';
  log(r.status >= 400 && !r.body?.code ? 'ok' : 'FAIL', `login ${EMAIL} with the old password -> HTTP ${r.status} ${text}`);
} else {
  log('info', 'old password not in the env file: login check skipped');
}
process.exit(failed ? 1 : 0);
