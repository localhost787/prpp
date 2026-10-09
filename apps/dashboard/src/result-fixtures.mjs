// Only called AFTER permission check. Synthetic case, not a clinical seed or API response.
// Source: caso-de-prueba-csv.md lines 18–23; contrato-api.md API-09/10.
import { translate } from './i18n.mjs';
// Source-language fields remain faithful; presentation keys are for this fixture only.
const sourceText = key => translate('es', key);
export function resultFixtures(patientId) {
  if (patientId !== 'carmen') return [];
  const rows = [
    ['wbc', sourceText('wbcTitle'), 15.2, sourceText('thousandPerMicroliter'), '4.5–11.0', 'H', sourceText('wbcNote'), 'final'],
    ['hb', sourceText('hbTitle'), 12.8, 'g/dL', '12.0–15.5', 'N', sourceText('hbNote'), 'final'],
    ['lactato', sourceText('lactatoTitle'), 1.4, 'mmol/L', '0.5–2.0', 'N', sourceText('lactatoNote')],
    ['glucosa', sourceText('glucosaTitle'), 168, 'mg/dL', '70–99', 'H', sourceText('glucosaNote')],
    ['creatinina', sourceText('creatininaTitle'), 1.1, 'mg/dL', '0.6–1.2', 'N', sourceText('creatininaNote')],
    ['rx', sourceText('rxTitle'), sourceText('rxValue'), null, null, null, sourceText('rxNote'), 'preliminary'],
  ];
  return rows.map(([id, title, value, unit, range, interpretation, note, status]) => ({
    resourceType: 'Observation', id,
    presentationKeys: { title: `${id}Title`, note: `${id}Note`, ...(id === 'rx' ? { value: 'rxValue' } : {}), ...(id === 'wbc' ? { unit: 'thousandPerMicroliter' } : {}), ...(['wbc', 'hb'].includes(id) ? { report: 'cbcTitle' } : id === 'rx' ? { report: 'rxTitle' } : {}) }, subject: { reference: 'Patient/carmen' },
    meta: { tag: [{ system: 'urn:portal:origen', code: 'simulado' }] },
    code: { text: title }, ...(status ? { status } : {}),
    ...(unit ? { valueQuantity: { value, unit } } : { valueString: value }),
    ...(range ? { referenceRange: [{ text: range }] } : {}),
    ...(interpretation ? { interpretation: [{ coding: [{ code: interpretation }] }] } : {}),
    note: [{ text: note }],
    // Only report associations explicitly supported by API-09/10 and case.
    ...(id === 'wbc' || id === 'hb' ? { report: { resourceType: 'DiagnosticReport', code: { text: sourceText('cbcTitle') }, status: 'final' } } :
      id === 'rx' ? { report: { resourceType: 'DiagnosticReport', code: { text: title }, status: 'preliminary' } } : {}),
  }));
}
