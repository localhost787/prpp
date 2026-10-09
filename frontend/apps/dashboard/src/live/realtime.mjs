// API-11: real-time via the SDK's subscription manager (one shared WebSocket on ws/subscriptions-r4,
// the same mechanism as useSubscription).
// Rules (observed on the live server):
// - Subscribe ONLY to categories auth/me allows. The server accepts a Subscription for a type the account
//   cannot read (201) and just never delivers its events, so the client must filter itself.
// - A notification is a hint, not the truth: onChange gets only the affected resource types; the UI
//   re-reads those sections (never renders the payload).
// - On account / patient / role change or logout: closeAll(client), then subscribe again.

/** Active subscriptions per client, so closeAll() can release every one of them. */
const registry = new WeakMap();
const track = (client, sub) => {
  if (!registry.has(client)) registry.set(client, new Set());
  registry.get(client).add(sub);
};
const untrack = (client, sub) => registry.get(client)?.delete(sub);

/**
 * subscribe(client, criteria, { onEvent, onConnect, onError }) → { criteria, unsubscribe }
 * onEvent({ resourceType }) — only the type of the changed resource (re-read it).
 * onConnect({ subscriptionId }) — the server acknowledged the binding.
 */
export function subscribe(client, criteria, { onEvent, onConnect, onError } = {}) {
  const manager = client.getSubscriptionManager();
  const emitter = manager.addCriteria(criteria);
  const onMessage = ev => {
    const resourceType = ev.payload?.entry?.[1]?.resource?.resourceType ?? null;
    onEvent?.({ resourceType });
  };
  const onConnected = ev => onConnect?.({ subscriptionId: ev.payload?.subscriptionId ?? null });
  const onFailure = ev => onError?.(ev.payload);
  emitter.addEventListener('message', onMessage);
  emitter.addEventListener('connect', onConnected);
  emitter.addEventListener('error', onFailure);
  let open = true;
  const sub = {
    criteria,
    unsubscribe() {
      if (!open) return;
      open = false;
      untrack(client, sub);
      emitter.removeEventListener('message', onMessage);
      emitter.removeEventListener('connect', onConnected);
      emitter.removeEventListener('error', onFailure);
      manager.removeCriteria(criteria);
    },
  };
  track(client, sub);
  return sub;
}

/** Exact criteria of API-11 for this patient, ONLY for categories access.canView() allows. */
export function criteriaFor(access, patientId) {
  const P = `Patient/${patientId}`;
  const can = category => access?.canView?.(patientId, category) === true;
  return [
    ...(can('visita') ? [`Encounter?patient=${P}`, `Task?patient=${P}`, `Communication?subject=${P}`] : []),
    ...(can('estudios') ? [`ServiceRequest?patient=${P}`, `DiagnosticReport?patient=${P}`, `Observation?patient=${P}`] : []),
    ...(can('medicinas') ? [`MedicationAdministration?patient=${P}`, `MedicationRequest?patient=${P}`] : []),
    ...(can('instrucciones') ? [`CarePlan?patient=${P}`, `Appointment?patient=${P}`] : []),
  ];
}

/**
 * Subscribes to every allowed criterion of one patient. Events are batched (~0.4 s) and delivered as
 * onChange({ types: Set<resourceType> }) — re-read those sections (and auth/me) from the server.
 */
export function subscribePatient(client, access, patientId, { onChange, onConnect, onError, batchMs = 400 } = {}) {
  let pending = new Set();
  let timer = null;
  const flush = () => {
    timer = null;
    const types = pending;
    pending = new Set();
    onChange?.({ types });
  };
  const subs = criteriaFor(access, patientId).map(criteria => subscribe(client, criteria, {
    onEvent: ({ resourceType }) => {
      if (!resourceType) return;
      pending.add(resourceType);
      timer ??= setTimeout(flush, batchMs);
    },
    onConnect: info => onConnect?.({ criteria, ...info }),
    onError,
  }));
  return {
    criteria: subs.map(s => s.criteria),
    unsubscribe() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = new Set();
      subs.forEach(s => s.unsubscribe());
    },
  };
}

/** Releases EVERY subscription of this client and closes its WebSocket. Call on account/patient/role change and logout. */
export function closeAll(client) {
  const subs = [...(registry.get(client) ?? [])];
  subs.forEach(s => s.unsubscribe());
  registry.delete(client);
  try {
    client?.getSubscriptionManager?.().closeWebSocket?.();
  } catch {
    // Never opened.
  }
  return subs.length;
}
