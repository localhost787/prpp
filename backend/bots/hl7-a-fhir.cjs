// Bot "hl7-a-fhir" (API-27): the hospital simulator sends HL7 v2 messages, this Bot writes FHIR.
// POR-36 ADT (A04 A08 A02 A03 A01/A06) · POR-37 ORM^O01 · POR-38 ORU^R01 · POR-40 RAS^O17
// and on every event: POR-43 stage Task ("Qué sigue"), POR-44 simulated queue, POR-45 notices.
//
// Rules: idempotent (every resource is found by a business identifier, so resending a message
// creates nothing new), every message leaves a Provenance with the original text, all output is
// tagged urn:portal:origen|simulado, updates are conditional on the version (If-Match).
// Returns an HL7 ACK: MSA|AA when done, MSA|AE with the error text when it could not process it.
// Runs as a vmcontext Bot: plain CommonJS, no imports.

const SYS = {
  mrn: 'urn:hospital-demo:mrn',
  visit: 'urn:hospital-demo:visita',
  order: 'urn:hospital-demo:orden',
  report: 'urn:hospital-demo:reporte',
  result: 'urn:hospital-demo:resultado',
  specimen: 'urn:hospital-demo:muestra',
  vital: 'urn:hospital-demo:signo',
  administration: 'urn:hospital-demo:administracion',
  stage: 'urn:hospital-demo:etapa',
  staff: 'urn:hospital-demo:personal',
  place: 'urn:hospital-demo:lugar',
  org: 'urn:hospital-demo:org',
  task: 'urn:portal:tarea',
  notice: 'urn:portal:aviso',
  noticeId: 'urn:portal:aviso-id',
  origin: 'urn:portal:origen',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  interpretation: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  dischargeDisposition: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  diagServiceSection: 'http://terminology.hl7.org/CodeSystem/v2-0074',
  loinc: 'http://loinc.org',
  ucum: 'http://unitsofmeasure.org',
};
const SIMULATED_TAG = { system: SYS.origin, code: 'simulado' };
const PR_OFFSET = '-04:00'; // America/Puerto_Rico, no daylight saving time

// Stage texts: docs/textos-de-la-app.md ("Etapas de la visita"), copied as is.
const STAGES = {
  1: { name: 'Llegada', text: () => 'Llegó a Emergencias. Su registro está completo.' },
  2: { name: 'Triaje', text: (c) => `La enfermera la clasificó. Nivel ${c.esi} de 5.` },
  3: { name: 'En espera', text: () => 'Está en la fila. Se atiende por gravedad, no por orden de llegada.' },
  4: { name: 'Evaluación', text: (c) => `La llamaron al ${c.placeName}. La atiende ${c.doctorName}.` },
  5: { name: 'Estudios', text: () => 'Le están haciendo estudios. Los resultados le llegarán aquí.' },
  6: { name: 'Decisión', text: () => 'Su médica está decidiendo si se va a casa o se queda.' },
  7: { name: 'Alta', text: () => "Le dieron de alta. Sus instrucciones están en 'Mi cuidado'." },
  ingreso: { name: 'Ingreso', text: (c) => `La van a ingresar. Cuarto ${c.room}.` },
};
// "Qué sigue" per stage. PROPOSED texts (not in textos-de-la-app.md yet): see docs/PREGUNTAS-para-Edwin.md.
const NEXT = {
  1: 'Una enfermera la va a clasificar por gravedad.',
  2: 'Espere en la sala. La van a llamar.',
  3: 'Espere en la sala. La van a llamar.',
  4: 'Su médica la va a evaluar.',
  5: 'Esperar los resultados de los estudios.',
  6: 'Su médica le va a explicar si se va a casa o se queda.',
  7: "Lea sus instrucciones en 'Mi cuidado'.",
  ingreso: 'La van a llevar a su cuarto.',
};

// ---------- small HL7 helpers ----------

function field(seg, i, comp = 1) {
  return seg ? seg.getComponent(i, comp) || '' : '';
}

/** HL7 TS (YYYYMMDDHHMM[SS][+-ZZZZ]) -> ISO 8601 with offset. No zone = Puerto Rico. */
function hl7Time(ts) {
  const m = String(ts || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?([+-]\d{4})?$/);
  if (!m) {
    return undefined;
  }
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  const offset = z ? `${z.slice(0, 3)}:${z.slice(3)}` : PR_OFFSET;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
}

function messageTime(msg) {
  return hl7Time(field(msg.getSegment('EVN'), 2)) || hl7Time(field(msg.getSegment('MSH'), 7)) || nowPR();
}

function nowPR() {
  const d = new Date(Date.now() - 4 * 3600 * 1000);
  return d.toISOString().slice(0, 19) + PR_OFFSET;
}

function hl7Error(message) {
  const err = new Error(message);
  err.hl7 = true;
  return err;
}

// ---------- FHIR helpers ----------

const NO_CACHE = { cache: 'no-cache' };

function ident(system, value) {
  return [{ system, value }];
}

