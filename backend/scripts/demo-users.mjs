#!/usr/bin/env node
// POR-33 · demo-users (+ the portal AccessPolicies they need, so no membership is ever left without entries)
// Idempotent. Accounts (synthetic people, example.com addresses):
//   Carmen Rivera Colón  · Patient (MRN-0001)            · policy "Paciente (portal)"
//   Lourdes Rivera       · RelatedPerson of Carmen (hija) · visita + medicinas + instrucciones for Carmen,
//                          and her own Patient (MRN-0002, "Mi salud") linked through Person
//   Rafael Rivera        · RelatedPerson of Carmen (esposo) · the 4 categories
//   simulador-hospital   · ClientApplication, minimal policy (run hl7-a-fhir, create/delete visit data)
// Passwords and the client secret are generated once and stored only in the local env file.
// Usage: node scripts/demo-users.mjs

import { randomBytes } from 'node:crypto';
import { createReference } from '@medplum/core';
import { env, required, saveEnv } from '../lib/env.mjs';
import { log, loginClient, loginUser, rawRequest } from '../lib/medplum.mjs';
import { ALL_PORTAL_POLICIES, CATEGORIES, SYSTEMS } from '../lib/policies.mjs';
import { upsertAccessPolicy, upsertClient } from '../lib/project.mjs';
import { setSharing } from '../lib/sharing.mjs';
import { SIMULATOR_POLICY } from '../lib/simulator-policy.mjs';

export const PEOPLE = {
  carmen: { key: 'CARMEN', email: 'carmen@example.com', firstName: 'Carmen', lastName: 'Rivera Colón', mrn: 'MRN-0001' },
  lourdes: {
    key: 'LOURDES',
    email: 'lourdes@example.com',
    firstName: 'Lourdes',
    lastName: 'Rivera',
    mrn: 'MRN-0002',
    relationship: 'hija',
    shares: ['visita', 'medicinas', 'instrucciones'],
  },
  rafael: {
    key: 'RAFAEL',
    email: 'rafael@example.com',
    firstName: 'Rafael',
    lastName: 'Rivera',
    relationship: 'esposo',
    shares: [...CATEGORIES],
  },
};

function password(person) {
  const key = `DEMO_${person.key}_PASSWORD`;
  if (!env[key]) {
    saveEnv(`DEMO_${person.key}_EMAIL`, person.email);
    saveEnv(key, randomBytes(15).toString('base64url'));
  }
  return env[key];
}

/** Membership whose profile has this email, or undefined. */
async function findMember(admin, resourceType, email) {
  const profile = await admin.searchOne(resourceType, { email });
  if (!profile) {
    return {};
  }
  const membership = await admin.searchOne('ProjectMembership', { profile: `${resourceType}/${profile.id}` });
  return { profile, membership };
}

async function ensureCarmen(admin, projectId, patientPolicy) {
  const person = PEOPLE.carmen;
  let { profile, membership } = await findMember(admin, 'Patient', person.email);
  if (!membership) {
    membership = await admin.invite(projectId, {
      resourceType: 'Patient',
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      password: password(person),
      sendEmail: false,
      scope: 'project',
      membership: { access: [{ policy: createReference(patientPolicy) }] },
    });
    profile = await admin.readReference(membership.profile);
    log('new', `Carmen Patient/${profile.id}`);
  } else {
    log('same', `Carmen Patient/${profile.id}`);
  }
  saveEnv('DEMO_CARMEN_PATIENT_ID', profile.id);
  return { profile, membership };
}

/** Patient record of Lourdes ("Mi salud"). Not an account by itself: her login is the RelatedPerson. */
async function ensureLourdesPatient(admin) {
  const person = PEOPLE.lourdes;
  const patient = await admin.createResourceIfNoneExist(
    {
      resourceType: 'Patient',
      identifier: [{ system: SYSTEMS.mrn, value: person.mrn }],
      name: [{ given: [person.firstName], family: person.lastName, text: `${person.firstName} ${person.lastName}` }],
      communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'es-PR' }], text: 'Español (PR)' } }],
    },
    `identifier=${SYSTEMS.mrn}|${person.mrn}`
  );
  saveEnv('DEMO_LOURDES_PATIENT_ID', patient.id);
  log('ok', `Lourdes Patient/${patient.id} (MRN-0002)`);
  return patient;
}

