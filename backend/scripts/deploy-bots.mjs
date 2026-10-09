#!/usr/bin/env node
// Creates (once) and deploys the product Bots. Idempotent.
// - Project admin: Bot resources + their minimal memberships (lib/bot-policies.mjs).
// - deploy-bots client (POR-32): uploads the code ($deploy). Never the admin.
// Usage: node scripts/deploy-bots.mjs

import { readFileSync } from 'node:fs';
import { required, saveEnv } from '../lib/env.mjs';
import { log, loginClient, loginUser } from '../lib/medplum.mjs';
import { HL7_BOT_POLICY, SHARING_BOT_POLICY } from '../lib/bot-policies.mjs';
import { upsertAccessPolicy, upsertBot } from '../lib/project.mjs';

const BOTS = [
  {
    name: 'hl7-a-fhir',
    file: 'bots/hl7-a-fhir.cjs',
    description: 'Translates the hospital simulator HL7 v2 messages (ADT, ORM, ORU, RAS) into FHIR. API-27.',
    policy: HL7_BOT_POLICY,
    admin: false,
    env: 'BOT_HL7_ID',
  },
  {
    name: 'compartir-familia',
    file: 'bots/compartir-familia.cjs',
    description: 'The patient chooses what each family member sees (4 categories). API-16, API-17.',
    policy: SHARING_BOT_POLICY,
    admin: true,
    env: 'BOT_COMPARTIR_ID',
  },
];

async function main() {
  const projectId = required('MEDPLUM_PROJECT_ID');
  const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
  const deployer = await loginClient(required('MEDPLUM_CLIENT_ID'), required('MEDPLUM_CLIENT_SECRET'));
  for (const spec of BOTS) {
    const policy = await upsertAccessPolicy(admin, spec.policy);
    const bot = await upsertBot(admin, projectId, spec.name, spec.description, policy, { timeout: 30 }, spec.admin);
    saveEnv(spec.env, bot.id);
    const code = readFileSync(new URL(`../${spec.file}`, import.meta.url), 'utf8');
    await deployer.post(deployer.fhirUrl('Bot', bot.id, '$deploy'), { code, filename: 'index.js' });
    log('ok', `deployed Bot/${bot.id} ${spec.name} (${code.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