function withTag(resource, source) {
  return { ...resource, meta: { source, tag: [SIMULATED_TAG] } };
}

/** Recursively compares only the keys present in `wanted`. */
function contains(current, wanted) {
  if (wanted === undefined) {
    return true;
  }
  if (Array.isArray(wanted)) {
    return (
      Array.isArray(current) &&
      current.length === wanted.length &&
      wanted.every((w, i) => contains(current[i], w))
    );
  }
  if (wanted && typeof wanted === 'object') {
    return !!current && typeof current === 'object' && Object.keys(wanted).every((k) => contains(current[k], wanted[k]));
  }
  return current === wanted;
}

/**
 * Find by identifier; create when missing; when present, update only if a managed field changed
 * (new version, same id). `removeKeys` drops fields from the stored resource (e.g. queue inputs).
 */
async function upsert(ctx, resource, removeKeys = []) {
  const { system, value } = resource.identifier[0];
  const found = await ctx.medplum.searchResources(resource.resourceType, { identifier: `${system}|${value}` }, NO_CACHE);
  if (found.length > 1) {
    throw hl7Error(`${resource.resourceType} ${value} está duplicado`);
  }
  const { meta, ...wanted } = withTag(resource, ctx.source);
  const current = found[0];
  // A business identifier reused by another patient's message must never move a resource between patients.
  if (current?.subject?.reference && wanted.subject?.reference && current.subject.reference !== wanted.subject.reference) {
    throw hl7Error(`${resource.resourceType} ${value} es de otro paciente`);
  }
  if (!current) {
    const created = await ctx.medplum.createResource({ ...wanted, meta });
    ctx.touched.push(created);
    return { resource: created, created: true, changed: true };
  }
  const stale = removeKeys.some((k) => current[k] !== undefined);
  if (contains(current, wanted) && !stale) {
    return { resource: current, created: false, changed: false };
  }
  const next = { ...current, ...wanted, meta: { ...current.meta, source: ctx.source } };
  for (const k of removeKeys) {
    delete next[k];
  }
  const updated = await ctx.medplum.updateResource(next, {
    headers: { 'If-Match': `W/"${current.meta.versionId}"` },
  });
  ctx.touched.push(updated);
  return { resource: updated, created: false, changed: true };
}

async function findOne(ctx, resourceType, params) {
  return ctx.medplum.searchOne(resourceType, params, NO_CACHE);
}

async function findPatient(ctx, msg) {
  const mrn = field(msg.getSegment('PID'), 3);
  if (!mrn) {
    throw hl7Error('El mensaje no trae MRN en PID-3');
  }
  const patient = await findOne(ctx, 'Patient', { identifier: `${SYS.mrn}|${mrn}` });
  if (!patient) {
    throw hl7Error(`No hay paciente con MRN ${mrn}`);
  }
  return patient;
}

async function findByStaffId(ctx, id) {
  return id ? findOne(ctx, 'Practitioner', { identifier: `${SYS.staff}|${id}` }) : undefined;
}

async function findPlace(ctx, id) {
  return id ? findOne(ctx, 'Location', { identifier: `${SYS.place}|${id}` }) : undefined;
}

function ref(resource, display) {
  return resource ? { reference: `${resource.resourceType}/${resource.id}`, ...(display ? { display } : {}) } : undefined;
}

function practitionerName(p) {
  return p?.name?.[0]?.text || [p?.name?.[0]?.prefix?.[0], p?.name?.[0]?.given?.[0], p?.name?.[0]?.family].filter(Boolean).join(' ');
}

async function findVisit(ctx, visitNumber) {
  if (!visitNumber) {
    throw hl7Error('El mensaje no trae número de visita en PV1-19');
  }
  const visit = await findOne(ctx, 'Encounter', { identifier: `${SYS.visit}|${visitNumber}` });
  if (!visit) {
    throw hl7Error(`No hay visita ${visitNumber}: falta el A04`);
  }
  if (visit.subject?.reference !== `Patient/${ctx.patient.id}`) {
    throw hl7Error(`La visita ${visitNumber} es de otro paciente`);
  }
  return visit;
}

// ---------- notices (POR-45, API-12) ----------

async function notice(ctx, key, categories, text) {
  return upsert(ctx, {
    resourceType: 'Communication',
    identifier: ident(SYS.noticeId, `${ctx.visitNumber}-${key}`),
    status: 'completed',
    category: categories.map((code) => ({ coding: [{ system: SYS.notice, code }] })),
    subject: ref(ctx.patient),
    recipient: [ref(ctx.patient)],
    ...(ctx.visit ? { encounter: ref(ctx.visit) } : {}),
    sent: ctx.time,
    payload: [{ contentString: text }],
  });
}

// ---------- stage Task (POR-43) + queue (POR-44) ----------

/** Simulated queue (always labeled "simulada" on screen). Before samples: 6 people; after: 3. */
function queueFor(esi, phase) {
  if (phase === 'after-samples') {
    return { ahead: 3, wait: '20–30 min' };
  }
  const table = { 1: [0, '0 min'], 2: [1, '5–10 min'], 3: [6, '45–60 min'], 4: [8, '60–90 min'], 5: [10, '90–120 min'] };
  const [ahead, wait] = table[esi] || table[3];
  return { ahead, wait };
}