let noAccessPolicy;
function noAccessFor(patient) {
  return {
    policy: createReference(noAccessPolicy),
    parameter: [{ name: 'patient', valueReference: createReference(patient) }],
  };
}

async function ensureCaregiver(admin, projectId, person, carmen, extraAccess) {
  let { profile, membership } = await findMember(admin, 'RelatedPerson', person.email);
  if (!membership) {
    membership = await admin.invite(projectId, {
      resourceType: 'RelatedPerson',
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      password: password(person),
      sendEmail: false,
      scope: 'project',
      patient: createReference(carmen),
      // Born with "no access" for Carmen (an empty membership would mean full project access);
      // setSharing() below applies the approved seed.
      membership: { access: [...extraAccess, noAccessFor(carmen)] },
    });
    profile = await admin.readReference(membership.profile);
    log('new', `${person.firstName} RelatedPerson/${profile.id}`);
  } else {
    log('same', `${person.firstName} RelatedPerson/${profile.id}`);
  }
  if (profile.relationship?.[0]?.text !== person.relationship) {
    profile = await admin.updateResource({ ...profile, relationship: [{ text: person.relationship }] });
    log('fix', `${person.firstName} relationship = ${person.relationship}`);
  }
  saveEnv(`DEMO_${person.key}_RELATEDPERSON_ID`, profile.id);
  return { profile, membership };
}

async function main() {
  const projectId = required('MEDPLUM_PROJECT_ID');
  const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
  log('ok', 'project admin login');

  const policies = {};
  for (const policy of ALL_PORTAL_POLICIES) {
    policies[policy.name] = await upsertAccessPolicy(admin, policy);
  }
  const patientPolicy = policies['Paciente (portal)'];
  noAccessPolicy = policies['Familiar sin acceso'];

  const carmen = await ensureCarmen(admin, projectId, patientPolicy);
  const lourdesPatient = await ensureLourdesPatient(admin);
  const ownRecord = {
    policy: createReference(patientPolicy),
    parameter: [{ name: 'patient', valueReference: createReference(lourdesPatient) }],
  };
  const lourdes = await ensureCaregiver(admin, projectId, PEOPLE.lourdes, carmen.profile, [ownRecord]);
  const rafael = await ensureCaregiver(admin, projectId, PEOPLE.rafael, carmen.profile, []);

  // Person links Lourdes' two roles (API-03): RelatedPerson (caregiver) + Patient ("Mi salud").
  const person = await admin.createResourceIfNoneExist(
    {
      resourceType: 'Person',
      name: [{ given: ['Lourdes'], family: 'Rivera' }],
      link: [{ target: createReference(lourdes.profile) }, { target: createReference(lourdesPatient) }],
    },
    `link=RelatedPerson/${lourdes.profile.id}`
  );
  log('ok', `Person/${person.id} links RelatedPerson/${lourdes.profile.id} + Patient/${lourdesPatient.id}`);

  // Approved seed (POR-35): Lourdes visita+medicinas+instrucciones, Rafael the 4 categories.
  for (const [who, caregiver] of [
    [PEOPLE.lourdes, lourdes],
    [PEOPLE.rafael, rafael],
  ]) {
    const result = await setSharing(admin, {
      patient: carmen.profile,
      relatedPerson: caregiver.profile,
      share: who.shares,
      policies,
    });
    log(result.changed ? 'fix' : 'same', `${who.firstName} shares for Carmen = ${result.share.join(', ')}`);
  }

  // Simulator client (API-27): minimal policy.
  const simPolicy = await upsertAccessPolicy(admin, SIMULATOR_POLICY);
  const sim = await upsertClient(admin, projectId, 'simulador-hospital', 'POR-33: hospital simulator (127.0.0.1 only)', simPolicy);
  saveEnv('SIMULATOR_CLIENT_ID', sim.id);
  saveEnv('SIMULATOR_CLIENT_SECRET', sim.secret);

  await verify(admin, projectId, carmen.profile, lourdesPatient);
}

