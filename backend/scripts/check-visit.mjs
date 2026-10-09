#!/usr/bin/env node
// Evidence: what the Bot left on the server for Carmen's visit (as project admin, read only).
// Usage: node scripts/check-visit.mjs
import { required } from '../lib/env.mjs';
import { loginUser } from '../lib/medplum.mjs';

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), required('MEDPLUM_PROJECT_ID'));
const P = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
const s = (type, params) => admin.searchResources(type, { ...params, _count: '200' }, { cache: 'no-cache' });
const count = (arr, f) => Object.entries(arr.reduce((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {})).map(([k, v]) => `${k}:${v}`).join(' ');

const encounters = await s('Encounter', { patient: P });
console.log(`Encounter            ${encounters.length}  ${encounters.map((e) => `${e.identifier?.[0]?.value} ${e.class.code} ${e.status} ${e.location?.[0]?.location?.display ?? ''} ${e.priority?.text ?? ''} ${e.hospitalization?.dischargeDisposition?.coding?.[0]?.code ?? e.hospitalization?.dischargeDisposition?.text ?? ''}`).join(' | ')}`);
const v = encounters.find((e) => e.identifier?.[0]?.value === 'V-0001');
if (!v) {
  process.exit(0);
}
const E = `Encounter/${v.id}`;
const sr = await s('ServiceRequest', { patient: P, encounter: E });
console.log(`ServiceRequest       ${sr.length}  ${count(sr, (x) => x.status)}`);
const sp = await s('Specimen', { patient: P });
console.log(`Specimen             ${sp.length}`);
const dr = await s('DiagnosticReport', { patient: P, encounter: E });
console.log(`DiagnosticReport     ${dr.length}  ${dr.map((d) => `${d.code.text}=${d.status}`).join(', ')}`);
const obs = await s('Observation', { patient: P, encounter: E });
console.log(`Observation (visit)  ${obs.length}  ${count(obs, (o) => o.category?.[0]?.coding?.[0]?.code)}`);
const wbc = obs.find((o) => o.code.text === 'Glóbulos blancos');
console.log(`  Glóbulos blancos   ${wbc?.valueQuantity?.value} ${wbc?.valueQuantity?.unit} ${wbc?.referenceRange?.[0]?.text} ${wbc?.interpretation?.[0]?.coding?.[0]?.code}`);
const ma = await s('MedicationAdministration', { patient: P, context: E });
console.log(`MedicationAdmin      ${ma.length}  ${ma.map((m) => `${m.medicationCodeableConcept.text} ${m.dosage?.text} ${m.effectiveDateTime?.slice(11, 16)}`).join(', ')}`);
const com = await s('Communication', { subject: P, _sort: 'sent' });
console.log(`Communication        ${com.length}  ${count(com, (c) => c.category.map((x) => x.coding[0].code).join('+'))}`);
for (const c of com) {
  console.log(`  ${c.sent?.slice(11, 16)} [${c.category.map((x) => x.coding[0].code).join('+')}] ${c.payload[0].contentString}`);
}
const tasks = await s('Task', { patient: P, code: 'urn:portal:tarea|etapa' });
for (const t of tasks) {
  const input = Object.fromEntries(t.input.map((i) => [i.type.text, i.valueInteger ?? i.valueString]));
  console.log(`Task etapa           ${t.status} ${JSON.stringify(input)}`);
}
const prov = await s('Provenance', {});
console.log(`Provenance           ${prov.length}`);
