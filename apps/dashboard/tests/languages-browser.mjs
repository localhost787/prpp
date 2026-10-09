import { enterContext, changeRole } from './entry-helpers.mjs';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { translate } from '../src/i18n.mjs';
const folder = '../../docs/evidence/PRPP-idiomas';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { browser: browser.version(), cases: [] };
try {
 for (const width of [320, 390, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage(); const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType()) || !request.url().startsWith('http://127.0.0.1:3001/')) requests.push(request.url()); });
  page.setDefaultTimeout(5000);
  const button = name => page.getByRole('button', { name, exact: true });
  let language = 'en';
  const t = (key, values) => translate(language, key, values);
  const switchLanguage = async () => {
    const control = button(t('languageLabel'));
    await expect(control).toHaveText(t('languageButton'));
    await control.focus(); await page.keyboard.press('Enter');
    language = language === 'en' ? 'es' : 'en';
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(button(t('languageLabel'))).toBeFocused();
  };
  const overflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.goto('http://127.0.0.1:3001');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(button('Account: Carmen')).toBeVisible();
  await switchLanguage(); await expect(button('Cuenta: Carmen')).toBeVisible(); await switchLanguage();
  await enterContext(page, 'Carmen', 'self', language);
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
  for (const pass of ['en', 'es', 'en']) {
    if (language !== pass) await switchLanguage();
    for (const section of ['visit', 'care', 'family', 'more', 'results']) {
      await button(t('goTo', { section: t(section) })).click();
      await expect(page.getByTestId('section-heading')).toHaveText(t(section));
      await overflow();
      await button(t('larger')).click(); await button(t('larger')).click();
      await overflow();
      await button(t('smaller')).click(); await button(t('smaller')).click();
    }
    await expect(page.getByTestId('result-card')).toHaveCount(6);
    for (const id of ['wbc', 'hb', 'lactato', 'glucosa', 'creatinina', 'rx']) {
      await button(t('viewDetailLabel', { name: t(`${id}Title`) })).click();
      await expect(page.getByTestId('result-detail').getByText(t(`${id}Note`), { exact: true })).toBeVisible();
      await expect(page.getByTestId('result-detail').getByText(t('askTeam'), { exact: true })).toBeVisible();
      await button(t('closeDetailLabel', { name: t(`${id}Title`) })).click();
    }
    await expect(page.getByText(`15.2 ${t('thousandPerMicroliter')}`, { exact: true })).toBeVisible();
    await expect(page.getByText('12.8 g/dL', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: t('searchResult') }).fill(t('wbcTitle'));
    await expect(page.getByTestId('result-card')).toHaveCount(1);
    await button(t('viewDetailLabel', { name: t('wbcTitle') })).click();
    await expect(page.getByText(t('wbcNote'), { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: t('searchResult') }).fill('');
    await button(t('filterLabel', { status: t('preliminary') })).click();
    await expect(page.getByTestId('result-card')).toHaveCount(1);
    await button(t('viewDetailLabel', { name: t('rxTitle') })).click();
    await expect(page.getByText(t('rxValue'), { exact: true })).toBeVisible();
    await expect(page.getByText(t('rxNote'), { exact: true })).toBeVisible();
    await switchLanguage();
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    await expect(page.getByTestId('result-card')).toHaveCount(1);
    await expect(page.getByTestId('result-detail')).toHaveCount(1);
    await expect(button(t('filterLabel', { status: t('preliminary') }))).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(t('rxValue'), { exact: true })).toBeVisible();
    await switchLanguage();
    await overflow();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${folder}/${language}-detail-${width}.png`, fullPage: true });
    await button(t('filterLabel', { status: t('all') })).click();
    await button(t('larger')).click(); await button(t('larger')).click();
    await overflow();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${folder}/${language}-large-${width}.png`, fullPage: true });
    await button(t('smaller')).click(); await button(t('smaller')).click();
  }
  await page.getByRole('textbox', { name: t('searchResult') }).fill('gl');
  await switchLanguage();
  await expect(page.getByRole('textbox', { name: t('searchResult') })).toHaveValue('gl');
  await expect(page.getByTestId('result-card').getByRole('heading')).toHaveText([t('wbcTitle'), t('hbTitle'), t('glucosaTitle')]);
  await enterContext(page, 'Lourdes', 'delegate', language);
  for (let pass = 0; pass < 2; pass++) {
    await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
    await expect(button(t('goTo', { section: t('results') }))).toBeDisabled();
    await expect(page.getByTestId('result-card')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/15\.2|White blood cells|Glóbulos blancos|Hemoglobina|Hemoglobin/);
    await expect(page.getByText(t('restrictedResults'), { exact: true })).toBeVisible();
    await switchLanguage();
  }
  await changeRole(page, 'self', language);
  await button(t('goTo', { section: t('results') })).click();
  await expect(page.getByText(t('noResults'), { exact: true })).toBeVisible();
  await switchLanguage();
  await expect(page.getByTestId('patient-name')).toHaveText('Lourdes');
  await expect(page.getByText(t('noResults'), { exact: true })).toBeVisible();
  await enterContext(page, 'Rafael', 'delegate', language);
  await button(t('goTo', { section: t('results') })).click();
  await button(t('filterLabel', { status: t('final') })).click();
  await switchLanguage();
  await expect(page.getByTestId('context-card')).toContainText('Rafael');
  await expect(page.getByTestId('result-card')).toHaveCount(2);
  await button(t('close')).click();
  await expect(page.getByTestId('result-card')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(button('Account: Carmen')).toBeVisible();
  expect(await page.evaluate(async () => [localStorage.length, sessionStorage.length, (await caches.keys()).length, (await indexedDB.databases()).length])).toEqual([0, 0, 0, 0]);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  report.cases.push({ width, passed: true, errors, requests, languages: ['en', 'es', 'en'], scale: [1, 1.5] });
  await context.close();
 }
} finally { await writeFile(`${folder}/browser.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
