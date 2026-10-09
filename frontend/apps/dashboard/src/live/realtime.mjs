// API-11: real-time via the SDK's subscription manager (one shared WebSocket on ws/subscriptions-r4,
// the same mechanism as useSubscription). A notification is a hint, not the truth: re-read on event.
// Never subscribe to categories auth/me does not allow (the server rejects them anyway).

/**
 * subscribe(client, criteria, { onEvent, onConnect, onError }) → { criteria, unsubscribe }
 * onEvent({ resource, bundle }) — entry 1 of the notification Bundle is the changed resource.
 * onConnect({ subscriptionId }) — the server acknowledged the binding.
 */
export function subscribe(client, criteria, { onEvent, onConnect, onError } = {}) {
  const manager = client.getSubscriptionManager();
  const emitter = manager.addCriteria(criteria);
  const onMessage = ev => {
    const bundle = ev.payload;
    onEvent?.({ resource: bundle?.entry?.[1]?.resource ?? null, bundle });
  };
  const onConnected = ev => onConnect?.({ subscriptionId: ev.payload?.subscriptionId ?? null });
  const onFailure = ev => onError?.(ev.payload);
  emitter.addEventListener('message', onMessage);
  emitter.addEventListener('connect', onConnected);
  emitter.addEventListener('error', onFailure);
  let open = true;
  return {
    criteria,
    unsubscribe() {
      if (!open) return;
      open = false;
      emitter.removeEventListener('message', onMessage);
      emitter.removeEventListener('connect', onConnected);
      emitter.removeEventListener('error', onFailure);
      manager.removeCriteria(criteria);
    },
  };
}

/** Exact criteria of API-11 for this patient, filtered by canView. */
export function criteriaFor(access, patientId) {
  const P = `Patient/${patientId}`;
  const can = category => access.canView(patientId, category);
  return [
    ...(can('visita') ? [`Encounter?patient=${P}`, `Task?patient=${P}`, `Communication?subject=${P}`] : []),
    ...(can('estudios') ? [`ServiceRequest?patient=${P}`, `DiagnosticReport?patient=${P}`, `Observation?patient=${P}`] : []),
    ...(can('medicinas') ? [`MedicationAdministration?patient=${P}`, `MedicationRequest?patient=${P}`] : []),
    ...(can('instrucciones') ? [`CarePlan?patient=${P}`, `Appointment?patient=${P}`] : []),
  ];
}

/**
 * Subscribes to every allowed criterion of one patient. Events are batched (~0.4 s) and delivered as
 * onChange({ types: Set<resourceType>, resources }) so the UI re-reads only the affected sections.
 * Call unsubscribe() on role change / logout / when auth/me changes, then subscribe again.
 */
export function subscribePatient(client, access, patientId, { onChange, onConnect, onError, batchMs = 400 } = {}) {
  let pending = [];
  let timer = null;
  const flush = () => {
    timer = null;
    const resources = pending;
    pending = [];
    onChange?.({ types: new Set(resources.map(r => r.resourceType)), resources });
  };
  const subs = criteriaFor(access, patientId).map(criteria => subscribe(client, criteria, {
    onEvent: ({ resource }) => {
      if (!resource) return;
      pending.push(resource);
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
      pending = [];
      subs.forEach(s => s.unsubscribe());
    },
  };
}
