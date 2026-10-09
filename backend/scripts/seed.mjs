#!/usr/bin/env node
// POR-35 · seed: fixed data of the demo case, from one data file (seed/datos-fijos.json).
// Idempotent: every resource is found by its business identifier and only updated (new version)
// when its content changed. Carmen's Patient is the one her invitation created: updated, never re-created.
// Needs scripts/demo-users.mjs first (accounts + the Patient created by the invitation).
// Usage: node scripts/seed.mjs

import { readFileSync } from 'node:fs';
import { createReference } from '@medplum/core';
import { env, required } from '../lib/env.mjs';
import { log, loginUser } from '../lib/medplum.mjs';
import { SYSTEMS } from '../lib/policies.mjs';

const DATA = JSON.parse(readFileSync(new URL('../seed/datos-fijos.json', import.meta.url), 'utf8'));

function strip(resource) {
  const { _comment, id, meta, ...rest } = resource;
  const keep = {};
  if (meta?.security) {
    keep.security = meta.security;
  }
  if (meta?.tag) {
    keep.tag = meta.tag;
  }
  return Object.keys(keep).length ? { ...rest, meta: keep } : rest;
}

/** Same content for the fields we manage (ignores server fields like id, versionId, lastUpdated). */
function differs(current, wanted) {
  for (const [key, value] of Object.entries(wanted)) {
    if (key === 'meta') {
      for (const [mk, mv] of Object.entries(value)) {
        if (JSON.stringify(current.meta?.[mk]) !== JSON.stringify(mv)) {
          return true;
        }
      }
    } else if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      return true;
    }
  }
  return false;
}

async function upsertByIdentifier(medplum, resource) {
  const wanted = strip(resource);
  const { system, value } = wanted.identifier[0];
  const found = await medplum.searchResources(wanted.resourceType, { identifier: `${system}|${value}` });
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

async function updateCarmen(medplum) {
  const id = required('DEMO_CARMEN_PATIENT_ID');
  const current = await medplum.readResource('Patient', id);
  const wanted = DATA.carmen;
  if (!differs(current, wanted)) {
    log('same', `Patient/${id} Carmen (version ${current.meta.versionId})`);
    return current;
  }
  const updated = await medplum.updateResource(
    { ...current, ...wanted },
    { headers: { 'If-Match': `W/"${current.meta.versionId}"` } }
  );
  log('fix', `Patient/${id} Carmen -> version ${updated.meta.versionId}`);
  return updated;
}

async function main() {
  const started = Date.now();
  const projectId = required('MEDPLUM_PROJECT_ID');
  const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);

  const org = await upsertByIdentifier(admin, DATA.organization);
  for (const location of DATA.locations) {
    await upsertByIdentifier(admin, { ...location, managingOrganization: createReference(org) });
  }
  for (const practitioner of DATA.practitioners) {
    await upsertByIdentifier(admin, practitioner);
  }
  const carmen = await updateCarmen(admin);
  await upsertByIdentifier(admin, { ...DATA.sensitive, subject: createReference(carmen) });

  await verify(admin, carmen);
  log('ok', `seed done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

async function verify(admin, carmen) {
  const count = async (type, params) => (await admin.searchResources(type, { ...params, _count: '100' })).length;
  const orgs = await count('Organization', { name: 'Hospital Demo' });
  log(orgs === 1 ? 'ok' : 'FAIL', `Organization?name=Hospital Demo -> ${orgs}`);
  const locations = (await admin.searchResources('Location', { _count: '100' })).map((l) => l.name).sort();
  log(locations.length === 3 ? 'ok' : 'FAIL', `Location -> ${locations.length}: ${locations.join(' | ')}`);
  const staff = (await admin.searchResources('Practitioner', { identifier: 'urn:hospital-demo:personal|', _count: '100' }))
    .map((p) => p.name?.[0]?.text)
    .sort();
  log(staff.length === 5 ? 'ok' : 'FAIL', `Practitioner (hospital staff) -> ${staff.length}: ${staff.join(' | ')}`);
  const carmens = await admin.searchResources('Patient', { identifier: `${SYSTEMS.mrn}|MRN-0001` });
  const c = carmens[0];
  const good =
    carmens.length === 1 &&
    c.id === env.DEMO_CARMEN_PATIENT_ID &&
    c.name?.[0]?.family === 'Rivera Colón' &&
    c.communication?.[0]?.language?.coding?.[0]?.code === 'es-PR';
  log(good ? 'ok' : 'FAIL', `Patient?identifier=MRN-0001 -> ${carmens.length}, id = invitation profile, family "${c?.name?.[0]?.family}", es-PR`);
  const rps = await admin.searchResources('RelatedPerson', { patient: `Patient/${carmen.id}` });
  log(rps.length === 2 ? 'ok' : 'FAIL', `RelatedPerson?patient=Carmen -> ${rps.map((r) => r.relationship?.[0]?.text).join(', ')}`);
  const sensitive = await admin.searchResources('Observation', {
    subject: `Patient/${carmen.id}`,
    _security: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R',
  });
  log(sensitive.length === 1 ? 'ok' : 'FAIL', `Observation with label R for Carmen -> ${sensitive.length}`);
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
