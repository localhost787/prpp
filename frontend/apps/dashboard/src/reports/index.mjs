import { resultFixtures } from '../result-fixtures.mjs';
import { resultPresentation, statusKey, statusLabel, interpretationLabel } from '../results.mjs';

export const reportCopy = Object.freeze({
  en: Object.freeze({ warning: 'SYNTHETIC DEMO — NOT FOR MEDICAL USE', fictitious: 'Fictitious institution', grouping: 'Mock-only presentation grouping; not an official FHIR report or source.', provisional: 'Clinical translations are provisional.', value: 'Result', range: 'Reference range', interpretation: 'Interpretation', status: 'Source status', note: 'Explanation', missing: 'Not provided', download: 'Download synthetic PDF', institutionA: 'Demo Laboratory A', institutionB: 'Demo Laboratory B', institutionX: 'Demo Imaging Center', cbc: 'Complete blood count', rx: 'Chest X-ray', blood: 'Other blood results' }),
  es: Object.freeze({ warning: 'DEMOSTRACIÓN SINTÉTICA — NO USAR PARA ATENCIÓN MÉDICA', fictitious: 'Institución ficticia', grouping: 'Agrupación visual solo del mock; no es un informe ni fuente FHIR oficial.', provisional: 'Las traducciones clínicas son provisionales.', value: 'Resultado', range: 'Intervalo de referencia', interpretation: 'Interpretación', status: 'Estado en la fuente', note: 'Explicación', missing: 'No indicado', download: 'Descargar PDF sintético', institutionA: 'Laboratorio de demostración A', institutionB: 'Laboratorio de demostración B', institutionX: 'Centro de imágenes de demostración', cbc: 'Hemograma completo', rx: 'Radiografía de tórax', blood: 'Otros resultados de sangre' }),
});
// Assets are bundled synthetic demonstration data, NOT access-controlled server records.
async function loadBundledPdf(id, language) {
  const { pdfAssets } = await import('./pdf-assets.mjs');
  const encoded = pdfAssets[`${id}-${language}`];
  if (!encoded) throw new Error('PDF_UNAVAILABLE');
  return Uint8Array.from(globalThis.atob(encoded), char => char.charCodeAt(0));
}

// Call only from an explicit user gesture. save MUST commit synchronously; native
// adapters must independently recheck isCurrent immediately before any later side effect.
export async function downloadReport({ getContext, reportId, language = 'en', loadPdf = loadBundledPdf, save = saveBrowserPdf }) {
  const start = getContext();
  if (!authorized(start)) return { status: 'restricted' };
  if (!Object.hasOwn(reportCopy, language)) return { status: 'unsupported-language' };
  if (!groups.some(group => group[0] === reportId)) return { status: 'not-found' };
  const { generation, session } = start;
  const { account, role } = session;
  const isCurrent = () => {
    const live = getContext();
    return authorized(live) && live.generation === generation && live.session === session && live.session.account === account && live.session.role === role;
  };
  try {
    const bytes = await loadPdf(reportId, language);
    if (!isCurrent()) return { status: 'stale' };
    if (!(bytes instanceof Uint8Array)) return { status: 'error' };
    const outcome = save({ bytes, filename: 'synthetic-report.pdf', mimeType: 'application/pdf', isCurrent });
    return { status: outcome?.status ?? 'downloaded' };
  } catch { return { status: isCurrent() ? 'error' : 'stale' }; }
}

export function saveBrowserPdf({ bytes, filename, mimeType, isCurrent }, environment = globalThis) {
  if (!isCurrent()) return { status: 'stale' };
  const { document, URL, Blob } = environment;
  if (!document?.body || !URL?.createObjectURL || !Blob) return { status: 'unsupported-platform' };
  let url; let link;
  try {
    url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none';
    document.body.appendChild(link);
    if (!isCurrent()) return { status: 'stale' };
    link.click();
    return { status: 'downloaded' };
  } finally {
    link?.remove();
    // Allow the browser to consume the user-requested download before revocation.
    if (url) environment.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const groups = [ ['a', 'institutionA', 'cbc', ['wbc', 'hb']], ['b', 'institutionX', 'rx', ['rx']], ['c', 'institutionB', 'blood', ['lactato', 'glucosa', 'creatinina']] ];
const authorized = ctx => ctx?.status === 'ready' && Number.isSafeInteger(ctx.generation) && ctx.generation >= 0 && ctx.session?.permissions?.estudios === true && ctx.session?.patient?.id === 'carmen';
export function listReports(context, language = 'en', { source = resultFixtures } = {}) {
  if (!authorized(context)) return { status: 'restricted', reports: [] };
  if (!Object.hasOwn(reportCopy, language)) return { status: 'unsupported-language', reports: [] };
  const copy = reportCopy[language];
  const rows = source(context.session.patient.id);
  const reports = groups.map(([id, institution, title, ids]) => ({
    id, language, institution: copy[institution], title: copy[title], fictitious: true, synthetic: true,
    warning: copy.warning, grouping: copy.grouping, provisional: copy.provisional,
    items: ids.map(id => rows.find(item => item.id === id && item.subject?.reference === 'Patient/carmen')).filter(Boolean).map(item => ({
      id: item.id, ...resultPresentation(item, language), range: item.referenceRange?.[0]?.text ?? null,
      interpretationCode: item.interpretation?.[0]?.coding?.[0]?.code ?? null,
      interpretation: interpretationLabel(item, language), status: statusKey(item), statusLabel: statusLabel(item, language),
      sourceStatus: item.status ?? null,
    })),
  })).filter(report => report.items.length > 0);
  return { status: 'ready', reports };
}
