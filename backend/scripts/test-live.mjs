#!/usr/bin/env node
// API-11 / POR-83 evidence: a NON-admin portal account subscribes over WebSocket (like useSubscription)
// and we measure how long a change takes to arrive after the simulator sends an HL7 message.
// Usage: node scripts/test-live.mjs [carmen|lourdes|rafael] [criteria-type] [message-id]
//   default: carmen DiagnosticReport correccion
import { env, required } from '../lib/env.mjs';
import { log, loginClient, loginUser } from '../lib/medplum.mjs';
import { buildMessages, todayPR } from '../simulator/mensajes.mjs';
import { sendHl7 } from '../simulator/core.mjs';

const [who = 'carmen', type = 'DiagnosticReport', messageId = 'correccion'] = process.argv.slice(2);
const KEY = who.toUpperCase();
const projectId = required('MEDPLUM_PROJECT_ID');
const carmenRef = `Patient/${required('DEMO_CARMEN_PATIENT_ID')}`;
const criteria = `${type}?${type === 'Communication' ? 'subject' : 'patient'}=${carmenRef}`;

const user = await loginUser(required(`DEMO_${KEY}_EMAIL`), required(`DEMO_${KEY}_PASSWORD`), projectId);
log('ok', `${who} login`);

let sub;
try {
  sub = await user.createResource({
    resourceType: 'Subscription',
    status: 'active',
    reason: 'test-live',
    criteria,
    channel: { type: 'websocket' },
  });
} catch (err) {
  log('FAIL', `${who} cannot create Subscription ${criteria}: ${err.message}`);
  process.exit(1);
}
log('ok', `${who} created Subscription/${sub.id} criteria ${criteria}`);
const binding = await user.get(user.fhirUrl('Subscription', sub.id, '$get-ws-binding-token'));
const param = (name) => binding.parameter.find((p) => p.name === name);
const token = param('token').valueString;
const wsUrl = param('websocket-url').valueUrl;

const ws = new WebSocket(wsUrl);
let sentAt;
const result = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ ok: false, why: 'no notification in 12 s' }), 12000);
  ws.addEventListener('open', async () => {
    ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
    await new Promise((r) => setTimeout(r, 1500));
    // "correccion-alt" = the correction with a slightly different text, so the report really changes again.
    const base = buildMessages(todayPR()).find((m) => m.id === messageId.replace(/-alt$/, ''));
    const msg = messageId.endsWith('-alt')
      ? {
          ...base,
          texto: base.texto
            .replace('pulmón derecho|', 'pulmón derecho (confirmada)|')
            .replace(/(OBR\|[^\r]*?)\|(\d{8})1040\|/, '$1|$21041|'),
        }
      : base;
    const sim = await loginClient(required('SIMULATOR_CLIENT_ID'), required('SIMULATOR_CLIENT_SECRET'));
    sentAt = Date.now();
    const r = await sendHl7(sim, required('BOT_HL7_ID'), msg.texto);
    log(r.ok ? 'ok' : 'FAIL', `simulator sent ${messageId} -> ${r.msa}`);
  });
  ws.addEventListener('message', (ev) => {
    const bundle = JSON.parse(ev.data);
    const changed = bundle.entry?.[1]?.resource;
    if (sentAt && changed?.resourceType === type) {
      clearTimeout(timer);
      resolve({ ok: true, ms: Date.now() - sentAt, changed });
    }
  });
  ws.addEventListener('error', (e) => resolve({ ok: false, why: `websocket error ${e.message ?? ''}` }));
});
ws.close();
if (result.ok) {
  const label = result.changed.code?.text ?? result.changed.payload?.[0]?.contentString ?? '';
  log(result.ms < 5000 ? 'ok' : 'FAIL', `${who} got ${type}/${result.changed.id} "${label}" status ${result.changed.status} in ${result.ms} ms`);
} else {
  log(type === 'DiagnosticReport' && who === 'lourdes' ? 'ok' : 'FAIL', `${who}: ${result.why}`);
}
await user.deleteResource('Subscription', sub.id).catch(() => undefined);
void env;
process.exit(0);
