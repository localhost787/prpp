import { enterContext, changeRole } from './entry-helpers.mjs';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { browser: browser.version(), cases: [] };
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 577 : width === 320 ? 700 : 844 } });
    const requests = [], errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1:3001' || ['fetch', 'xhr'].includes(route.request().resourceType())) { requests.push(url.origin); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('websocket', socket => requests.push(socket.url()));
    await page.goto('http://127.0.0.1:3001');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Account: Carmen', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Switch language to Spanish', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByText('Interfaz Expo web', { exact: true })).toBeVisible({ timeout: 5000 });
    await enterContext(page, 'Carmen', 'self', 'es');
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    for (const section of ['Resultados', 'Mi cuidado', 'Familia', 'Más', 'Mi visita']) {
      await page.getByRole('button', { name: `Ir a ${section}`, exact: true }).click();
      await expect(page.getByTestId('section-heading')).toHaveText(section);
    }
    if (width === 1280) {
      const profile = await page.getByTestId('context-card').boundingBox();
      const feature = await page.getByTestId('section-card').boundingBox();
      expect(profile, 'tarjeta de contexto en grilla').not.toBeNull();
      expect(feature, 'tarjeta de sección en grilla').not.toBeNull();
      expect(profile.height).toBeLessThan(220);
      expect(feature.y).toBeGreaterThan(profile.y + profile.height);
      expect(feature.width).toBeGreaterThan(800);
      const cards = await page.getByTestId('shortcut-card').all();
      expect(cards.length).toBe(3);
      const positions = await Promise.all(cards.map(card => card.boundingBox()));
      expect(new Set(positions.map(p => Math.round(p.y))).size).toBe(1);
    }
    await page.getByRole('button', { name: 'Abrir Familia', exact: true }).click();
    await expect(page.getByTestId('section-heading')).toHaveText('Familia');
    await page.getByRole('button', { name: 'Ir a Mi visita', exact: true }).click();
    const bounds = await page.getByTestId('dashboard-shell').boundingBox();
    expect(Math.round(bounds.width)).toBe(width);
    const overflow = async () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect((await overflow()).scroll).toBeLessThanOrEqual(width);
    const controls = await page.getByRole('button').evaluateAll(nodes => nodes.map(el => ({ label: el.getAttribute('aria-label'), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
    expect(controls.every(control => control.width >= 44 && control.height >= 44)).toBe(true);
    await page.getByRole('button', { name: 'Cambiar cuenta', exact: true }).focus();
    const keyboardLabels = new Set();
    for (let index = 0; index < controls.length + 5; index++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      if (label) keyboardLabels.add(label);
    }
    for (const label of ['Cambiar cuenta', 'Cerrar contexto', 'Ir a Resultados', 'Ir a Mi cuidado', 'Ir a Familia', 'Ir a Más']) expect(keyboardLabels.has(label)).toBe(true);
    await page.getByRole('button', { name: 'Ir a Mi visita', exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `../../docs/evidence/dashboard-expo/expo-${width}.png`, fullPage: true });
    await page.mouse.move(width - 20, 400);
    await page.mouse.wheel(0, 1200);
    await expect(page.getByText('Toda la información de esta demo es ficticia.', { exact: true })).toBeInViewport();
    await enterContext(page, 'Lourdes', 'delegate', 'es');
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    await expect(page.getByRole('button', { name: 'Ir a Resultados', exact: true })).toBeDisabled();
    await expect(page.getByText('Resultados: acceso no habilitado para este rol en el ejemplo. No indica si existe información.', { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `../../docs/evidence/dashboard-expo/expo-delegada-${width}.png`, fullPage: true });
    await changeRole(page, 'self', 'es');
    await expect(page.getByTestId('patient-name')).toHaveText('Lourdes');
    await expect(page.getByRole('button', { name: 'Ir a Resultados', exact: true })).toBeEnabled();
    await expect(page.getByTestId('section-heading')).toHaveText('Mi visita');
    const initial = await page.getByTestId('patient-name').evaluate(el => getComputedStyle(el).fontSize);
    await page.getByRole('button', { name: 'Aumentar letra', exact: true }).click();
    await page.getByRole('button', { name: 'Aumentar letra', exact: true }).click();
    const enlarged = await page.getByTestId('patient-name').evaluate(el => getComputedStyle(el).fontSize);
    expect(parseFloat(enlarged)).toBeGreaterThan(parseFloat(initial));
    const resultLabel = await page.getByRole('button', { name: 'Ir a Resultados', exact: true }).evaluate(el => {
      const text = el.querySelector('[dir="auto"]');
      return { height: text.getBoundingClientRect().height, line: parseFloat(getComputedStyle(text).lineHeight) };
    });
    expect(resultLabel.height).toBeLessThanOrEqual(resultLabel.line + 1);
    expect((await overflow()).scroll).toBeLessThanOrEqual(width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `../../docs/evidence/dashboard-expo/expo-letra-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Reducir letra', exact: true }).click();
    await page.getByRole('button', { name: 'Reducir letra', exact: true }).click();
    expect(await page.getByTestId('patient-name').evaluate(el => getComputedStyle(el).fontSize)).toBe(initial);
    await enterContext(page, 'Lourdes', 'delegate', 'es');
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    await expect(page.getByRole('button', { name: 'Ir a Resultados', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Cerrar contexto', exact: true }).click();
    await expect(page.getByTestId('patient-name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cuenta: Carmen', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('patient-name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rol: Mi salud', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Account: Carmen', exact: true })).toBeVisible();
    const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, caches: (await caches.keys()).length, indexedDB: (await indexedDB.databases()).length }));
    expect(storage).toEqual({ local: 0, session: 0, caches: 0, indexedDB: 0 });
    expect(requests).toEqual([]); expect(errors).toEqual([]);
    report.cases.push({ width, viewport: page.viewportSize(), passed: true, initial, enlarged, bounds, controls, keyboardLabels: [...keyboardLabels], storage, externalRequests: requests, errors });
    await context.close();
  }
} finally {
  await writeFile('../../docs/evidence/dashboard-expo/browser.json', JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
