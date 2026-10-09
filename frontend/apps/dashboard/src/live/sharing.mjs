// API-15/16/17: the patient shares or revokes categories for ONE family member through the Bot
// "compartir-familia" ($execute). The portal never edits memberships or Consents itself.
import { CATEGORIES } from './permissions.mjs';
import { classifyError } from './fallback.mjs';

export const SHARE_SYSTEM = 'urn:portal:compartir';
const NO_CACHE = { cache: 'no-cache' };

/** Bot id: search by name (the patient policy allows it); otherwise the public EXPO_PUBLIC_BOT_COMPARTIR_ID. */
export async function resolveSharingBot(client, cfg = {}) {
  try {
    const bot = await client.searchOne('Bot', { name: 'compartir-familia' }, NO_CACHE);
    if (bot?.id) return bot.id;
  } catch {
    // Not searchable for this session: use the configured id.
  }
  if (cfg.botCompartirId) return cfg.botCompartirId;
  throw new Error('LIVE_SHARING_BOT_UNAVAILABLE');
}

/** Pure helper for a switch: current list with `category` turned on/off ("visita" is the base). */
export function toggleCategory(current, category, on) {
  const set = new Set((current ?? []).filter(c => CATEGORIES.includes(c)));
  if (on) set.add(category); else set.delete(category);
  if (category === 'visita' && !on) return []; // turning off the base = revoke everything
  return CATEGORIES.filter(c => set.has(c));
}

/**
 * setFamilySharing(client, { relatedPersonId, categories }, cfg)
 * → { status:'ok', data:{ compartir, familiares } } | { status:'error', error }
 * `relatedPersonId` is mandatory (without it the Bot would change every family member).
 * Empty `categories` = revoke all (API-17). The Bot adds "visita" when the list is not empty.
 */
export async function setFamilySharing(client, { relatedPersonId, categories }, cfg = {}) {
  try {
    if (typeof relatedPersonId !== 'string' || !/^[A-Za-z0-9\-.]{1,64}$/.test(relatedPersonId)) throw new Error('LIVE_SHARING_INVALID_FAMILY_MEMBER');
    if (!Array.isArray(categories) || categories.some(c => !CATEGORIES.includes(c))) throw new Error('LIVE_SHARING_INVALID_CATEGORY');
    const botId = await resolveSharingBot(client, cfg);
    const out = await client.executeBot(botId, { familiar: relatedPersonId, compartir: [...new Set(categories)] }, 'application/json');
    if (out?.ok !== true) throw new Error('LIVE_SHARING_REJECTED');
    return { status: 'ok', data: { compartir: out.compartir ?? [], familiares: out.familiares ?? [] } };
  } catch (error) {
    // UI: "No se pudo guardar" and leave the switch as it was.
    return { status: 'error', error: Object.assign(error, { kind: classifyError(error) }) };
  }
}

export const revokeFamilyAccess = (client, relatedPersonId, cfg) => setFamilySharing(client, { relatedPersonId, categories: [] }, cfg);

/**
 * API-15 (patient only): family members and what each one sees, from the latest Consent per person.
 * No Consent yet → ['visita']. Consent inactive → [].
 */
export async function listFamily(client, patientId) {
  try {
    const P = `Patient/${patientId}`;
    const people = await client.searchResources('RelatedPerson', { patient: P }, NO_CACHE);
    const data = await Promise.all(people.map(async rp => {
      const consent = (await client.searchResources('Consent', { patient: P, actor: `RelatedPerson/${rp.id}`, _sort: '-_lastUpdated', _count: '1' }, NO_CACHE))[0];
      const categories = !consent ? ['visita']
        : consent.status === 'inactive' ? []
          : (consent.provision?.class ?? []).filter(c => c.system === SHARE_SYSTEM || !c.system).map(c => c.code).filter(c => CATEGORIES.includes(c));
      const name = rp.name?.[0]?.text ?? [rp.name?.[0]?.given?.join(' '), rp.name?.[0]?.family].filter(Boolean).join(' ');
      return { id: rp.id, name: name || null, relationship: rp.relationship?.[0]?.text ?? null, categories };
    }));
    return { status: 'ok', data };
  } catch (error) {
    return { status: 'error', error: Object.assign(error, { kind: classifyError(error) }) };
  }
}
