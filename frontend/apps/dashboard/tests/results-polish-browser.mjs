import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3001';
const folder = '../../docs/evidence/local-ui-results';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { mode: 'local-synthetic-http', cases: [], errors: [], unexpectedRequests: [] };
try {
 for (const width of [320, 390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.route('**/*', route => {
   if (!route.request().url().startsWith(origin + '/') || ['xhr','fetch'].includes(route.request().resourceType())) {
    report.unexpectedRequests.push(route.request().resourceType()); return route.abort();
   }
   return route.continue();
  });
  await page.goto(origin);
  const button = name => page.getByRole('button', { name, exact: true });
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await button('Switch language to Spanish').click();
  await button('Ir a Resultados').click();
  await expect(page.getByTestId('report-group')).toHaveCount(3);
  await expect(page.getByRole('textbox', { name: 'Buscar resultado' })).toHaveCount(0);
  const firstAction = await button('Ver informe: Hemograma completo').boundingBox();
  expect(firstAction.y + firstAction.height).toBeLessThanOrEqual(900);
  // The overview must not mount every clinical value before the person chooses an informe.
  await expect(page.getByTestId('result-card')).toHaveCount(0);
  const open = button('Ver informe: Hemograma completo');
  await expect(open).toHaveAttribute('data-variant', 'primary');
  await expect(button('Descargar PDF sintético: Hemograma completo')).toHaveCount(0);
  await open.click();
  await expect(page.getByTestId('result-card')).toHaveCount(2);
  await expect(button('Cerrar informe: Hemograma completo')).toBeFocused();
  await expect(button('Descargar PDF sintético: Hemograma completo')).toHaveAttribute('data-variant', 'secondary');
  await button('Ver detalle: Glóbulos blancos').click();
  await expect(page.getByTestId('result-detail')).toBeVisible();
  await expect(button('Cerrar detalle: Glóbulos blancos')).toBeFocused();
  await button('Cerrar detalle: Glóbulos blancos').click();
  await expect(button('Ver detalle: Glóbulos blancos')).toBeFocused();
  await button('Cerrar informe: Hemograma completo').click();
  await expect(open).toBeFocused();
  await expect(page.getByTestId('result-card')).toHaveCount(0);
  await button('Ver informe: Radiografía de tórax').click();
  const imaging = page.getByTestId('report-b');
  await expect(imaging).not.toContainText('Rango de referencia');
  await expect(imaging).not.toContainText('Sin interpretación');
  await expect(imaging).toContainText('Preliminar');
  await button('Ver detalle: Radiografía de tórax').click();
  await button('Cambiar idioma a inglés').click();
  await expect(button('Close report: Chest X-ray')).toBeVisible();
  await expect(page.getByTestId('result-detail')).toBeVisible();
  await button('Switch language to Spanish').click();
  for (const scale of [1, 1.5]) {
   if (scale === 1.5) { await button('Aumentar letra').click(); await button('Aumentar letra').click(); }
   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   const controls = await page.getByTestId('results-panel').getByRole('button').evaluateAll(els => els.map(el => { const r=el.getBoundingClientRect();return [r.width,r.height]; }));
   expect(controls.every(([w,h])=>w>=44&&h>=44)).toBe(true);
  }
  await button('Reducir letra').click(); await button('Reducir letra').click();
  await button('Buscar o filtrar').click();
  await page.getByRole('textbox', { name: 'Buscar resultado' }).fill('sin coincidencia');
  await expect(page.getByTestId('report-group')).toHaveCount(0);
  await button('Quitar filtro').click();
  await expect(page.getByTestId('report-group')).toHaveCount(3);
  await expect(page.getByTestId('result-card')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: `${folder}/overview-${width}.png`, fullPage: true });
  report.cases.push({ width, overview: true, reportAndDetailFocus: true, imaging: true, languagePreserved: true, textScale: true });
  await page.close();
 }
 expect(report.errors).toEqual([]); expect(report.unexpectedRequests).toEqual([]);
} finally { await browser.close(); await writeFile(`${folder}/results.json`, JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report));
