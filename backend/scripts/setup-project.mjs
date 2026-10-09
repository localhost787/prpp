#!/usr/bin/env node
// POR-32 · project-setup
// Idempotent setup of the PRPP Medplum project. Safe to run more than once.
//
// 1. Super admin: create Project "PRPP" (once) with features exactly [bots, websocket-subscriptions].
// 2. Super admin: invite the project admin user (Practitioner, admin: true). Not the super admin.
// 3. Project admin: ClientApplication "deploy-bots" with a minimal AccessPolicy (Bot + Binary only).
// 4. Smoke test: deploy-bots deploys and executes a Bot; negative test: deploy-bots cannot create a Patient (403).
//
// Reads secrets from the local env file (see lib/env.mjs). Writes generated ids/secrets back to it.
// Usage: node scripts/setup-project.mjs

import { randomBytes } from 'node:crypto';
import { env, required, saveEnv } from '../lib/env.mjs';
import { log, loginClient, loginUser, rawRequest } from '../lib/medplum.mjs';
import { upsertAccessPolicy, upsertBot, upsertClient } from '../lib/project.mjs';

const PROJECT_NAME = 'PRPP';
const FEATURES = ['bots', 'websocket-subscriptions'];
const PROJECT_ADMIN = { firstName: 'PRPP', lastName: 'Admin', email: 'prpp-admin@example.com' };
const SMOKE_BOT_NAME = 'setup-smoke-test';

const DEPLOY_POLICY = {
  resourceType: 'AccessPolicy',
  name: 'deploy-bots',
  // Only the code may change. Fields like publicWebhook or runAsUser would let a leaked deploy
  // secret open a Bot to unauthenticated callers, so they are read-only for this client.
  resource: [
    {
      resourceType: 'Bot',
      interaction: ['read', 'vread', 'search', 'update'],
      readonlyFields: [
        'name',
        'identifier',
        'publicWebhook',
        'runAsUser',
        'system',
        'runtimeVersion',
        'timeout',
        'cronTiming',
        'cronString',
        'auditEventTrigger',
        'auditEventDestination',
        'category',
      ],
    },
    { resourceType: 'Binary', interaction: ['create', 'read'] },
  ],
};

