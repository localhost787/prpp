// Idempotent "find by name, create or update" helpers for project admin resources.
import { createReference } from '@medplum/core';
import { log } from './medplum.mjs';

function sameContent(a, b, keys) {
  return keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * AccessPolicy by exact name. Updates it when resource/compartment changed.
 * AccessPolicy has no `description` element: document each policy in a code comment instead.
 */
export async function upsertAccessPolicy(medplum, policy) {
  const found = await medplum.searchResources('AccessPolicy', { 'name:exact': policy.name });
  if (found.length > 1) {
    throw new Error(`Expected at most 1 AccessPolicy named ${policy.name}, found ${found.length}`);
  }
  if (!found[0]) {
    const created = await medplum.createResource(policy);
    log('new', `AccessPolicy/${created.id} ${policy.name}`);
    return created;
  }
  const current = found[0];
  if (sameContent(current, policy, ['resource', 'compartment', 'ipAccessRule'])) {
    log('same', `AccessPolicy/${current.id} ${policy.name}`);
    return current;
  }
  const updated = await medplum.updateResource({ ...policy, id: current.id, meta: { versionId: current.meta?.versionId } });
  log('fix', `AccessPolicy/${updated.id} ${policy.name}`);
  return updated;
}

/** Membership whose profile is `profileRef`, pointed at `policy`. */
export async function ensureMembershipPolicy(medplum, profileRef, policy) {
  const membership = await medplum.searchOne('ProjectMembership', { profile: profileRef });
  if (!membership) {
    throw new Error(`No ProjectMembership for ${profileRef}`);
  }
  if (membership.accessPolicy?.reference === `AccessPolicy/${policy.id}` && !membership.access?.length) {
    return membership;
  }
  const { access: _access, ...rest } = membership;
  const updated = await medplum.updateResource({ ...rest, accessPolicy: createReference(policy) });
  log('fix', `${profileRef} membership -> AccessPolicy ${policy.name}`);
  return updated;
}

/** ClientApplication by exact name, with its membership on `policy`. Returns the client (with secret). */
export async function upsertClient(medplum, projectId, name, description, policy) {
  let client = await medplum.searchOne('ClientApplication', { 'name:exact': name });
  if (!client) {
    client = await medplum.post(`admin/projects/${projectId}/client`, {
      name,
      description,
      accessPolicy: createReference(policy),
    });
    log('new', `ClientApplication/${client.id} ${name}`);
  } else {
    log('same', `ClientApplication/${client.id} ${name}`);
  }
  await ensureMembershipPolicy(medplum, `ClientApplication/${client.id}`, policy);
  return client;
}

/** Bot by exact name, with its membership on `policy`. */
export async function upsertBot(medplum, projectId, name, description, policy, extra = {}) {
  let bot = await medplum.searchOne('Bot', { 'name:exact': name });
  if (!bot) {
    bot = await medplum.post(`admin/projects/${projectId}/bot`, {
      name,
      description,
      runtimeVersion: 'vmcontext',
      accessPolicy: createReference(policy),
    });
    log('new', `Bot/${bot.id} ${name}`);
  } else {
    log('same', `Bot/${bot.id} ${name}`);
  }
  const wanted = { description, runtimeVersion: 'vmcontext', ...extra };
  if (!sameContent(bot, wanted, Object.keys(wanted))) {
    bot = await medplum.updateResource({ ...bot, ...wanted });
    log('fix', `Bot/${bot.id} ${name} fields`);
  }
  await ensureMembershipPolicy(medplum, `Bot/${bot.id}`, policy);
  return bot;
}