function inputValue(task, name) {
  const i = (task?.input || []).find((x) => x.type?.text === name);
  if (!i) {
    return undefined;
  }
  if (name === 'etapa-clave') {
    return i.valueString === 'ingreso' ? 'ingreso' : Number(i.valueString);
  }
  return i.valueInteger ?? i.valueString;
}

/** Counts studies still in progress for the family member without "estudios" (API-06). */
async function studiesInProgress(ctx) {
  const orders = await ctx.medplum.searchResources(
    'ServiceRequest',
    { encounter: `Encounter/${ctx.visit.id}`, status: 'active' },
    NO_CACHE
  );
  return orders.length;
}

/**
 * Moves the stage Task. `changes`: { stage?, queue?: 'set'|'after-samples'|'clear', context }.
 * Stages never go back, except Alta/Ingreso which are final.
 */
async function updateStage(ctx, changes) {
  const visitKey = ctx.visitNumber;
  const current = await findOne(ctx, 'Task', { identifier: `${SYS.stage}|${visitKey}` });
  // "ingreso" is stage 7 on screen but a different stage: keep its key, not only the number.
  const prevKey = inputValue(current, 'etapa-clave') ?? (inputValue(current, 'etapa') || 0);
  const rank = (key) => (key === 'ingreso' ? 7 : key);
  const isFinal = changes.stage === 7 || changes.stage === 'ingreso';
  const stageKey =
    changes.stage !== undefined && (isFinal || (rank(prevKey) !== 7 && rank(changes.stage) > rank(prevKey)))
      ? changes.stage
      : prevKey;
  const stageNumber = stageKey === 'ingreso' ? 7 : stageKey;
  const stage = STAGES[stageKey] || STAGES[1];
  const esi = changes.context?.esi ?? inputValue(current, 'esi');

  let ahead = inputValue(current, 'personas-antes');
  let wait = inputValue(current, 'espera-estimada');
  if (changes.queue === 'set' || (changes.queue === 'after-samples' && ahead !== undefined)) {
    ({ ahead, wait } = queueFor(esi, changes.queue));
  } else if (changes.queue === 'clear' || stageNumber >= 4) {
    ahead = undefined;
    wait = undefined;
  }
  const stageContext = {
    esi,
    placeName: changes.context?.placeName ?? inputValue(current, 'lugar'),
    doctorName: changes.context?.doctorName ?? inputValue(current, 'medico'),
    room: changes.context?.room ?? inputValue(current, 'cuarto'),
  };
  const inputs = [
    ['etapa', 'valueInteger', stageNumber],
    ['etapa-clave', 'valueString', String(stageKey)],
    ['nombre-etapa', 'valueString', stage.name],
    ['texto-etapa', 'valueString', stage.text(stageContext)],
    ['que-sigue', 'valueString', NEXT[stageKey] || NEXT[1]],
    ['esi', 'valueInteger', esi],
    ['personas-antes', 'valueInteger', ahead],
    ['espera-estimada', 'valueString', wait],
    ['estudios-en-curso', 'valueInteger', await studiesInProgress(ctx)],
    ['lugar', 'valueString', stageContext.placeName],
    ['medico', 'valueString', stageContext.doctorName],
    ['cuarto', 'valueString', stageContext.room],
  ]
    .filter(([, , v]) => v !== undefined && v !== null)
    .map(([name, kind, value]) => ({ type: { text: name }, [kind]: value }));

  const task = {
    resourceType: 'Task',
    identifier: ident(SYS.stage, visitKey),
    status: isFinal && changes.stage !== undefined ? 'completed' : current?.status === 'completed' ? 'completed' : 'in-progress',
    intent: 'order',
    code: { coding: [{ system: SYS.task, code: 'etapa' }], text: 'Etapa de la visita' },
    businessStatus: { text: stage.name },
    description: NEXT[stageKey] || NEXT[1],
    for: ref(ctx.patient),
    encounter: ref(ctx.visit),
    authoredOn: current?.authoredOn ?? ctx.time,
    // Never moves back (a late or test message must not make the Task look older).
    lastModified: current?.lastModified && current.lastModified > ctx.time ? current.lastModified : ctx.time,
    input: inputs,
  };
  // input is replaced as a whole (so removed queue fields really disappear).
  if (current && !contains(current, task)) {
    const updated = await ctx.medplum.updateResource(
      { ...current, ...withTag(task, ctx.source), meta: { ...current.meta, source: ctx.source } },
      { headers: { 'If-Match': `W/"${current.meta.versionId}"` } }
    );
    ctx.touched.push(updated);
    return updated;
  }
  if (!current) {
    const created = await ctx.medplum.createResource(withTag(task, ctx.source));
    ctx.touched.push(created);
    return created;
  }
  return current;
}

// ---------- ADT (POR-36) ----------

