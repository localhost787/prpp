// POR-41 · sim-msgs: the HL7 v2 messages of Doña Carmen's case (docs/caso-de-prueba.csv), in order.
// 100% synthetic. Clock times are the case's; the date is the demo day (America/Puerto_Rico).
// The Bot hl7-a-fhir translates each one (API-27).

const SEP = '\r';
const MRN = 'MRN-0001';
const VISIT = 'V-0001';
const ADMISSION = 'V-0002';

/** A segment from 1-based fields: seg('PV1', { 1: '1', 19: 'V-0001' }). */
function seg(name, fields) {
  const max = Math.max(0, ...Object.keys(fields).map(Number));
  const out = [name];
  for (let i = 1; i <= max; i++) {
    out.push(fields[i] ?? '');
  }
  return out.join('|');
}

function msh(ts, type, controlId) {
  // MSH is special: MSH-1 is the "|" itself, MSH-2 the encoding characters.
  return ['MSH', '^~\\&', 'SIM-HOSPITAL', 'HOSPITAL-DEMO', 'PRPP', 'PRPP', ts, '', type, controlId, 'P', '2.5.1'].join('|');
}

const pid = () => seg('PID', { 1: '1', 3: `${MRN}^^^HOSPITAL-DEMO^MR`, 5: 'RIVERA COLÓN^CARMEN', 7: '19540312', 8: 'F' });

function pv1({ cls = 'E', place = '', doctor = '', visit = VISIT, disposition = '', erVisit = '' } = {}) {
  return seg('PV1', { 1: '1', 2: cls, 3: place, 7: doctor, 19: visit, 36: disposition, 50: erVisit });
}

const ORDERS = [
  { id: 'O-1001', code: '58410-2', name: 'Hemograma completo', section: 'LAB', blood: true },
  { id: 'O-1002', code: '2524-7', name: 'Lactato', section: 'LAB', blood: true },
  { id: 'O-1003', code: '24323-8', name: 'Panel metabólico', section: 'LAB', blood: true },
  { id: 'O-1004', code: '30746-2', name: 'Radiografía de tórax', section: 'RAD', blood: false },
  { id: 'O-1005', code: '600-7', name: 'Hemocultivos', section: 'LAB', blood: true },
];

function obr(setId, order, ts, extra = {}) {
  return seg('OBR', { 1: String(setId), 2: order.id, 4: `${order.code}^${order.name}^LN`, 7: ts, 16: 'ana-ramos', 24: order.section, ...extra });
}

function obxNum(setId, code, name, value, unit, range, flag, ts) {
  return seg('OBX', { 1: String(setId), 2: 'NM', 3: `${code}^${name}^LN`, 5: value, 6: unit, 7: range, 8: flag, 11: 'F', 14: ts });
}

const nte = (text) => seg('NTE', { 1: '1', 3: text });

/**
 * @param {string} day - YYYYMMDD of the demo day.
 * @returns {{ id: string, hora: string, titulo: string, tipo: string, texto: string, tour: boolean }[]}
 */
