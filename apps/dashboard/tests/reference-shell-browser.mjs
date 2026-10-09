import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 700 : width === 390 ? 844 : 720 } });
    const requests = [];
    const errors = [];
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:3001' || ['fetch', 'xhr'].includes(request.resourceType())) {
        requests.push(request.url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:3001');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByTestId('demo-notice')).toHaveText(/Demostración · datos ficticios/);
    await expect(page.getByTestId('welcome-panel').getByRole('heading', { name: 'Su portal, a su ritmo.' })).toBeVisible();
    await expect(page.getByTestId('entry-options').getByRole('heading', { name: 'Explore el portal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acerca de esta demostración', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Este prototipo no está conectado a hospitales ni a PRHIE.', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cuenta: Carmen', exact: true })).toBeVisible();

    const surface = await page.getByTestId('entry-surface').boundingBox();
    const welcome = await page.getByTestId('welcome-panel').boundingBox();
    const options = await page.getByTestId('entry-options').boundingBox();
    expect(surface).not.toBeNull();
    expect(welcome).not.toBeNull();
    expect(options).not.toBeNull();
    if (width === 1280) {
      expect(surface.width).toBeGreaterThan(1000);
      expect(Math.abs(welcome.y - options.y)).toBeLessThan(2);
      expect(welcome.width).toBeGreaterThan(450);
      expect(options.width).toBeGreaterThan(500);
    } else {
      expect(options.y).toBeGreaterThan(welcome.y + welcome.height - 2);
    }
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      buttons: [...document.querySelectorAll('[role="button"]')].map(button => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      })),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.buttons.every(button => button.width >= 44 && button.height >= 44)).toBe(true);

    await page.getByRole('button', { name: 'Cuenta: Carmen', exact: true }).click();
    await page.getByRole('button', { name: 'Rol: Mi salud', exact: true }).click();
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    await expect(page.getByTestId('section-heading')).toHaveText('Mi visita');
    expect(await page.getByRole('button', { name: 'Ir a Mi visita', exact: true }).locator('[dir="auto"]').first().evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
    const visitSummary = await page.getByTestId('visit-summary').boundingBox();
    const visitDetails = await page.getByTestId('visit-details').boundingBox();
    expect(visitSummary).not.toBeNull();
    expect(visitDetails).not.toBeNull();
    expect(await page.getByTestId('visit-summary').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(22, 75, 197)');
    if (width === 1280) {
      expect(Math.abs(visitSummary.y - visitDetails.y)).toBeLessThan(2);
      expect(visitSummary.width).toBeGreaterThan(visitDetails.width);
    } else {
      expect(visitDetails.y).toBeGreaterThan(visitSummary.y + visitSummary.height - 2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    results.push({ width, surface, welcome, options, geometry });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ mode: 'local-synthetic-web', cases: results }, null, 2));