async function verify(admin, projectId, carmen, lourdesPatient) {
  // Logins: each account gets the right profile from auth/me.
  const expected = [
    [PEOPLE.carmen, `Patient/${carmen.id}`],
    [PEOPLE.lourdes, `RelatedPerson/${env.DEMO_LOURDES_RELATEDPERSON_ID}`],
    [PEOPLE.rafael, `RelatedPerson/${env.DEMO_RAFAEL_RELATEDPERSON_ID}`],
  ];
  for (const [person, profileRef] of expected) {
    const medplum = await loginUser(person.email, password(person), projectId);
    const me = await medplum.get('auth/me', { cache: 'no-cache' });
    const got = `${me.profile.resourceType}/${me.profile.id}`;
    const patientOk = me.profile.resourceType === 'Patient' || me.profile.patient?.reference === `Patient/${carmen.id}`;
    log(got === profileRef && patientOk ? 'ok' : 'FAIL', `${person.firstName} login, auth/me profile ${got}`);
  }

  const sim = await loginClient(required('SIMULATOR_CLIENT_ID'), required('SIMULATOR_CLIENT_SECRET'));
  log(sim.getAccessToken() ? 'ok' : 'FAIL', 'simulador-hospital client credentials token');
  const neg = await rawRequest(sim, 'POST', 'fhir/R4/Practitioner', { resourceType: 'Practitioner' });
  log(neg.status === 403 ? 'ok' : 'FAIL', `negative: simulator POST Practitioner -> ${neg.status}`);

  // Idempotence counts.
  const carmens = await admin.searchResources('Patient', { name: 'Carmen' });
  log(carmens.length === 1 ? 'ok' : 'FAIL', `Patient?name=Carmen -> ${carmens.length}`);
  const rps = await admin.searchResources('RelatedPerson', { patient: `Patient/${carmen.id}` });
  log(rps.length === 2 ? 'ok' : 'FAIL', `RelatedPerson?patient=Carmen -> ${rps.length} (${rps.map((r) => r.relationship?.[0]?.text).join(', ')})`);
  const lourdesPatients = await admin.searchResources('Patient', { identifier: `${SYSTEMS.mrn}|MRN-0002` });
  log(lourdesPatients.length === 1 && lourdesPatients[0].id === lourdesPatient.id ? 'ok' : 'FAIL', `Patient MRN-0002 -> ${lourdesPatients.length}`);
  for (const person of Object.values(PEOPLE)) {
    const user = await admin.searchOne('User', { email: person.email });
    log(user?.project?.reference === `Project/${projectId}` ? 'ok' : 'FAIL', `${person.firstName} is a project-scoped user (scope: project)`);
  }
  const consents = await admin.searchResources('Consent', { patient: `Patient/${carmen.id}` });
  const classes = consents.map((c) => `${c.provision?.actor?.[0]?.reference?.reference}:${(c.provision?.class ?? []).map((x) => x.code).join('+')}`);
  log(consents.length === 2 ? 'ok' : 'FAIL', `Consent?patient=Carmen -> ${consents.length} (one per person) ${classes.join(' ')}`);
  for (const key of ['carmen', 'lourdes', 'rafael']) {
    const resourceType = key === 'carmen' ? 'Patient' : 'RelatedPerson';
    const { membership } = await findMember(admin, resourceType, PEOPLE[key].email);
    const n = membership.access?.length ?? 0;
    log(n > 0 || membership.accessPolicy ? 'ok' : 'FAIL', `${PEOPLE[key].firstName} membership entries = ${n} (never empty)`);
  }
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
