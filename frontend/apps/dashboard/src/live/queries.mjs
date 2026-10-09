// Live reads per contract (API-05, 06, 08, 09, 10, 12, 13, 14). Every function returns
//   { status: 'ok', data }      allowed by auth/me (data may be [] / null = "todavía no hay…")
//   { status: 'locked' }        auth/me does not allow that category (the server is not even asked)
//   { status: 'error', error }  allowed, but the read failed (technical error, not privacy)
// `ctx` = { client, access, patientId, encounterId? } — access from permissions.loadAccess().
// Read-only: nothing here writes to the server.
import { classifyError } from './fallback.mjs';

export const SYSTEMS = Object.freeze({
  task: 'urn:portal:tarea',
  notice: 'urn:portal:aviso',
  visit: 'urn:hospital-demo:visita',
});
const NO_CACHE = { cache: 'no-cache' };
const TZ = 'America/Puerto_Rico';

/** Runs `read` only if canView(patientId, category); maps failures to error (never to a lock). */
export async function guardedRead(ctx, category, read) {
  if (ctx?.access?.canView(ctx.patientId, category) !== true) return { status: 'locked' };
  try {
    return { status: 'ok', data: await read() };
  } catch (error) {
    // Allowed but failed: technical error. Locks come only from auth/me (contract §1.3).
    return { status: 'error', error: Object.assign(error instanceof Error ? error : new Error(String(error)), { kind: classifyError(error) }) };
  }
}

const P = ctx => `Patient/${ctx.patientId}`;
const withEncounter = (ctx, params, key = 'encounter') => (ctx.encounterId ? { ...params, [key]: `Encounter/${ctx.encounterId}` } : params);
const idOf = ref => ref?.reference?.split('/')[1] ?? null;
const input = (task, name) => {
  const i = (task?.input ?? []).find(x => x.type?.text === name);
  return i ? (i.valueInteger ?? i.valueString ?? i.valueBoolean ?? null) : null;
};
const inputs = (task, name) => (task?.input ?? []).filter(x => x.type?.text === name).map(x => x.valueString).filter(Boolean);
const sameText = text => (text == null ? null : { es: text, en: text }); // server texts are Spanish only
export const formatTimePR = iso => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)) : null);

// ---------- API-05 · visit (Encounter) ----------
export function mapEncounter(enc) {
  if (!enc) return null;
  const place = enc.location?.[0]?.location?.display ?? null;
  const cubicle = Number(place?.match(/cub[ií]culo\s*(\d+)/i)?.[1]);
  const level = Number(enc.priority?.text?.match(/(\d)/)?.[1]);
  return {
    id: enc.id,
    status: enc.status,
    classCode: enc.class?.code ?? null,
    startedAt: enc.period?.start ?? null,
    endedAt: enc.period?.end ?? null,
    place,
    cubicle: Number.isInteger(cubicle) ? cubicle : null,
    clinician: enc.participant?.[0]?.individual?.display ?? null,
    practitionerId: idOf(enc.participant?.[0]?.individual),
    level: Number.isInteger(level) ? level : null,
    discharge: enc.hospitalization?.dischargeDisposition?.coding?.[0]?.code ?? null,
    dischargeText: enc.hospitalization?.dischargeDisposition?.text ?? null,
  };
}
async function readEncounter(ctx) {
  const list = await ctx.client.searchResources('Encounter', { patient: P(ctx), _sort: '-_lastUpdated', _count: '5' }, NO_CACHE);
  return list.find(e => e.class?.code === 'EMER') ?? list[0] ?? null;
}
export const getCurrentEncounter = ctx => guardedRead(ctx, 'visita', async () => mapEncounter(await readEncounter(ctx)));

