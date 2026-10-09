#!/usr/bin/env node
// "Día 2" fixed data and the pre-registration Bot. Idempotent: running it twice creates nothing new.
//   POR-56 services-data (API-23): 3 Organization + 3 Location + 4 HealthcareService (seed/dia2-servicios.json)
//   POR-55 prereg-data (API-22): Questionnaire "pre-registro" (seed/dia2-prerregistro.json),
//          Bot "pre-registro" (bots/pre-registro.cjs, minimal policy) and the Subscription that runs it
//          when a QuestionnaireResponse of that Questionnaire is created or updated.
// Needs scripts/seed.mjs first (Organization "Hospital Demo").
// Usage: node scripts/seed-dia2.mjs
import { readFileSync } from 'node:fs';
import { createReference } from '@medplum/core';
import { required, saveEnv } from '../lib/env.mjs';
import { log, loginClient, loginUser } from '../lib/medplum.mjs';
import { upsertAccessPolicy, upsertBot } from '../lib/project.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const SERVICES = read('../seed/dia2-servicios.json');
const QUESTIONNAIRE = read('../seed/dia2-prerregistro.json');
const SIMULATED = { tag: [{ system: 'urn:portal:origen', code: 'simulado' }] };
const WRITE = ['create', 'read', 'vread', 'search', 'update', 'history'];
const READ = ['read', 'vread', 'search'];

/** Bot pre-registro: reads the form and the patient; writes only ITS planned visits and coverages. */
export const PREREG_BOT_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'Bot pre-registro',
  resource: [
    ...['Patient', 'Organization', 'QuestionnaireResponse'].map((resourceType) => ({ resourceType, interaction: READ })),
    { resourceType: 'Encounter', interaction: WRITE, criteria: 'Encounter?identifier=urn:portal:prerregistro|' },
    { resourceType: 'Coverage', interaction: WRITE, criteria: 'Coverage?identifier=urn:portal:prerregistro-plan|' },
  ],
};

function strip(resource) {
  const out = {};
  for (const [k, v] of Object.entries(resource)) {
    if (!k.startsWith('_') && !['key', 'organization', 'location'].includes(k)) {
      out[k] = v;
    }
  }
  return out;
}

function differs(current, wanted) {
  return Object.entries(wanted).some(([key, value]) =>
    key === 'meta'
      ? Object.entries(value).some(([mk, mv]) => JSON.stringify(current.meta?.[mk]) !== JSON.stringify(mv))
      : JSON.stringify(current[key]) !== JSON.stringify(value)
  );
}

async function upsertByIdentifier(medplum, wanted) {
  const { system, value } = wanted.identifier[0];
  const found = await medplum.searchResources(wanted.resourceType, { identifier: `${system}|${value}` }, { cache: 'no-cache' });
  if (found.length > 1) {
    throw new Error(`${wanted.resourceType} ${system}|${value}: ${found.length} copies (expected 1)`);
  }
  const current = found[0];
  if (!current) {
    const created = await medplum.createResource(wanted);
    log('new', `${wanted.resourceType}/${created.id} ${value}`);
    return created;
  }
  if (!differs(current, wanted)) {
    log('same', `${wanted.resourceType}/${current.id} ${value}`);
    return current;
  }
  const updated = await medplum.updateResource(
    { ...current, ...wanted, meta: { ...current.meta, ...(wanted.meta ?? {}) } },
    { headers: { 'If-Match': `W/"${current.meta.versionId}"` } }
  );
  log('fix', `${wanted.resourceType}/${updated.id} ${value} -> version ${updated.meta.versionId}`);
  return updated;
}

async function seedServices(admin) {
  const orgs = {};
  const hospital = await admin.searchOne('Organization', { identifier: 'urn:hospital-demo:org|hospital-demo' }, { cache: 'no-cache' });
  if (!hospital) {
    throw new Error('Falta la Organization "Hospital Demo": corra scripts/seed.mjs primero');
  }
  orgs['hospital-demo'] = hospital;
  for (const org of SERVICES.organizations) {
    orgs[org.identifier[0].value] = await upsertByIdentifier(admin, { ...strip(org), meta: SIMULATED });
  }
  const locations = {};
  for (const loc of SERVICES.locations) {
    locations[loc.key] = await upsertByIdentifier(admin, {
      ...strip(loc),
      meta: SIMULATED,
      managingOrganization: createReference(orgs[loc.organization]),
    });
  }
  for (const svc of SERVICES.services) {
    await upsertByIdentifier(admin, {
      ...strip(svc),
      meta: SIMULATED,
      providedBy: createReference(orgs[svc.organization]),
      ...(svc.location ? { location: [createReference(locations[svc.location])] } : {}),
    });
  }
}

async function seedPreregistration(admin, projectId) {
  const { _comment, ...questionnaire } = QUESTIONNAIRE;
  await upsertByIdentifier(admin, questionnaire);

  const policy = await upsertAccessPolicy(admin, PREREG_BOT_POLICY);
  const bot = await upsertBot(
    admin,
    projectId,
    'pre-registro',
    'POR-55: turns the pre-registration form into a planned ER visit + Coverage. API-22.',
    policy,
    { timeout: 30 }
  );
  saveEnv('BOT_PREREGISTRO_ID', bot.id);
  const deployer = await loginClient(required('MEDPLUM_CLIENT_ID'), required('MEDPLUM_CLIENT_SECRET'));
  const code = readFileSync(new URL('../bots/pre-registro.cjs', import.meta.url), 'utf8');
  await deployer.post(deployer.fhirUrl('Bot', bot.id, '$deploy'), { code, filename: 'index.js' });
  log('ok', `deployed Bot/${bot.id} pre-registro (${code.length} bytes)`);

  const criteria = `QuestionnaireResponse?questionnaire=${questionnaire.url}`;
  const wanted = {
    resourceType: 'Subscription',
    status: 'active',
    reason: 'POR-55: pre-registro -> visita planned (Bot pre-registro)',
    criteria,
    channel: { type: 'rest-hook', endpoint: `Bot/${bot.id}` },
  };
  const subs = (await admin.searchResources('Subscription', { url: `Bot/${bot.id}` }, { cache: 'no-cache' })).filter(
    (s) => s.criteria === criteria
  );
  if (subs.length > 1) {
    throw new Error(`Expected at most 1 Subscription for Bot pre-registro, found ${subs.length}`);
  }
  if (!subs[0]) {
    const created = await admin.createResource(wanted);
    log('new', `Subscription/${created.id} ${criteria}`);
  } else if (subs[0].status !== 'active') {
    await admin.updateResource({ ...subs[0], status: 'active' });
    log('fix', `Subscription/${subs[0].id} -> active`);
  } else {
    log('same', `Subscription/${subs[0].id} ${criteria}`);
  }
}

async function main() {
  const projectId = required('MEDPLUM_PROJECT_ID');
  const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
  await seedServices(admin);
  await seedPreregistration(admin, projectId);
  const svcs = await admin.searchResources('HealthcareService', { identifier: 'urn:portal:directorio|', _count: '100' }, { cache: 'no-cache' });
  log(svcs.length === 4 ? 'ok' : 'FAIL', `HealthcareService (directorio) -> ${svcs.length}: ${svcs.map((s) => s.name).join(' | ')}`);
  const qs = await admin.searchResources('Questionnaire', { name: 'pre-registro' }, { cache: 'no-cache' });
  log(qs.length === 1 ? 'ok' : 'FAIL', `Questionnaire?name=pre-registro -> ${qs.length} (${qs[0]?.item?.filter((i) => i.type === 'group').length} secciones)`);
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