export function buildMessages(day) {
  const t = (hhmm) => `${day}${hhmm}`;
  const m = (id, hora, titulo, tipo, segments, tour = true) => ({
    id,
    hora,
    titulo,
    tipo,
    texto: segments.join(SEP),
    tour,
  });
  const byId = Object.fromEntries(ORDERS.map((o) => [o.id, o]));

  return [
    m('a04', '8:12 AM', 'Llega y la registran', 'ADT^A04', [
      msh(t('0812'), 'ADT^A04^ADT_A01', 'SIM-0001'),
      seg('EVN', { 1: 'A04', 2: t('0812') }),
      pid(),
      pv1({ place: 'sala-de-espera' }),
    ]),
    m('a08', '8:25 AM', 'Triaje: nivel 3 de 5', 'ADT^A08', [
      msh(t('0825'), 'ADT^A08^ADT_A01', 'SIM-0002'),
      seg('EVN', { 1: 'A08', 2: t('0825') }),
      pid(),
      pv1({ place: 'sala-de-espera' }),
      seg('PV2', { 25: '3' }),
      seg('OBX', { 1: '1', 2: 'NM', 3: '8310-5^Temperatura^LN', 5: '101.8', 6: '°F^[degF]', 11: 'F', 14: t('0825') }),
      seg('OBX', { 1: '2', 2: 'NM', 3: '59408-5^Oxígeno en la sangre^LN', 5: '91', 6: '%^%', 11: 'F', 14: t('0825') }),
    ]),
    m('orm', '8:31 AM', 'La médica ordena 5 estudios', 'ORM^O01', [
      msh(t('0831'), 'ORM^O01^ORM_O01', 'SIM-0003'),
      pid(),
      pv1({ place: 'sala-de-espera' }),
      ...ORDERS.flatMap((o, i) => [seg('ORC', { 1: 'NW', 2: o.id, 9: t('0831'), 12: 'ana-ramos' }), obr(i + 1, o, t('0831'))]),
    ]),
    m('muestras', '8:40 AM', 'Le sacan sangre (muestras tomadas)', 'ORM^O01', [
      msh(t('0840'), 'ORM^O01^ORM_O01', 'SIM-0004'),
      pid(),
      pv1({ place: 'sala-de-espera' }),
      ...ORDERS.filter((o) => o.blood).flatMap((o, i) => [
        seg('ORC', { 1: 'SC', 2: o.id, 5: 'IP', 9: t('0840') }),
        obr(i + 1, o, t('0840'), { 15: 'Sangre' }),
      ]),
    ]),
    m('cultivos', '8:41 AM', 'Hemocultivos en proceso (tardan 24–48 h)', 'ORU^R01', [
      msh(t('0841'), 'ORU^R01^ORU_R01', 'SIM-0005'),
      pid(),
      pv1({ place: 'sala-de-espera' }),
      obr(1, byId['O-1005'], t('0840'), { 22: t('0841'), 25: 'I' }),
    ]),
    m('a02', '9:05 AM', 'Pasa al cubículo 12 con la Dra. Ramos', 'ADT^A02', [
      msh(t('0905'), 'ADT^A02^ADT_A02', 'SIM-0006'),
      seg('EVN', { 1: 'A02', 2: t('0905') }),
      pid(),
      pv1({ place: 'cubiculo-12', doctor: 'ana-ramos^Ramos^Ana^^^Dra.' }),
    ]),
    m('ras1', '9:10 AM', 'Le dan acetaminofén y oxígeno', 'RAS^O17', [
      msh(t('0910'), 'RAS^O17^RAS_O17', 'SIM-0007'),
      pid(),
      pv1({ place: 'cubiculo-12' }),
      seg('ORC', { 1: 'RE', 2: 'M-2001' }),
      seg('RXA', { 1: '0', 2: '1', 3: t('0910'), 4: t('0910'), 5: '161^Acetaminofén^LOCAL', 6: '650', 7: 'mg^mg' }),
      seg('RXR', { 1: 'PO^por boca' }),
      nte('Para bajar la fiebre.'),
      seg('ORC', { 1: 'RE', 2: 'M-2002' }),
      seg('RXA', { 1: '0', 2: '1', 3: t('0910'), 4: t('0910'), 5: 'O2^Oxígeno^LOCAL', 6: '2', 7: 'L/min^L/min' }),
      seg('RXR', { 1: 'NASAL^por la nariz' }),
    ]),
    m('oru1', '9:41 AM', 'Resultados: hemograma y lactato', 'ORU^R01', [
      msh(t('0941'), 'ORU^R01^ORU_R01', 'SIM-0008'),
      pid(),
      pv1({ place: 'cubiculo-12' }),
      obr(1, byId['O-1001'], t('0840'), { 22: t('0941'), 25: 'F' }),
      obxNum(1, '6690-2', 'Glóbulos blancos', '15.2', 'mil/µL', '4.5-11.0', 'H', t('0941')),
      nte('Están altos. Suele pasar cuando el cuerpo combate una infección.'),
      obxNum(2, '718-7', 'Hemoglobina', '12.8', 'g/dL', '12.0-15.5', 'N', t('0941')),
      nte('Normal.'),
      obr(2, byId['O-1002'], t('0840'), { 22: t('0941'), 25: 'F' }),
      obxNum(1, '2524-7', 'Lactato', '1.4', 'mmol/L', '0.5-2.0', 'N', t('0941')),
      nte('Normal. Es una buena señal.'),
    ]),
    m('oru2', '10:02 AM', 'Resultados: panel metabólico y radiografía preliminar', 'ORU^R01', [
      msh(t('1002'), 'ORU^R01^ORU_R01', 'SIM-0009'),
      pid(),
      pv1({ place: 'cubiculo-12' }),
      obr(1, byId['O-1003'], t('0840'), { 22: t('1002'), 25: 'F' }),
      obxNum(1, '2345-7', 'Glucosa', '168', 'mg/dL', '70-99', 'H', t('1002')),
      nte('Un poco alta. Con infección y diabetes puede subir.'),
      obxNum(2, '2160-0', 'Creatinina (riñones)', '1.1', 'mg/dL', '0.6-1.2', 'N', t('1002')),
      nte('Normal. Sus riñones funcionan bien.'),
      obr(2, byId['O-1004'], t('0950'), { 22: t('1002'), 25: 'P' }),
      seg('OBX', { 1: '1', 2: 'ST', 3: '30746-2^Radiografía de tórax^LN', 5: 'Posible pulmonía en la parte baja del pulmón derecho', 11: 'P', 14: t('1002') }),
      nte('Lectura preliminar. Un radiólogo la confirmará.'),
    ]),
    m('ras2', '10:15 AM', 'Antibiótico por la vena: ceftriaxona 1 g', 'RAS^O17', [
      msh(t('1015'), 'RAS^O17^RAS_O17', 'SIM-0010'),
      pid(),
      pv1({ place: 'cubiculo-12' }),
      seg('ORC', { 1: 'RE', 2: 'M-2003' }),
      seg('RXA', { 1: '0', 2: '1', 3: t('1015'), 4: t('1015'), 5: '309090^Ceftriaxona^LOCAL', 6: '1', 7: 'g^g' }),
      seg('RXR', { 1: 'IV^por la vena' }),
      nte('Antibiótico para la infección.'),
    ]),
    m('a03', '11:30 AM', 'Alta a la casa', 'ADT^A03', [
      msh(t('1130'), 'ADT^A03^ADT_A03', 'SIM-0011'),
      seg('EVN', { 1: 'A03', 2: t('1130') }),
      pid(),
      pv1({ place: 'cubiculo-12', disposition: '01' }),
    ]),
    // Not in the tour: the other ending (admission) and a corrected result.
    m(
      'ingreso',
      '11:30 AM',
      'Otra versión: la ingresan (Medicina, cama 304-B)',
      'ADT^A01',
      [
        msh(t('1130'), 'ADT^A01^ADT_A01', 'SIM-0012'),
        seg('EVN', { 1: 'A01', 2: t('1130') }),
        pid(),
        pv1({ cls: 'I', place: 'medicina-304b', doctor: 'luis-ortiz^Ortiz^Luis^^^Dr.', visit: ADMISSION, erVisit: VISIT }),
      ],
      false
    ),
    m(
      'correccion',
      '10:40 AM',
      'Corrección: radiografía confirmada por el radiólogo',
      'ORU^R01',
      [
        msh(t('1040'), 'ORU^R01^ORU_R01', 'SIM-0013'),
        pid(),
        pv1({ place: 'cubiculo-12' }),
        obr(1, byId['O-1004'], t('0950'), { 22: t('1040'), 25: 'C' }),
        seg('OBX', { 1: '1', 2: 'ST', 3: '30746-2^Radiografía de tórax^LN', 5: 'Pulmonía en la parte baja del pulmón derecho', 11: 'C', 14: t('1040') }),
        nte('El radiólogo confirmó la lectura.'),
      ],
      false
    ),
  ];
}

/** Today in Puerto Rico as YYYYMMDD. */
export function todayPR() {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
}