// ---------- API-06/07 · stage Task (only code=urn:portal:tarea|etapa; there are other Tasks) ----------
export function mapStageTask(task) {
  if (!task) return null;
  const stage = Number(input(task, 'etapa'));
  return {
    id: task.id,
    status: task.status,
    encounterId: idOf(task.encounter),
    stage: Number.isInteger(stage) && stage >= 1 && stage <= 7 ? stage : null,
    stageKey: input(task, 'etapa-clave'),
    stageName: input(task, 'nombre-etapa') ?? task.businessStatus?.text ?? null,
    stageText: input(task, 'texto-etapa'),
    next: input(task, 'que-sigue') ?? task.description ?? null,
    instructions: inputs(task, 'indicacion'),
    esi: input(task, 'esi'),
    peopleAhead: input(task, 'personas-antes'),
    estimatedWait: input(task, 'espera-estimada'),
    studiesInProgress: input(task, 'estudios-en-curso'),
    place: input(task, 'lugar'),
    clinician: input(task, 'medico'),
    updatedAt: task.lastModified ?? null,
  };
}
async function readStageTask(ctx) {
  const params = withEncounter(ctx, { patient: P(ctx), code: `${SYSTEMS.task}|etapa`, _sort: '-_lastUpdated', _count: '1' });
  return (await ctx.client.searchResources('Task', params, NO_CACHE))[0] ?? null;
}
export const getStage = ctx => guardedRead(ctx, 'visita', async () => mapStageTask(await readStageTask(ctx)));

/**
 * "Mi visita" in the SAME shape as visitFixture(): { id, patientId, status, stage, startedAt, cubicle,
 * clinician, level } plus live extras (encounter, stageInfo). null = no active visit.
 */
export const getVisit = ctx => guardedRead(ctx, 'visita', async () => {
  const enc = await readEncounter(ctx);
  if (!enc) return null;
  const stageInfo = mapStageTask(await readStageTask({ ...ctx, encounterId: enc.id }));
  if (!stageInfo?.stage) return null; // no stage Task → "No tiene una visita activa" (API-06)
  const e = mapEncounter(enc);
  return {
    id: e.id, patientId: ctx.patientId, status: e.status, stage: stageInfo.stage, startedAt: e.startedAt,
    cubicle: e.cubicle, clinician: e.clinician, level: e.level ?? stageInfo.esi ?? null,
    encounter: e, stageInfo,
  };
});

// ---------- API-08 · care team ----------
const ROLE_KEYS = { 'médica de emergencias': 'emergencyPhysician', 'médico de emergencias': 'emergencyPhysician' };
export function mapParticipant(enc, practitioner) {
  const ref = enc?.participant?.[0]?.individual;
  if (!ref) return null; // no participant → card hidden
  const roleText = practitioner?.qualification?.[0]?.code?.text ?? null;
  return {
    id: practitioner?.id ?? idOf(ref),
    name: sameText(practitioner?.name?.[0]?.text ?? ref.display ?? null),
    roleKey: ROLE_KEYS[roleText?.toLowerCase()] ?? null,
    roleText,
    location: sameText(enc.location?.[0]?.location?.display ?? null),
  };
}
async function readParticipant(ctx, enc) {
  const ref = enc?.participant?.[0]?.individual;
  let practitioner = null;
  if (ref?.reference?.startsWith('Practitioner/')) {
    try { practitioner = await ctx.client.readReference(ref); } catch { practitioner = null; }
  }
  return mapParticipant(enc, practitioner);
}
export const getCareTeam = ctx => guardedRead(ctx, 'visita', async () => readParticipant(ctx, await readEncounter(ctx)));

