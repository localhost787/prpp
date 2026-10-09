import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/reports/index.mjs').catch(() => ({}));
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const context = (patient = 'carmen', allowed = true) => ({ status: 'ready', generation: 1, session: { account: 'carmen', role: 'self', patient: { id: patient }, permissions: { estudios: allowed } } });

test('report listing denies before fixture access; groups authorized synthetic case only', () => {
  assert.equal(typeof api.listReports, 'function');
  let reads = 0;
  const source = () => { reads++; throw Error('must not read'); };
  for (const ctx of [null, context('carmen', false), context('lourdes'), { ...context(), status: 'loading' }]) {
    assert.deepEqual(api.listReports(ctx, 'en', { source }).reports, []);
  }
  assert.equal(reads, 0);
  const reports = api.listReports(context(), 'es').reports;
  assert.deepEqual(reports.map(r => r.items.map(i => i.id)), [['wbc', 'hb'], ['rx'], ['lactato', 'glucosa', 'creatinina']]);
  assert.deepEqual(reports[2].items.map(i => i.status), ['unknown', 'unknown', 'unknown']);
  assert.equal(reports[0].items[0].value, 15.2);
  assert.equal(reports[0].items[0].unit, 'mil/µL');
});

test('download rechecks live patient, permission, session and generation after async preparation', async () => {
  assert.equal(typeof api.downloadReport, 'function');
  for (const change of [ctx => { ctx.generation++; }, ctx => { ctx.session.permissions.estudios = false; }, ctx => { ctx.session.patient.id = 'lourdes'; }, ctx => { ctx.status = 'closed'; }, ctx => { ctx.session = { ...ctx.session }; }]) {
    let live = context(); let resolve; let saved = 0;
    const pending = api.downloadReport({ getContext: () => live, reportId: 'a', language: 'en', loadPdf: () => new Promise(r => { resolve = r; }), save: () => { saved++; } });
    change(live); resolve(new Uint8Array([37,80,68,70]));
    assert.equal((await pending).status, 'stale'); assert.equal(saved, 0);
  }
  let loaded = 0;
  assert.equal((await api.downloadReport({ getContext: () => context('carmen', false), reportId: 'a', loadPdf: () => { loaded++; } })).status, 'restricted');
  assert.equal(loaded, 0);
});

test('role matrix and invalid inputs fail closed without PDF preparation', async () => {
  const delegate = context('carmen', true); delegate.session.role = 'delegate';
  assert.equal(api.listReports(delegate).reports.length, 3);
  const lourdes = context('carmen', false); lourdes.session.account = 'lourdes'; lourdes.session.role = 'delegate';
  assert.equal(api.listReports(lourdes).reports.length, 0);
  for (const invalid of [context('lourdes'), { ...context(), generation: undefined }, { ...context(), generation: -1 }, context('carmen', 'true')]) {
    assert.equal(api.listReports(invalid).reports.length, 0);
  }
  let loads = 0;
  const ctx = context();
  for (const args of [{ reportId: 'bad', language: 'en' }, { reportId: 'a', language: 'xx' }]) {
    const result = await api.downloadReport({ getContext: () => ctx, ...args, loadPdf: () => { loads++; } });
    assert.ok(['not-found', 'unsupported-language'].includes(result.status));
  }
  assert.equal(loads, 0);
  assert.equal(api.saveBrowserPdf({ isCurrent: () => true }, {}).status, 'unsupported-platform');
  assert.equal(api.saveBrowserPdf({ isCurrent: () => false }, {}).status, 'stale');
});

test('real Chromium download uses an ephemeral revoked Blob URL, without a PDF endpoint', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.REPORTS_CHROMIUM_PATH || '/usr/bin/google-chrome' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const root = new URL('../src/', import.meta.url);
    const requested = [];
    await page.route('http://report-test.invalid/**', async route => {
      const path = new URL(route.request().url()).pathname;
      requested.push(path);
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<button id="save">Save synthetic report</button><script type="module">import {downloadReport} from "/reports/index.mjs"; const ctx={status:"ready",generation:1,session:{patient:{id:"carmen"},permissions:{estudios:true}}};window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>{window.revoked.push(u);revoke(u)};document.querySelector("button").onclick=async()=>{window.result=await downloadReport({getContext:()=>ctx,reportId:"a",language:"es"})};window.ready=true;</script>' });
      const allowed = ['/reports/index.mjs', '/reports/pdf-assets.mjs', '/result-fixtures.mjs', '/results.mjs', '/i18n.mjs'];
      assert.ok(allowed.includes(path));
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(path.slice(1), root), 'utf8') });
    });
    await page.goto('http://report-test.invalid/');
    await page.waitForFunction(() => window.ready);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#save');
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'synthetic-report.pdf');
    assert.ok(download.url().startsWith('blob:'));
    await download.saveAs(fileURLToPath(new URL('../../../docs/evidence/reports-pdf/browser-download.pdf', import.meta.url)));
    await page.waitForFunction(() => window.revoked.length === 1);
    assert.equal(await page.evaluate(() => window.result.status), 'downloaded');
    assert.equal(await page.locator('a').count(), 0);
    assert.ok(!requested.some(path => path.endsWith('.pdf')));
    writeFileSync(new URL('../../../docs/evidence/reports-pdf/browser-verification.json', import.meta.url), JSON.stringify({ engine: 'Chromium', download: 'pass', filename: download.suggestedFilename(), objectUrlRevoked: true, anchorsRemaining: 0, pdfHttpRequests: 0 }, null, 2));
  } finally { await browser.close(); }
});

test('all six real PDFs preserve fixture presentation, Unicode and source statuses', async () => {
  assert.equal(typeof api.downloadReport, 'function');
  const dir = fileURLToPath(new URL('../../../docs/evidence/reports-pdf/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const language of ['en', 'es']) {
    const ctx = context();
    for (const report of api.listReports(ctx, language).reports) {
      let bytes;
      const result = await api.downloadReport({ getContext: () => ctx, reportId: report.id, language, save: payload => { bytes = payload.bytes; assert.equal(payload.filename, 'synthetic-report.pdf'); } });
      assert.equal(result.status, 'downloaded');
      assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
      const path = `${dir}${report.id}-${language}.pdf`;
      writeFileSync(path, bytes);
      const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
      const normalize = s => String(s).replace(/\s+/g, ' ').trim();
      for (const item of report.items) for (const expected of [item.title, item.value, item.unit, item.range, item.note, item.statusLabel, item.interpretation]) {
        if (expected !== null && expected !== '') assert.ok(normalize(text).includes(normalize(expected)), `Missing ${expected} in ${path}`);
      }
      assert.ok(normalize(text).includes(normalize(report.warning)));
      assert.ok(!/CreationDate|ModDate/.test(Buffer.from(bytes).toString('latin1')));
    }
  }
});
