// Sends one HL7 message to the Bot hl7-a-fhir with the simulator client (API-27).
// Returns { ok, ack, status }: ok = the ACK contains MSA|AA.
import { rawRequest } from '../lib/medplum.mjs';

export async function sendHl7(simulator, botId, text) {
  const res = await rawRequest(simulator, 'POST', `fhir/R4/Bot/${botId}/$execute`, text, 'x-application/hl7-v2+er7');
  const ack = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  const msa = ack.split(/\r|\n/).find((s) => s.startsWith('MSA')) ?? '';
  return { ok: res.status === 200 && msa.startsWith('MSA|AA'), status: res.status, ack, msa };
}
