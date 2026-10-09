#!/usr/bin/env node
// POR-48 / POR-49 live part: WebSocket notifications to a family member follow the CURRENT permission.
// A: Lourdes has "medicinas"  -> a new RAS reaches Carmen (control) and Lourdes.
// B: Carmen removes all access -> a new RAS reaches Carmen, NOT Lourdes.
// The two test administrations (and their notices) are deleted at the end; Lourdes' seed is restored.
// Usage: node scripts/test-live-family.mjs
import { required } from '../lib/env.mjs';
import { log, loginClient, loginUser, rawRequest } from '../lib/medplum.mjs';
import { sendHl7 } from '../simulator/core.mjs';
import { todayPR } from '../simulator/mensajes.mjs';

const projectId = required('MEDPLUM_PROJECT_ID');
const P = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
const LOURDES_RP = required('DEMO_LOURDES_RELATEDPERSON_ID');
const SEED = ['visita', 'medicinas', 'instrucciones'];
const criteria = `MedicationAdministration?patient=${P}`;

let fails = 0;
const check = (name, ok, detail = '') => {
  fails += ok ? 0 : 1;
  console.log(`${ok ? 'pasa ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
};

async function listen(client) {
  const sub = await client.createResource({ resourceType: 'Subscription', status: 'active', reason: 'test-live-family', criteria, channel: { type: 'websocket' } });
  const binding = await client.get(client.fhirUrl('Subscription', sub.id, '$get-ws-binding-token'));
  const token = binding.parameter.find((p) => p.name === 'token').valueString;
  const ws = new WebSocket(binding.parameter.find((p) => p.name === 'websocket-url').valueUrl);
  const got = [];
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
  ws.addEventListener('message', (ev) => {
    const r = JSON.parse(ev.data).entry?.[1]?.resource;
    if (r?.resourceType === 'MedicationAdministration') {
      got.push({ at: Date.now(), id: r.id, text: r.medicationCodeableConcept?.text });
    }
  });
  return { got, close: async () => (ws.close(), client.deleteResource('Subscription', sub.id).catch(() => undefined)) };
}

function ras(tag) {
  const t = `${todayPR()}1100`;
  return [
    `MSH|^~\\&|SIM-HOSPITAL|HOSPITAL-DEMO|PRPP|PRPP|${t}||RAS^O17^RAS_O17|TEST-${tag}|P|2.5.1`,
    'PID|1||MRN-0001^^^HOSPITAL-DEMO^MR||RIVERA COLÓN^CARMEN||19540312|F',
    'PV1|1|E|cubiculo-12||||||||||||||||V-0001',
    `ORC|RE|M-TEST-${tag}`,
    `RXA|0|1|${t}|${t}|TEST^Medicina de prueba (se borra)^LOCAL|1|mg^mg`,
    'RXR|PO^por boca',
  ].join('\r');
}

const admin = await loginUser(required('MEDPLUM_PROJECT_ADMIN_EMAIL'), required('MEDPLUM_PROJECT_ADMIN_PASSWORD'), projectId);
const carmen = await loginUser(required('DEMO_CARMEN_EMAIL'), required('DEMO_CARMEN_PASSWORD'), projectId);
const lourdes = await loginUser(required('DEMO_LOURDES_EMAIL'), required('DEMO_LOURDES_PASSWORD'), projectId);
const sim = await loginClient(required('SIMULATOR_CLIENT_ID'), required('SIMULATOR_CLIENT_SECRET'));
const bot = (await carmen.searchResources('Bot', { name: 'compartir-familia' }))[0];
const share = (list) => rawRequest(carmen, 'POST', `fhir/R4/Bot/${bot.id}/$execute`, { familiar: LOURDES_RP, compartir: list }, 'application/json');
const tags = [];

async function round(label, expectLourdes) {
  const c = await listen(carmen);
  const l = await listen(lourdes);
  await new Promise((r) => setTimeout(r, 1500));
  const tag = `${Date.now()}`;
  tags.push(tag);
  const sent = Date.now();
  const ack = await sendHl7(sim, required('BOT_HL7_ID'), ras(tag));
  await new Promise((r) => setTimeout(r, 8000));
  const cMs = c.got[0] ? c.got[0].at - sent : undefined;
  const lMs = l.got[0] ? l.got[0].at - sent : undefined;
  check(`${label}: simulador RAS -> ${ack.msa}`, ack.ok);
  check(`${label}: Carmen (control) recibe en < 5 s`, cMs !== undefined && cMs < 5000, `${cMs} ms`);
  if (expectLourdes) {
    check(`${label}: Lourdes recibe en < 5 s`, lMs !== undefined && lMs < 5000, `${lMs} ms`);
  } else {
    check(`${label}: a Lourdes NO le llega nada (8 s esperando)`, lMs === undefined, `${l.got.length} notificaciones`);
  }
  await c.close();
  await l.close();
}

try {
  await share(SEED);
  await round('A · Lourdes con "medicinas"', true);
  const t0 = Date.now();
  const r = await share([]);
  log('ok', `Carmen quitó todo el acceso a Lourdes (${Date.now() - t0} ms, ${JSON.stringify(r.body?.compartir)})`);
  await round('B · Lourdes sin acceso', false);
} finally {
  await share(SEED);
  // Remove the test administrations and their notices (they are not part of the case).
  for (const tag of tags) {
    for (const [type, system] of [
      ['MedicationAdministration', 'urn:hospital-demo:administracion'],
      ['Communication', 'urn:portal:aviso-id'],
    ]) {
      const value = type === 'Communication' ? `V-0001-RAS-M-TEST-${tag}-1` : `M-TEST-${tag}-1`;
      for (const x of await admin.searchResources(type, { identifier: `${system}|${value}` })) {
        await admin.deleteResource(type, x.id);
      }
    }
  }
  const left = await admin.searchResources('MedicationAdministration', { patient: P }, { cache: 'no-cache' });
  log('ok', `limpieza: MedicationAdministration de Carmen = ${left.length} (las 3 del caso); seed de Lourdes restaurado`);
}
process.exit(fails ? 1 : 0);