const ENCOUNTER_STATUS = { A04: 'arrived', A08: 'triaged', A02: 'in-progress', A03: 'finished' };
const STATUS_RANK = { planned: 0, arrived: 1, triaged: 2, 'in-progress': 3, onleave: 3, finished: 4, cancelled: 4 };

async function vitalSigns(ctx, msg) {
  for (const obx of msg.getAllSegments('OBX')) {
    const code = field(obx, 3, 1);
    const value = Number(field(obx, 5));
    if (!code || Number.isNaN(value)) {
      continue;
    }
    await upsert(ctx, {
      resourceType: 'Observation',
      identifier: ident(SYS.vital, `${ctx.visitNumber}-${code}`),
      status: 'final',
      category: [{ coding: [{ system: SYS.obsCategory, code: 'vital-signs' }] }],
      code: { coding: [{ system: SYS.loinc, code, display: field(obx, 3, 2) }], text: field(obx, 3, 2) },
      subject: ref(ctx.patient),
      encounter: ref(ctx.visit),
      effectiveDateTime: hl7Time(field(obx, 14)) || ctx.time,
      valueQuantity: { value, unit: field(obx, 6), system: SYS.ucum, code: field(obx, 6, 2) || field(obx, 6) },
    });
  }
}

async function handleAdt(ctx, msg, event) {
  const pv1 = msg.getSegment('PV1');
  ctx.visitNumber = field(pv1, 19);
  if (!ctx.visitNumber) {
    throw hl7Error('El mensaje no trae número de visita en PV1-19');
  }
  const org = await findOne(ctx, 'Organization', { identifier: `${SYS.org}|hospital-demo` });
  const place = await findPlace(ctx, field(pv1, 3));
  const doctor = await findByStaffId(ctx, field(pv1, 7));

  if (event === 'A01' || event === 'A06') {
    return handleAdmit(ctx, msg, pv1, org, place, doctor);
  }
  if (!ENCOUNTER_STATUS[event]) {
    throw hl7Error(`Evento ADT no soportado: ${event}`);
  }

  let existing = await findOne(ctx, 'Encounter', { identifier: `${SYS.visit}|${ctx.visitNumber}` });
  if (!existing && event === 'A04') {
    existing = await adoptPlannedVisit(ctx);
  }
  if (!existing && event !== 'A04') {
    throw hl7Error(`No hay visita ${ctx.visitNumber}: falta el A04`);
  }
  // A late or repeated message never moves the visit back (e.g. the A04 resent after the A03).
  if (existing && STATUS_RANK[existing.status] > STATUS_RANK[ENCOUNTER_STATUS[event]]) {
    ctx.visit = existing;
    return;
  }
  const encounter = {
    resourceType: 'Encounter',
    identifier: ident(SYS.visit, ctx.visitNumber),
    status: ENCOUNTER_STATUS[event],
    class: { system: SYS.actCode, code: 'EMER', display: 'emergency' },
    subject: ref(ctx.patient),
    period: { start: existing?.period?.start ?? ctx.time, ...(event === 'A03' ? { end: ctx.time } : {}) },
    ...(org ? { serviceProvider: ref(org, org.name) } : {}),
  };
  if (event === 'A08') {
    const esi = Number(field(msg.getSegment('PV2'), 25)) || undefined;
    if (esi) {
      encounter.priority = { text: `ESI ${esi}` };
      ctx.esi = esi;
    }
  }
  if (place) {
    encounter.location = [{ location: ref(place, place.name), status: 'active' }];
  }
  if (doctor) {
    encounter.participant = [{ individual: ref(doctor, practitionerName(doctor)) }];
  }
  if (event === 'A03') {
    const code = field(pv1, 36);
    encounter.hospitalization = {
      dischargeDisposition: {
        coding: [{ system: SYS.dischargeDisposition, code: code === '01' || !code ? 'home' : code }],
        text: code === '01' || !code ? 'Alta a la casa' : code,
      },
    };
  }
  // A02/A03 keep the doctor/place known from before when the message does not repeat them.
  const { resource: visit } = await upsert(ctx, encounter);
  ctx.visit = visit;

  if (event === 'A04') {
    await notice(ctx, 'A04', ['visita'], STAGES[1].text());
    await updateStage(ctx, { stage: 1 });
  } else if (event === 'A08') {
    await vitalSigns(ctx, msg);
    await notice(ctx, 'A08', ['visita'], STAGES[2].text({ esi: ctx.esi }));
    await updateStage(ctx, { stage: 2, queue: 'set', context: { esi: ctx.esi } });
  } else if (event === 'A02') {
    const context = { placeName: place?.name?.split(' · ')[0] ?? 'cubículo', doctorName: practitionerName(doctor) };
    const placeText = (place?.name ?? '').replace(/^Cubículo/, 'cubículo');
    const text = `La llamaron al ${placeText}. La atiende ${context.doctorName}.`;
    await notice(ctx, `A02-${field(pv1, 3)}`, ['visita'], text);
    await updateStage(ctx, { stage: 4, queue: 'clear', context: { ...context, placeName: placeText } });
  } else if (event === 'A03') {
    await notice(ctx, 'A03', ['visita'], STAGES[7].text());
    await updateStage(ctx, { stage: 7, queue: 'clear' });
  }
}

