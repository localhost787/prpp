import { enterContext, changeRole } from './entry-helpers.mjs';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const folder = '../../docs/evidence/AYO-66';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { browser: browser.version(), cases: [] };
try {
 for (const width of [320, 390, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (['fetch', 'xhr'].includes(r.resourceType()) || !r.url().startsWith('http://127.0.0.1:3001/')) requests.push(r.url()); });
  page.on('websocket', s => requests.push(s.url()));
  await page.goto('http://127.0.0.1:3001');
  await enterContext(page, 'Carmen', 'self', 'en');
  const panel = page.getByTestId('visit-panel'), current = page.getByTestId('visit-current');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Initial example status: Receiving care');
  await expect(current).toHaveText('Current simulated stage: 5 of 7 · Tests');
  await expect(page.getByTestId('visit-phase')).toHaveCount(7);
  await expect(panel).toContainText('Cubicle 12'); await expect(panel).toContainText('8:12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${folder}/after-en-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Simulate next stage', exact: true }).click();
  await expect(current).toContainText('6 of 7');
  await page.getByRole('button', { name: 'Switch language to Spanish', exact: true }).click();
  await expect(current).toHaveText('Etapa simulada actual: 6 de 7 · Decisión');
  await page.getByRole('button', { name: 'Cambiar idioma a inglés', exact: true }).click();
  await expect(current).toHaveText('Current simulated stage: 6 of 7 · Decision');
  await page.getByRole('button', { name: 'Switch language to Spanish', exact: true }).click();
  await page.getByRole('button', { name: 'Reiniciar simulación a etapa 5', exact: true }).click();
  await expect(current).toContainText('5 de 7');
  await expect(panel).toContainText('Esperar resultados de laboratorio y la radiografía.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${folder}/after-es-${width}.png`, fullPage: true });
  for (let stage = 4; stage >= 1; stage--) {
    await page.getByRole('button', { name: 'Simular etapa anterior', exact: true }).click();
    await expect(current).toContainText(`${stage} de 7`);
  }
  await expect(page.getByRole('button', { name: 'Simular etapa anterior', exact: true })).toBeDisabled();
  for (let stage = 2; stage <= 7; stage++) {
    await page.getByRole('button', { name: 'Simular etapa siguiente', exact: true }).click();
    await expect(current).toContainText(`${stage} de 7`);
  }
  await expect(page.getByRole('button', { name: 'Simular etapa siguiente', exact: true })).toBeDisabled();
  await enterContext(page, 'Rafael', 'delegate', 'es');
  await expect(current).toContainText('5 de 7');
  await page.getByRole('button', { name: 'Reiniciar simulación a etapa 5', exact: true }).click();
  await enterContext(page, 'Lourdes', 'delegate', 'es');
  await expect(current).toHaveText('Etapa simulada actual: 5 de 7 · Atención de la visita');
  await expect(page.getByTestId('studies-panel')).toContainText('1 estudio en curso; los resultados son privados.');
  expect(await panel.innerText()).not.toMatch(/Hemograma|Lactato|Panel metabólico|Radiografía de tórax|Hemocultivo|15\.2/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${folder}/lourdes-${width}.png`, fullPage: true });
  await changeRole(page, 'self', 'es');
  await expect(panel).toContainText('No hay visita activa en este contexto de ejemplo.');
  expect(await panel.innerText()).not.toMatch(/Cubículo|Ana Ramos|8:12|Carmen/);
  await enterContext(page, 'Carmen', 'self', 'es');
  for (const [scenario, button, text] of [
    ['denied', 'Simular sin permiso de visita', 'Acceso a la visita no habilitado'],
    ['error', 'Simular error de carga', 'No pudimos cargar la visita'],
    ['empty', 'Simular vacío confirmado', 'No hay visita activa'],
    ['loading', 'Simular carga', 'Cargando la visita'],
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(panel).toContainText(text); await expect(current).toHaveCount(0);
    expect(await panel.innerText()).not.toMatch(/Cubículo|Ana Ramos|8:12/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${folder}/state-${scenario}-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Usar datos del contexto', exact: true }).click();
  await expect(current).toContainText('5 de 7');
  const reset = page.getByRole('button', { name: 'Reiniciar simulación a etapa 5', exact: true });
  await page.getByRole('button', { name: 'Simular etapa siguiente', exact: true }).focus();
  await page.keyboard.press('Tab'); await expect(reset).toBeFocused();
  const focus = await reset.evaluate(el => { const s = getComputedStyle(el); return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, outlineColor: s.outlineColor }; });
  expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
  const controls = await panel.getByRole('button').evaluateAll(nodes => nodes.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
  expect(controls.every(c => c.width >= 44 && c.height >= 44)).toBe(true);
  // Measure actual rendered text against its nearest opaque ancestor.
  const contrasts = await panel.locator('[dir="auto"]').evaluateAll(nodes => {
    const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = v => v.slice(0, 3).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
    return [...new Map(nodes.map(el => {
      const foreground = getComputedStyle(el).color;
      let parent = el, background;
      while (parent) { background = getComputedStyle(parent).backgroundColor; const v = rgb(background); if (v.length === 3 || v[3] === 1) break; parent = parent.parentElement; }
      const a = lum(rgb(foreground)), b = lum(rgb(background));
      return [foreground + background, { foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }];
    })).values()];
  });
  expect(contrasts.every(c => c.ratio >= 4.5)).toBe(true);
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Aumentar letra', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${folder}/large-es-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Simular etapa siguiente', exact: true }).click();
  await expect(current).toContainText('6 de 7');
  await page.getByRole('button', { name: 'Cerrar contexto', exact: true }).click();
  await enterContext(page, 'Carmen', 'self', 'es');
  await expect(current).toContainText('5 de 7');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(errors).toEqual([]); expect(requests).toEqual([]);
  report.cases.push({ width, passed: true, controls, focus, contrasts, errors, requests });
  await context.close();
 }
} finally { await writeFile(`${folder}/browser.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
