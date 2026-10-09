// Seed-side entry point to the same sharing logic the Bot "compartir-familia" runs.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bot = require('../bots/compartir-familia.cjs');

/**
 * Sets what `relatedPerson` may see of `patient` (membership entries + Consent).
 * @param {object} medplum - project admin client
 * @param {{ patient: object, relatedPerson: object, share: string[], policies?: Record<string, object> }} args
 *   `policies` is keyed by AccessPolicy name (as returned by the setup scripts).
 */
export async function setSharing(medplum, { patient, relatedPerson, share, policies }) {
  let byCategory;
  if (policies) {
    byCategory = Object.fromEntries(Object.entries(bot.POLICY_NAMES).map(([key, name]) => [key, policies[name]]));
  }
  return bot.applySharing(medplum, {
    patientRef: `Patient/${patient.id}`,
    relatedPersonId: relatedPerson.id,
    share,
    policies: byCategory,
  });
}