/** POR-55: the patient's pre-registered (planned) ER visit becomes this visit, keeping its Encounter id. */
async function adoptPlannedVisit(ctx) {
  const planned = await findOne(ctx, 'Encounter', { identifier: `urn:portal:prerregistro|${ctx.patient.id}`, status: 'planned' });
  if (!planned) {
    return undefined;
  }
  const adopted = await ctx.medplum.updateResource(
    { ...planned, identifier: ident(SYS.visit, ctx.visitNumber) },
    { headers: { 'If-Match': `W/"${planned.meta.versionId}"` } }
  );
  ctx.touched.push(adopted);
  return adopted;
}

/** A06/A01: new inpatient Encounter (IMP), part of the ER visit (PV1-50), which is finished. */
async function handleAdmit(ctx, msg, pv1, org, place, doctor) {
  const erNumber = field(pv1, 50);
  const er = erNumber ? await findOne(ctx, 'Encounter', { identifier: `${SYS.visit}|${erNumber}` }) : undefined;
  if (!er) {
    throw hl7Error(`Ingreso sin visita de Emergencias (PV1-50 = ${erNumber || 'vacío'})`);
  }
  if (er.subject?.reference !== `Patient/${ctx.patient.id}`) {
    throw hl7Error(`La visita ${erNumber} es de otro paciente`);
  }
  const { resource: imp } = await upsert(ctx, {
    resourceType: 'Encounter',
    identifier: ident(SYS.visit, ctx.visitNumber),
    status: 'in-progress',
    class: { system: SYS.actCode, code: 'IMP', display: 'inpatient encounter' },
    subject: ref(ctx.patient),
    partOf: ref(er),
    period: { start: ctx.time },
    ...(org ? { serviceProvider: ref(org, org.name) } : {}),
    ...(place ? { location: [{ location: ref(place, place.name), status: 'active' }] } : {}),
    ...(doctor ? { participant: [{ individual: ref(doctor, practitionerName(doctor)) }] } : {}),
  });
  // The ER visit ends with "admitted" instead of "home".
  ctx.visitNumber = erNumber;
  const { resource: erDone } = await upsert(ctx, {
    resourceType: 'Encounter',
    identifier: ident(SYS.visit, erNumber),
    status: 'finished',
    class: { system: SYS.actCode, code: 'EMER', display: 'emergency' },
    subject: ref(ctx.patient),
    period: { start: er.period?.start ?? ctx.time, end: ctx.time },
    hospitalization: { dischargeDisposition: { text: 'Ingreso al hospital' } },
  });
  ctx.visit = erDone;
  const room = (place?.name?.match(/Cama\s+(\S+)/) || [])[1] || place?.name || '';
  await notice(ctx, 'ingreso', ['visita'], STAGES.ingreso.text({ room }));
  await updateStage(ctx, { stage: 'ingreso', queue: 'clear', context: { room } });
  return imp;
}

// ---------- ORM (POR-37) ----------

/** Splits a message into ORC groups: [{ orc, obr, notes: [] }]. */
function orderGroups(msg) {
  const groups = [];
  let current;
  for (const seg of msg.segments) {
    const name = seg.name;
    if (name === 'ORC') {
      current = { orc: seg, obr: undefined, rxa: [], rxr: undefined, obx: [], notes: [] };
      groups.push(current);
    } else if (name === 'OBR') {
      if (!current || current.obr) {
        current = { orc: undefined, obr: seg, rxa: [], rxr: undefined, obx: [], notes: [] };
        groups.push(current);
      } else {
        current.obr = seg;
      }
    } else if (current && name === 'OBX') {
      current.obx.push({ seg, notes: [] });
    } else if (current && name === 'NTE') {
      const last = current.obx[current.obx.length - 1];
      (last ? last.notes : current.notes).push(field(seg, 3));
    } else if (current && name === 'RXA') {
      current.rxa.push(seg);
    } else if (current && name === 'RXR') {
      current.rxr = seg;
    }
  }
  return groups;
}

function orderNumber(group) {
  return field(group.orc, 2) || field(group.obr, 2);
}

function serviceCategory(obr) {
  const section = field(obr, 24).toUpperCase();
  const isImaging = section === 'RAD' || section === 'IMG';
  return {
    coding: [{ system: SYS.diagServiceSection, code: isImaging ? 'RAD' : 'LAB' }],
    text: isImaging ? 'imagen' : 'laboratorio',
  };
}

