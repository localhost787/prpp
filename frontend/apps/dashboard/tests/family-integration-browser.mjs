import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { enterContext } from './entry-helpers.mjs';
import { translate } from '../src/i18n.mjs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route('http://127.0.0.1:3001/**', async route => {
      const url = new URL(route.request().url());
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = normalize(join(root, relative));
      if (!file.startsWith(root)) return route.abort();
      try {
        await route.fulfill({ status: 200, body: await readFile(file), contentType: types[extname(file)] ?? 'application/octet-stream' });
      } catch { await route.fulfill({ status: 404, body: 'not found' }); }
    });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
      if (['fetch', 'xhr'].includes(request.resourceType()) || !request.url().startsWith('http://127.0.0.1:3001/')) requests.push(request.url());
    });

    await page.goto('http://127.0.0.1:3001/');
    await enterContext(page, 'Carmen', 'self', 'en');
    const t = (key, args) => translate('en', key, args);
    await page.getByRole('button', { name: t('goTo', { section: t('family') }), exact: true }).click();

    const panel = page.getByTestId('family-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Family access');
    await expect(panel.getByRole('heading', { name: 'Lourdes Santiago Rivera', exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Rafael', exact: true })).toHaveCount(0);

    const lourdesCard = panel.getByRole('heading', { name: 'Lourdes Santiago Rivera', exact: true }).locator('..');
    await expect(lourdesCard.getByRole('switch', { name: 'Emergency status: On', exact: true })).toBeVisible();
    await expect(lourdesCard.getByRole('switch', { name: 'Medicines: On', exact: true })).toBeVisible();
    await expect(lourdesCard.getByRole('switch', { name: 'Discharge instructions and follow-up: On', exact: true })).toBeVisible();
    await expect(lourdesCard.getByRole('switch', { name: 'Studies and results: Off', exact: true })).toBeVisible();

    await lourdesCard.getByRole('switch', { name: 'Medicines: On', exact: true }).click();
    await expect(lourdesCard.getByRole('switch', { name: 'Medicines: Off', exact: true })).toBeVisible();
    await expect(page.getByTestId('family-save-status')).toContainText('saved only in this local example');

    await page.getByRole('button', { name: 'Switch language to Spanish', exact: true }).click();
    await expect(panel).toContainText('Acceso de familiares');
    await expect(lourdesCard.getByRole('switch', { name: 'Medicinas: Desactivado', exact: true })).toBeVisible();

    await enterContext(page, 'Lourdes', 'delegate', 'es');
    const es = (key, args) => translate('es', key, args);
    await page.getByRole('button', { name: es('goTo', { section: es('family') }), exact: true }).click();
    const delegatePanel = page.getByTestId('family-panel');
    await expect(delegatePanel).toBeVisible();
    await expect(delegatePanel.getByTestId('delegate-family-categories')).toContainText('Estudios y resultados');
    await expect(delegatePanel.getByTestId('delegate-family-categories')).toContainText('Privado');
    await expect(delegatePanel).not.toContainText(/Hemograma|15\.2|glóbulos/i);
    await expect(delegatePanel.getByRole('switch')).toHaveCount(0);

    await enterContext(page, 'Carmen', 'self', 'es');
    await page.getByRole('button', { name: es('goTo', { section: es('family') }), exact: true }).click();
    const restoredLourdesCard = page.getByTestId('family-panel').getByRole('heading', { name: 'Lourdes Santiago Rivera', exact: true }).locator('..');
    await expect(restoredLourdesCard.getByRole('switch', { name: 'Medicinas: Desactivado', exact: true })).toBeVisible();

    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      targets: [...document.querySelectorAll('[role="switch"], [role="button"]')].every(element => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }),
    }));
    expect(metrics).toEqual({ overflow: false, targets: true });
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('AYO-84 integrated family checks passed at 320, 390, and 1280.');
