import { enterContext } from './entry-helpers.mjs';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType()) || !request.url().startsWith('http://127.0.0.1:3001/')) requests.push(request.url()); });
    await page.goto('http://127.0.0.1:3001/');
    await enterContext(page, 'Carmen', 'self', 'en');
    const panel = page.getByTestId('studies-panel');
    await expect(panel).toContainText('Studies in progress');
    await expect(page.getByTestId('study-row')).toHaveCount(5);
    await expect(panel).toContainText('Complete blood count');
    await expect(panel).toContainText('Ready');
    for (const label of ['Ordered', 'Sample collected', 'In process', 'Preliminary', 'Ready']) await expect(panel).toContainText(label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await enterContext(page, 'Lourdes', 'delegate', 'en');
    await expect(panel).toContainText('1 study in progress; results are private.');
    expect(await panel.innerText()).not.toMatch(/blood count|lactate|metabolic|X-ray|blood culture/i);

    await enterContext(page, 'Carmen', 'self', 'en');
    await expect(page.getByTestId('study-row')).toHaveCount(5);
    await expect(panel).toContainText('Complete blood count');
    await page.getByRole('button', { name: 'Switch language to Spanish', exact: true }).click();
    await expect(panel).toContainText('Estudios en curso');
    await expect(panel).toContainText('Hemograma completo');
    await expect(panel).toContainText('Hemocultivo (busca bacterias en la sangre)');
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('AYO-37 studies browser checks passed at 320, 390, and 1280.');
