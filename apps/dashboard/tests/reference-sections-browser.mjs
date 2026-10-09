import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:3001');
    await page.getByRole('button', { name: 'Cuenta: Carmen', exact: true }).click();
    await page.getByRole('button', { name: 'Rol: Mi salud', exact: true }).click();
    for (const section of ['visit', 'results', 'care', 'family', 'more']) {
      await expect(page.getByTestId(`nav-icon-${section}`)).toBeVisible();
    }

    await page.getByRole('button', { name: 'Ir a Resultados', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sobre este informe de ejemplo', exact: true }).first()).toHaveAttribute('aria-expanded', 'false');
    expect(await page.getByTestId('result-card').first().evaluate(element => ({
      topWidth: getComputedStyle(element).borderTopWidth,
      topColor: getComputedStyle(element).borderTopColor,
      sideColor: getComputedStyle(element).borderLeftColor,
    }))).toEqual({ topWidth: '1px', topColor: 'rgb(225, 231, 240)', sideColor: 'rgb(225, 231, 240)' });

    await page.getByRole('button', { name: 'Ir a Mi cuidado', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Opciones de demostración', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('care-simulation')).toHaveCount(0);
    const team = await page.getByTestId('care-team-section').boundingBox();
    const instructions = await page.getByTestId('care-instructions-section').boundingBox();
    if (width === 1280) expect(Math.abs(team.y - instructions.y)).toBeLessThan(2);
    else expect(instructions.y).toBeGreaterThan(team.y + team.height - 2);

    await page.getByRole('button', { name: 'Ir a Familia', exact: true }).click();
    const familyCards = page.getByTestId('patient-family-cards').locator(':scope > div');
    await expect(familyCards).toHaveCount(2);
    const first = await familyCards.nth(0).boundingBox();
    const second = await familyCards.nth(1).boundingBox();
    if (width === 1280) expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    else expect(second.y).toBeGreaterThan(first.y + first.height - 2);
    expect(await page.getByRole('switch').first().evaluate(element => getComputedStyle(element).borderColor)).toBe('rgb(225, 231, 240)');

    await page.getByRole('button', { name: 'Ir a Más', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Servicios y ayuda', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir Servicios', exact: true })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
    cases.push({ width, care: { team, instructions }, family: { first, second } });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ mode: 'local-synthetic-web', cases }, null, 2));
