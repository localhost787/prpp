#!/usr/bin/env node
// Sends case messages to hl7-a-fhir as the simulator client. For tests and evidence.
// Usage: node scripts/send-hl7.mjs a04 a08 ...   |   node scripts/send-hl7.mjs tour
import { required } from '../lib/env.mjs';
import { log, loginClient } from '../lib/medplum.mjs';
import { buildMessages, todayPR } from '../simulator/mensajes.mjs';
import { sendHl7 } from '../simulator/core.mjs';

const msgs = buildMessages(todayPR());
const ids = process.argv.slice(2);
const list = ids[0] === 'tour' ? msgs.filter((m) => m.tour) : ids.map((id) => msgs.find((m) => m.id === id));
if (!list.length || list.some((m) => !m)) {
  console.error(`Usage: send-hl7.mjs tour | ${msgs.map((m) => m.id).join(' ')}`);
  process.exit(2);
}
const sim = await loginClient(required('SIMULATOR_CLIENT_ID'), required('SIMULATOR_CLIENT_SECRET'));
for (const m of list) {
  const started = Date.now();
  const r = await sendHl7(sim, required('BOT_HL7_ID'), m.texto);
  log(r.ok ? 'ok' : 'FAIL', `${m.id.padEnd(10)} ${m.tipo.padEnd(8)} -> ${r.status} ${r.msa} (${Date.now() - started} ms)`);
}