// ---------- API-09 · studies ----------
/** ready | corrected | preliminary | inProgress | collected | ordered | cancelled (contract API-09). */
export function studyStatus(order, reports = [], specimens = []) {
  if (order.status === 'revoked') return 'cancelled';
  const statuses = reports.map(r => r.status);
  if (statuses.some(s => s === 'amended' || s === 'corrected')) return 'corrected';
  if (statuses.includes('final') || order.status === 'completed') return 'ready';
  if (statuses.some(s => s === 'preliminary' || s === 'partial')) return 'preliminary';
  if (statuses.includes('registered')) return 'inProgress';
  if (specimens.length) return 'collected';
  return 'ordered';
}
export function mapStudies(orders, reports, specimens) {
  const based = (r, id) => (r.basedOn ?? []).some(b => b.reference === `ServiceRequest/${id}`);
  const forOrder = (s, id) => (s.request ?? []).some(b => b.reference === `ServiceRequest/${id}`);
  return orders.map(o => {
    const rs = reports.filter(r => based(r, o.id));
    const ss = specimens.filter(s => forOrder(s, o.id));
    return {
      id: o.id,
      title: o.code?.text ?? null,
      category: o.category?.[0]?.text ?? null,
      orderedAt: o.authoredOn ?? null,
      purpose: o.note?.[0]?.text ?? null,
      collectedAt: ss[0]?.collection?.collectedDateTime ?? null,
      reportStatus: rs[0]?.status ?? null,
      statusKey: studyStatus(o, rs, ss),
    };
  });
}
export const getStudies = ctx => guardedRead(ctx, 'estudios', async () => {
  const [orders, reports, specimens] = await Promise.all([
    ctx.client.searchResources('ServiceRequest', withEncounter(ctx, { patient: P(ctx) }), NO_CACHE),
    ctx.client.searchResources('DiagnosticReport', withEncounter(ctx, { patient: P(ctx) }), NO_CACHE),
    ctx.client.searchResources('Specimen', { patient: P(ctx) }, NO_CACHE),
  ]);
  return mapStudies(orders, reports, specimens);
});

// ---------- API-10 · results (same shape as resultFixtures(): Observation + optional `report`) ----------
export function attachReports(observations, reports) {
  return observations.map(o => {
    const r = reports.find(d => (d.result ?? []).some(x => x.reference === `Observation/${o.id}`));
    return r ? { ...o, report: { resourceType: 'DiagnosticReport', id: r.id, code: { text: r.code?.text ?? null }, status: r.status } } : { ...o };
  });
}
export const getResults = ctx => guardedRead(ctx, 'estudios', async () => {
  const [observations, reports] = await Promise.all([
    ctx.client.searchResources('Observation', withEncounter(ctx, { patient: P(ctx), category: 'laboratory,imaging', _sort: '-date' }), NO_CACHE),
    ctx.client.searchResources('DiagnosticReport', withEncounter(ctx, { patient: P(ctx) }), NO_CACHE),
  ]);
  return attachReports(observations, reports);
});

// ---------- API-12 · notices ----------
export function mapNotices(list, canSeeStudies) {
  return list
    .map(c => ({
      id: c.id,
      sent: c.sent ?? null,
      text: c.payload?.[0]?.contentString ?? null,
      categories: (c.category ?? []).flatMap(x => x.coding ?? []).filter(x => x.system === SYSTEMS.notice).map(x => x.code),
    }))
    // Only portal-side filter: hide the neutral twin when the session already sees the real result.
    .filter(n => !(canSeeStudies && n.categories.includes('neutral-familia')));
}
export const getNotices = ctx => guardedRead(ctx, 'visita', async () => {
  const list = await ctx.client.searchResources('Communication', { subject: P(ctx), _sort: '-sent', _count: '30' }, NO_CACHE);
  return mapNotices(list, ctx.access.canView(ctx.patientId, 'estudios'));
});

// ---------- API-13 · medicines given (same shape as CARMEN_CARE_FIXTURE.medicines) ----------
export function mapAdministration(m) {
  const dose = m.dosage?.dose;
  return {
    id: m.id,
    name: sameText(m.medicationCodeableConcept?.text ?? null),
    dose: dose?.value != null ? `${dose.value} ${dose.unit ?? ''}`.trim() : null,
    route: sameText(m.dosage?.route?.text ?? null),
    time: formatTimePR(m.effectiveDateTime ?? m.effectivePeriod?.start),
    purpose: sameText(m.note?.[0]?.text ?? null),
    mockOnly: false,
  };
}
export const getMedications = ctx => guardedRead(ctx, 'medicinas', async () =>
  (await ctx.client.searchResources('MedicationAdministration', withEncounter(ctx, { patient: P(ctx) }, 'context'), NO_CACHE)).map(mapAdministration));