async function handleOrm(ctx, msg) {
  ctx.visitNumber = field(msg.getSegment('PV1'), 19);
  ctx.visit = await findVisit(ctx, ctx.visitNumber);
  const groups = orderGroups(msg).filter((g) => g.obr);
  if (!groups.length) {
    throw hl7Error('ORM sin órdenes (OBR)');
  }
  let newOrders = 0;
  let samples = 0;
  for (const g of groups) {
    const number = orderNumber(g);
    if (!number) {
      throw hl7Error('Orden sin número (ORC-2 / OBR-2)');
    }
    const control = field(g.orc, 1) || 'NW';
    const existing = await findOne(ctx, 'ServiceRequest', { identifier: `${SYS.order}|${number}` });
    const doctor = await findByStaffId(ctx, field(g.orc, 12) || field(g.obr, 16));
    const sr = {
      resourceType: 'ServiceRequest',
      identifier: ident(SYS.order, number),
      status: control === 'CA' ? 'revoked' : existing?.status === 'completed' ? 'completed' : 'active',
      intent: 'order',
      category: [serviceCategory(g.obr)],
      code: { coding: [{ code: field(g.obr, 4, 1), display: field(g.obr, 4, 2) }], text: field(g.obr, 4, 2) },
      subject: ref(ctx.patient),
      encounter: ref(ctx.visit),
      authoredOn: existing?.authoredOn ?? (hl7Time(field(g.orc, 9)) || ctx.time),
      ...(doctor ? { requester: ref(doctor, practitionerName(doctor)) } : {}),
      ...(g.notes.length ? { note: [{ text: g.notes.join(' ') }] } : {}),
    };
    const { resource, created } = await upsert(ctx, sr);
    if (created) {
      newOrders++;
    }
    // Sample taken: ORC-1 = SC with ORC-5 = IP (in process) -> Specimen.
    if (control === 'SC' && field(g.orc, 5) === 'IP') {
      const { created: newSample } = await upsert(ctx, {
        resourceType: 'Specimen',
        identifier: ident(SYS.specimen, number),
        status: 'available',
        type: { text: field(g.obr, 15) || 'Sangre' },
        subject: ref(ctx.patient),
        request: [ref(resource)],
        collection: { collectedDateTime: hl7Time(field(g.obr, 7)) || ctx.time },
      });
      if (newSample) {
        samples++;
      }
    }
  }
  const control = field(groups[0].orc, 1) || 'NW';
  if (control === 'NW') {
    const total = groups.length;
    await notice(ctx, `ORM-${groups.map(orderNumber).join('+')}`, ['estudios'], `Le ordenaron ${total} ${total === 1 ? 'estudio' : 'estudios'}.`);
    await updateStage(ctx, { stage: 3 });
  } else if (control === 'SC') {
    await notice(ctx, `SC-${groups.map(orderNumber).join('+')}`, ['estudios'], 'Muestras tomadas.');
    await updateStage(ctx, { queue: 'after-samples' });
  } else {
    await updateStage(ctx, {});
  }
  return { newOrders, samples };
}

// ---------- ORU (POR-38) ----------

const REPORT_STATUS = { I: 'registered', S: 'partial', A: 'partial', P: 'preliminary', F: 'final', C: 'corrected', X: 'cancelled' };
const REPORT_RANK = { registered: 1, partial: 2, preliminary: 3, final: 4, amended: 5, corrected: 5, cancelled: 5 };
const OBS_STATUS = { I: 'registered', P: 'preliminary', F: 'final', C: 'corrected', X: 'cancelled' };
const INTERPRETATION = {
  N: 'Normal',
  H: 'Alto',
  L: 'Bajo',
  HH: 'Muy alto',
  LL: 'Muy bajo',
  A: 'Anormal',
};

function parseRange(text, unit) {
  const m = String(text || '').match(/^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/);
  if (!m) {
    return text ? [{ text }] : undefined;
  }
  return [
    {
      low: { value: Number(m[1]), unit },
      high: { value: Number(m[2]), unit },
      text: `${m[1]}–${m[2]}`,
    },
  ];
}

function observationFromObx(ctx, obx, notes, obr, number, reportStatus) {
  const code = field(obx, 3, 1);
  const name = field(obx, 3, 2);
  const type = field(obx, 2);
  const unit = field(obx, 6);
  const flag = field(obx, 8).toUpperCase();
  const isImaging = serviceCategory(obr).text === 'imagen';
  const obs = {
    resourceType: 'Observation',
    identifier: ident(SYS.result, `${number}-${code}`),
    status: OBS_STATUS[field(obx, 11)] || reportStatus,
    category: [{ coding: [{ system: SYS.obsCategory, code: isImaging ? 'imaging' : 'laboratory' }] }],
    code: { coding: [{ system: field(obx, 3, 3) === 'LN' ? SYS.loinc : undefined, code, display: name }], text: name },
    subject: ref(ctx.patient),
    encounter: ref(ctx.visit),
    effectiveDateTime: hl7Time(field(obx, 14)) || hl7Time(field(obr, 7)) || ctx.time,
    issued: hl7Time(field(obr, 22)) || ctx.time,
  };
  if (obs.code.coding[0].system === undefined) {
    delete obs.code.coding[0].system;
  }
  if (type === 'NM') {
    obs.valueQuantity = { value: Number(field(obx, 5)), unit };
    const range = parseRange(field(obx, 7), unit);
    if (range) {
      obs.referenceRange = range;
    }
  } else {
    obs.valueString = field(obx, 5);
  }
  // No flag -> no interpretation at all (never "N" by default).
  if (INTERPRETATION[flag]) {
    obs.interpretation = [{ coding: [{ system: SYS.interpretation, code: flag, display: INTERPRETATION[flag] }] }];
  }
  if (notes.length) {
    obs.note = [{ text: notes.join(' ') }];
  }
  return obs;
}

