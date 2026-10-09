import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against the built mock preview (or mock dev); never starts another server.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const requests = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  requests.push({ url: url.pathname, origin: url.origin, type: route.request().resourceType() });
  if (url.origin !== 'http://127.0.0.1:3001' || /auth\/|fhir\/|oauth2\//.test(url.pathname)) {
    errors.push('Forbidden network: ' + url.origin + url.pathname);
    return route.abort();
  }
  return route.continue();
});
const results = [];
try {
  await mkdir('docs/evidence', { recursive: true });
  for (const [width, height] of [[390, 844], [1280, 577], [320, 700]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:3001/');
    await expect(page).toHaveTitle('Puerto Rico Patient Portal');
    await expect(page.getByRole('heading', { name: 'Puerto Rico Patient Portal', exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Foo\s*Medical/i);
    const identity = await page.evaluate(async () => {
      const icon = document.querySelector('link[rel="icon"]');
      const href = icon?.getAttribute('href');
      if (href !== '/favicon.png') throw new Error('Unexpected favicon: ' + href);
      const response = await fetch(href);
      if (!response.ok) throw new Error('Favicon HTTP ' + response.status);
      if (!response.headers.get('content-type')?.includes('image/png')) throw new Error('Favicon MIME');
      const image = new Image();
      image.src = href;
      await image.decode();
      const symbol = document.querySelector('h1 img');
      await symbol.decode();
      return { title: document.title, favicon: href, faviconWidth: image.naturalWidth,
        faviconHeight: image.naturalHeight, symbolWidth: symbol.naturalWidth, symbolHeight: symbol.naturalHeight,
        faviconDecoded: true, legacyBrandVisible: /Foo\s*Medical/i.test(document.body.innerText) };
    });
    expect(identity.faviconWidth).toBe(64);
    expect(identity.faviconHeight).toBe(64);
    expect(identity.symbolWidth).toBe(651);
    expect(identity.symbolHeight).toBe(547);
    await expect(page.getByRole('img', { name: 'Puerto Rico Patient Portal', exact: true })).toBeVisible();
    const name = page.getByRole('heading', { name: 'Carmen Rivera Colón' });
    await expect(name).toBeVisible();
    const box = await name.boundingBox();
    expect(box.y + box.height).toBeLessThan(height);
    const measurements = await page.evaluate(() => ({
      shellWidth: document.querySelector('main').getBoundingClientRect().width,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll('select, button')].map(el => ({
        height: el.getBoundingClientRect().height,
        width: el.getBoundingClientRect().width,
        text: el.textContent,
        font: getComputedStyle(el).fontSize,
      })),
    }));
    expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.clientWidth);
    for (const control of measurements.controls) {
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.width).toBeGreaterThanOrEqual(44);
    }
    expect(measurements.shellWidth).toBeLessThanOrEqual(430);
    await expect(page.getByRole('navigation', { name: 'Secciones del portal' }).getByRole('button')).toHaveCount(5);
    await page.screenshot({ path: `docs/evidence/ayo59-mock-${width}.png`, fullPage: true });
    const assertUnbrokenLabels = async () => {
      const labels = await page.locator('button').evaluateAll(buttons => buttons.map(button => {
        const style = getComputedStyle(button);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return { label: button.textContent,
          wordWidth: Math.max(...button.textContent.trim().split(/\s+/).map(word => ctx.measureText(word).width)),
          available: button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
      }));
      for (const label of labels) expect(label.wordWidth, label.label).toBeLessThanOrEqual(label.available);
    };
    await assertUnbrokenLabels();
    const nav = page.getByRole('navigation', { name: 'Secciones del portal' });
    await nav.getByRole('button', { name: 'Mi visita', exact: true }).focus();
    const focus = await page.evaluate(() => ({
      style: getComputedStyle(document.activeElement).outlineStyle,
      width: getComputedStyle(document.activeElement).outlineWidth,
    }));
    expect(focus.style).toBe('solid');
    expect(focus.width).toBe('3px');
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('button', { name: 'Resultados', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    for (const section of ['Resultados', 'Mi cuidado', 'Familia', 'Más']) {
      const button = nav.getByRole('button', { name: section, exact: true });
      await expect(button).toBeFocused();
      await page.keyboard.press('Space');
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
      await expect(page.getByText('Esta sección todavía no está implementada en este prototipo', { exact: true })).toBeVisible();
      if (section !== 'Más') await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Shift+Tab');
    await expect(nav.getByRole('button', { name: 'Familia', exact: true })).toBeFocused();
    await page.getByLabel('Cuenta de').selectOption('lourdes');
    await expect(page.getByRole('heading', { name: 'Mi visita', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Resultados', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Más', exact: true })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/No hay datos|Permisos del ejemplo|resultado nuevo|hemograma/i);
    await page.screenshot({ path: `docs/evidence/ayo59-delegado-${width}.png`, fullPage: true });
    await page.getByRole('combobox', { name: /^Rol/ }).focus();
    await page.getByRole('combobox', { name: /^Rol/ }).selectOption('self');
    await expect(page.getByRole('combobox', { name: /^Rol/ })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Lourdes', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Resultados', exact: true })).toBeEnabled();
    const readLayout = () => page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      font: getComputedStyle(document.querySelector('.mock-panel p')).fontSize,
      controls: [...document.querySelectorAll('button, select')].map(el => ({
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
        font: getComputedStyle(el).fontSize, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      })),
    }));
    await page.getByRole('button', { name: 'Aumentar letra' }).click();
    await page.getByRole('button', { name: 'Aumentar letra' }).click();
    const large = await readLayout();
    expect(large.font).toBe('24px');
    expect(large.scrollWidth).toBeLessThanOrEqual(large.clientWidth);
    for (const control of large.controls) {
      expect(control.font).toBe('24px');
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth);
    }
    await page.screenshot({ path: `docs/evidence/ayo59-letra-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Reducir letra' }).click();
    await page.getByRole('button', { name: 'Reducir letra' }).click();
    expect((await readLayout()).font).toBe('16px');
    // Text zoom surrogate, not a claim of browser/assistive-technology zoom certification.
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const textZoom = await readLayout();
    await assertUnbrokenLabels();
    expect(textZoom.font).toBe('32px');
    expect(textZoom.scrollWidth).toBeLessThanOrEqual(textZoom.clientWidth);
    for (const control of textZoom.controls) expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth);
    await page.screenshot({ path: `docs/evidence/ayo59-textzoom-${width}.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.getByRole('button', { name: 'Salir del ejemplo' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByLabel('Cuenta de')).toHaveCount(0);
    const reenter = page.getByRole('button', { name: 'Volver a entrar al ejemplo' });
    await expect(reenter).toBeFocused();
    await page.screenshot({ path: `docs/evidence/ayo59-salida-${width}.png`, fullPage: true });
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Cuenta de')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Mi visita', exact: true })).toBeVisible();
    results.push({ width, height, identity, nameVisibleWithoutScroll: true, ...measurements,
      focus, large, textZoom, sectionsKeyboard: 'pass', contextReset: 'pass', simulatedExit: 'pass' });
  }
  await page.getByRole('combobox', { name: /^Cuenta de/ }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: /^Cuenta de/ })).toHaveValue('lourdes');
  await expect(page.getByRole('button', { name: 'Resultados', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: /^Rol/ }).selectOption('self');
  await expect(page.getByRole('heading', { name: 'Lourdes', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Carmen Rivera Colón' })).toHaveCount(0);
  await page.getByRole('combobox', { name: /^Cuenta de/ }).selectOption('rafael');
  await expect(page.getByRole('heading', { name: 'Carmen Rivera Colón' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resultados', exact: true })).toBeEnabled();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  const second = await context.newPage();
  await second.goto('http://127.0.0.1:3001/');
  await expect(second.getByRole('combobox', { name: /^Cuenta de/ })).toHaveValue('carmen');
  await expect(page.getByRole('combobox', { name: /^Cuenta de/ })).toHaveValue('rafael');
  await page.reload();
  await expect(page.getByRole('combobox', { name: /^Cuenta de/ })).toHaveValue('carmen');
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(storage).toEqual({ local: [], session: [] });
  expect(errors).toEqual([]);
  const report = { browser: browser.version(), mode: 'mock provisional', results, errors, storage,
    requests, accountsAndRoles: 'pass', keyboardSelection: 'pass', tabsAndReload: 'pass' };
  await writeFile('docs/evidence/ayo59-browser.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, requests: { total: requests.length, backend: 0, external: 0 } }, null, 2));
} finally { await browser.close(); }