async function main() {
  const superAdmin = await loginUser(required('MEDPLUM_SUPERADMIN_EMAIL'), required('MEDPLUM_SUPERADMIN_PASSWORD'));
  log('ok', 'super admin login');

  // 1. Project. Once known, the id in the env file wins over the name (anyone could register
  // another project named PRPP on this server).
  let project;
  if (env.MEDPLUM_PROJECT_ID) {
    project = await superAdmin.readResource('Project', env.MEDPLUM_PROJECT_ID);
    if (project.name !== PROJECT_NAME) {
      throw new Error(`Project/${project.id} is named ${project.name}, expected ${PROJECT_NAME}`);
    }
  } else {
    const matches = await superAdmin.searchResources('Project', { 'name:exact': PROJECT_NAME });
    if (matches.length > 1) {
      throw new Error(`Expected at most 1 Project named ${PROJECT_NAME}, found ${matches.length}`);
    }
    project = matches[0];
  }
  if (!project) {
    project = await superAdmin.createResource({ resourceType: 'Project', name: PROJECT_NAME, features: FEATURES });
    log('new', `Project/${project.id}`);
  } else {
    log('same', `Project/${project.id}`);
  }
  if (JSON.stringify(project.features ?? []) !== JSON.stringify(FEATURES)) {
    project = await superAdmin.updateResource({ ...project, features: FEATURES });
    log('fix', `features -> ${FEATURES.join(', ')}`);
  }
  log('ok', `features = ${JSON.stringify(project.features)}`);
  saveEnv('MEDPLUM_PROJECT_ID', project.id);

  // 2. Project admin user (day-to-day admin work and the Medplum MCP; not the super admin)
  if (!env.MEDPLUM_PROJECT_ADMIN_PASSWORD) {
    saveEnv('MEDPLUM_PROJECT_ADMIN_EMAIL', PROJECT_ADMIN.email);
    saveEnv('MEDPLUM_PROJECT_ADMIN_PASSWORD', randomBytes(18).toString('base64url'));
  }
  const members = await superAdmin.searchResources('ProjectMembership', {
    project: `Project/${project.id}`,
    _count: '100',
  });
  const userRefs = members.map((m) => m.user?.reference).filter((ref) => ref?.startsWith('User/'));
  const users = await Promise.all(userRefs.map((ref) => superAdmin.readReference({ reference: ref })));
  if (users.some((u) => u.email === PROJECT_ADMIN.email)) {
    log('same', `project admin ${PROJECT_ADMIN.email}`);
  } else {
    await superAdmin.invite(project.id, {
      resourceType: 'Practitioner',
      ...PROJECT_ADMIN,
      password: required('MEDPLUM_PROJECT_ADMIN_PASSWORD'),
      admin: true,
      sendEmail: false,
      scope: 'project',
    });
    log('new', `project admin ${PROJECT_ADMIN.email}`);
  }

  // 3. deploy-bots client, minimal policy
  const admin = await loginUser(PROJECT_ADMIN.email, required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), project.id);
  log('ok', 'project admin login');
  const deployPolicy = await upsertAccessPolicy(admin, DEPLOY_POLICY);
  const deployClient = await upsertClient(admin, project.id, 'deploy-bots', 'POR-32: deploys Bot code', deployPolicy);
  saveEnv('MEDPLUM_CLIENT_ID', deployClient.id);
  saveEnv('MEDPLUM_CLIENT_SECRET', deployClient.secret);

  // 4. Smoke test: bot created by admin (no data access), deployed + executed by deploy-bots
  const noAccess = await upsertAccessPolicy(admin, {
    resourceType: 'AccessPolicy',
    name: 'bot-sin-acceso',
    resource: [{ resourceType: 'Bot', readonly: true, criteria: 'Bot?name=never-matches' }],
  });
  const bot = await upsertBot(admin, project.id, SMOKE_BOT_NAME, 'POR-32 setup smoke test. Returns "ok".', noAccess);
  const deployer = await loginClient(required('MEDPLUM_CLIENT_ID'), required('MEDPLUM_CLIENT_SECRET'));
  log('ok', 'deploy-bots client login');
  await deployer.post(deployer.fhirUrl('Bot', bot.id, '$deploy'), {
    code: 'exports.handler = async function () { return "ok"; };',
    filename: 'index.js',
  });
  const output = await rawRequest(deployer, 'POST', `fhir/R4/Bot/${bot.id}/$execute`, { ping: true }, 'application/json');
  log(output.status === 200 && output.body === 'ok' ? 'ok' : 'FAIL', `Bot $execute -> ${output.status} ${JSON.stringify(output.body)}`);

  const negative = await rawRequest(deployer, 'POST', 'fhir/R4/Patient', { resourceType: 'Patient' });
  log(negative.status === 403 ? 'ok' : 'FAIL', `negative: deploy-bots POST Patient -> ${negative.status}`);

  const smoke = await deployer.readResource('Bot', bot.id);
  const tamper = await rawRequest(deployer, 'PUT', `fhir/R4/Bot/${bot.id}`, { ...smoke, publicWebhook: true });
  const after = await admin.readResource('Bot', bot.id);
  log(after.publicWebhook ? 'FAIL' : 'ok', `negative: deploy-bots sets publicWebhook -> ${tamper.status}, stored ${!!after.publicWebhook}`);

  const count = await superAdmin.searchResources('Project', { 'name:exact': PROJECT_NAME });
  log(count.length === 1 ? 'ok' : 'FAIL', `Project?name:exact=${PROJECT_NAME} -> ${count.length}`);
  const health = await (await fetch(superAdmin.getBaseUrl() + 'healthcheck')).json();
  log(health.version?.startsWith('5.1.42') ? 'ok' : 'FAIL', `server version ${health.version}`);
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