async function handleOru(ctx, msg) {
  ctx.visitNumber = field(msg.getSegment('PV1'), 19);
  ctx.visit = await findVisit(ctx, ctx.visitNumber);
  const groups = orderGroups(msg).filter((g) => g.obr);
  if (!groups.length) {
    throw hl7Error('ORU sin resultados (OBR)');
  }
  for (const g of groups) {
    const number = field(g.obr, 2) || field(g.orc, 2);
    const sr = await findOne(ctx, 'ServiceRequest', { identifier: `${SYS.order}|${number}` });
    if (!sr) {
      throw hl7Error(`Resultado de una orden que no existe: ${number}`);
    }
    if (sr.subject?.reference !== `Patient/${ctx.patient.id}`) {
      throw hl7Error(`La orden ${number} es de otro paciente`);
    }
    const resultCode = field(g.obr, 25).toUpperCase();
    const status = REPORT_STATUS[resultCode];
    if (!status) {
      throw hl7Error(`OBR-25 desconocido: "${resultCode}" (use I, P, F o C)`);
    }
    // A late or replayed message never moves a result back (e.g. P arriving after F).
    const previous = await findOne(ctx, 'DiagnosticReport', { identifier: `${SYS.report}|${number}` });
    if (previous && (REPORT_RANK[previous.status] ?? 0) > (REPORT_RANK[status] ?? 0)) {
      continue;
    }
    const observations = [];
    for (const { seg, notes } of g.obx) {
      const { resource } = await upsert(ctx, observationFromObx(ctx, seg, notes, g.obr, number, status));
      observations.push(resource);
    }
    const before = previous;
    const { resource: report, changed } = await upsert(ctx, {
      resourceType: 'DiagnosticReport',
      identifier: ident(SYS.report, number),
      basedOn: [ref(sr)],
      status,
      category: [serviceCategory(g.obr)],
      code: { coding: [{ code: field(g.obr, 4, 1), display: field(g.obr, 4, 2) }], text: field(g.obr, 4, 2) || sr.code?.text },
      subject: ref(ctx.patient),
      encounter: ref(ctx.visit),
      effectiveDateTime: hl7Time(field(g.obr, 7)) || ctx.time,
      issued: hl7Time(field(g.obr, 22)) || ctx.time,
      result: observations.map((o) => ref(o, o.code?.text)),
      ...(g.notes.length ? { conclusion: g.notes.join(' ') } : {}),
    });
    const done = status === 'final' || status === 'corrected';
    if (done && sr.status !== 'completed') {
      await ctx.medplum.updateResource({ ...sr, status: 'completed' }, { headers: { 'If-Match': `W/"${sr.meta.versionId}"` } });
    }
    // Notices only when the report really changed (resending the same ORU adds nothing).
    const studyName = report.code?.text || sr.code?.text || 'estudio';
    if (changed && status !== 'registered' && status !== 'partial' && status !== 'cancelled') {
      const wasReady = before && (before.status === 'final' || before.status === 'corrected');
      const text =
        status === 'preliminary'
          ? `Resultado preliminar: ${studyName}.`
          : wasReady || status === 'corrected'
            ? `Resultado corregido: ${studyName}.`
            : `Resultado listo: ${studyName}.`;
      await notice(ctx, `ORU-${number}-${status}`, ['resultado'], text);
      // The family member without "estudios" can only know that something private arrived.
      await notice(ctx, `ORU-${number}-${status}-neutral`, ['visita', 'neutral-familia'], 'Hay un resultado nuevo (privado).');
    }
  }
  // Stage: results arriving = "Estudios"; every order has a report = "Decisión".
  const orders = await ctx.medplum.searchResources('ServiceRequest', { encounter: `Encounter/${ctx.visit.id}` }, NO_CACHE);
  const reports = await ctx.medplum.searchResources('DiagnosticReport', { encounter: `Encounter/${ctx.visit.id}` }, NO_CACHE);
  const reported = new Set(reports.flatMap((r) => (r.basedOn || []).map((b) => b.reference)));
  const live = orders.filter((o) => o.status !== 'revoked');
  const allReported = live.length > 0 && live.every((o) => reported.has(`ServiceRequest/${o.id}`));
  const someResult = reports.some((r) => ['preliminary', 'final', 'corrected', 'amended'].includes(r.status));
  await updateStage(ctx, { stage: allReported && someResult ? 6 : someResult ? 5 : undefined });
}

// ---------- RAS (POR-40) ----------