// ---------- API-14 · discharge: prescriptions (medicinas), care plan + appointment (instrucciones) ----------
export const getPrescriptions = ctx => guardedRead(ctx, 'medicinas', async () =>
  (await ctx.client.searchResources('MedicationRequest', withEncounter(ctx, { patient: P(ctx) }), NO_CACHE)).map(m => ({
    id: m.id,
    name: m.medicationCodeableConcept?.text ?? null,
    instructions: m.dosageInstruction?.[0]?.text ?? null,
    kind: m.category?.[0]?.text ?? null, // nueva | sigue
    note: m.note?.[0]?.text ?? null,
  })));
export function mapCarePlan(cp) {
  if (!cp) return null;
  const acts = (cp.activity ?? []).map(a => a.detail).filter(Boolean);
  return {
    id: cp.id,
    title: cp.title ?? null,
    diagnosis: cp.description ?? null,
    steps: acts.filter(d => d.code?.text !== 'alarma').map(d => d.description),
    alarms: acts.filter(d => d.code?.text === 'alarma').map(d => d.description),
  };
}
export const getCarePlan = ctx => guardedRead(ctx, 'instrucciones', async () =>
  mapCarePlan((await ctx.client.searchResources('CarePlan', withEncounter(ctx, { patient: P(ctx) }), NO_CACHE))[0]));
export const getAppointments = ctx => guardedRead(ctx, 'instrucciones', async () =>
  (await ctx.client.searchResources('Appointment', { patient: P(ctx), status: 'booked', _sort: 'date' }, NO_CACHE)).map(a => ({
    id: a.id,
    start: a.start ?? null,
    end: a.end ?? null,
    description: a.description ?? null,
    serviceType: a.serviceType?.[0]?.text ?? null,
    clinician: a.participant?.find(p => p.actor?.reference?.startsWith('Practitioner/'))?.actor?.display ?? null,
  })));

/**
 * "Mi cuidado" in the shape loadCare() returns: { permissions:{team,instructions,medicines}, data:{participant,instructions,medicines}, statuses }.
 * Current instructions = stage Task `indicacion` inputs (discharge instructions are getCarePlan()).
 * Each section has its own guard; a failed section is left out of `data` and reported in `statuses`.
 */
export async function getCare(ctx) {
  const [team, stage, medicines] = await Promise.all([getCareTeam(ctx), getStage(ctx), getMedications(ctx)]);
  const data = {};
  if (team.status === 'ok') data.participant = team.data;
  if (stage.status === 'ok') data.instructions = (stage.data?.instructions ?? []).map((text, i) => ({ id: `indicacion-${i + 1}`, text: sameText(text) }));
  if (medicines.status === 'ok') data.medicines = medicines.data;
  const permissions = { team: ctx.access.canView(ctx.patientId, 'visita'), instructions: ctx.access.canView(ctx.patientId, 'visita'), medicines: ctx.access.canView(ctx.patientId, 'medicinas') };
  return { permissions, data, statuses: { team: team.status, instructions: stage.status, medicines: medicines.status } };
}

// ---------- adapters for the existing controllers (createVisitController / createResultsController) ----------
const unwrap = result => {
  if (result.status === 'ok') return result.data;
  throw result.status === 'locked' ? Object.assign(new Error('LIVE_LOCKED'), { code: 'LIVE_LOCKED' }) : result.error;
};
/** source(patientId) for createVisitController / loadVisit. */
export const liveVisitSource = ctx => async patientId => unwrap(await getVisit({ ...ctx, patientId }));
/** source(patientId) for createResultsController / loadResults. */
export const liveResultsSource = ctx => async patientId => unwrap(await getResults({ ...ctx, patientId }));