async function handleRas(ctx, msg) {
  ctx.visitNumber = field(msg.getSegment('PV1'), 19);
  ctx.visit = await findVisit(ctx, ctx.visitNumber);
  const groups = orderGroups(msg).filter((g) => g.rxa.length);
  if (!groups.length) {
    throw hl7Error('RAS sin administraciones (RXA)');
  }
  for (const g of groups) {
    const number = field(g.orc, 2);
    for (const [i, rxa] of g.rxa.entries()) {
      const med = field(rxa, 5, 2) || field(rxa, 5, 1);
      const amount = field(rxa, 6);
      const unit = field(rxa, 7, 1);
      const route = field(g.rxr, 1, 2) || field(g.rxr, 1, 1);
      const dose = [amount, unit].filter(Boolean).join(' ');
      const id = `${number || ctx.controlId}-${i + 1}`;
      const { changed } = await upsert(ctx, {
        resourceType: 'MedicationAdministration',
        identifier: ident(SYS.administration, id),
        status: 'completed',
        medicationCodeableConcept: { coding: [{ code: field(rxa, 5, 1), display: med }], text: med },
        subject: ref(ctx.patient),
        context: ref(ctx.visit),
        effectiveDateTime: hl7Time(field(rxa, 3)) || ctx.time,
        dosage: {
          text: [dose, route].filter(Boolean).join(' '),
          ...(route ? { route: { text: route } } : {}),
          ...(amount ? { dose: { value: Number(amount), unit } } : {}),
        },
        ...(g.notes.length ? { note: [{ text: g.notes.join(' ') }] } : {}),
      });
      if (changed) {
        await notice(ctx, `RAS-${id}`, ['medicina'], `Le dieron: ${[med, dose, route].filter(Boolean).join(' ')}.`);
      }
    }
  }
  await updateStage(ctx, {});
}

// ---------- entry point ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** UTF-8 -> base64. The vmcontext sandbox has TextEncoder but no Buffer/btoa. */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

async function provenance(ctx, msg) {
  const targets = ctx.touched.filter((r) => r.resourceType !== 'Provenance');
  if (!targets.length) {
    return;
  }
  const seen = new Set();
  const unique = targets.filter((r) => {
    const key = `${r.resourceType}/${r.id}`;
    return seen.has(key) ? false : seen.add(key);
  });
  const text = msg.toString();
  await ctx.medplum.createResource({
    resourceType: 'Provenance',
    meta: { tag: [SIMULATED_TAG] },
    target: unique.map((r) => ({ reference: `${r.resourceType}/${r.id}` })),
    recorded: new Date().toISOString(),
    activity: { text: `HL7 ${ctx.messageType} (MSH-10 ${ctx.controlId})` },
    agent: [{ who: { display: 'Bot hl7-a-fhir' } }],
    entity: [
      {
        role: 'source',
        what: {
          display: `HL7 ${ctx.messageType}`,
          extension: [
            {
              url: 'https://prpp.example/fhir/StructureDefinition/hl7-original',
              valueAttachment: {
                contentType: 'x-application/hl7-v2+er7',
                data: toBase64(text),
              },
            },
          ],
        },
      },
    ],
  });
}

async function processMessage(medplum, msg) {
  const msh = msg.getSegment('MSH');
  const type = field(msh, 9, 1);
  const event = field(msh, 9, 2);
  const ctx = {
    medplum,
    touched: [],
    messageType: `${type}^${event}`,
    controlId: field(msh, 10),
    source: `hl7-a-fhir#${field(msh, 10) || 'sin-id'}`,
    time: messageTime(msg),
  };
  ctx.patient = await findPatient(ctx, msg);
  if (type === 'ADT') {
    await handleAdt(ctx, msg, event);
  } else if (type === 'ORM') {
    await handleOrm(ctx, msg);
  } else if (type === 'ORU') {
    await handleOru(ctx, msg);
  } else if (type === 'RAS') {
    await handleRas(ctx, msg);
  } else {
    throw hl7Error(`Tipo de mensaje no soportado: ${ctx.messageType}`);
  }
  await provenance(ctx, msg);
  return ctx;
}

function errorAck(msg, code, text) {
  const ack = msg.buildAck({ ackCode: code });
  ack.getSegment('MSA').setField(3, text.replace(/[|^~\\&\r\n]/g, ' ').slice(0, 200));
  return ack;
}

async function handler(medplum, event) {
  const msg = event.input;
  if (!msg || typeof msg.getSegment !== 'function') {
    throw new Error('Se esperaba un mensaje HL7 (Content-Type x-application/hl7-v2+er7)');
  }
  try {
    await processMessage(medplum, msg);
    return msg.buildAck();
  } catch (err) {
    console.log(`hl7-a-fhir error: ${err.message}`);
    // AR = message we do not understand; AE = we understood it but could not apply it.
    return errorAck(msg, /no soportado/.test(err.message) ? 'AR' : 'AE', err.message || 'Error');
  }
}

exports.handler = handler;
module.exports.hl7Time = hl7Time;
module.exports.queueFor = queueFor;
module.exports.toBase64 = toBase64;
