import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = { mode: 'local-synthetic-http', cases: [] };
const folder = '../../docs/evidence/local-ui-results';
await mkdir(folder, { recursive: true });
try {
 for (const width of [320,390,1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.goto('http://127.0.0.1:3001');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await button('Switch language to Spanish').click();
  await expect(page.getByTestId('section-heading')).toHaveText('Resultados');
  await expect(page.getByTestId('context-card').getByRole('button',{name:'Vista Carmen',exact:true})).toHaveCount(0);
  await expect(button('Vista Lourdes')).toHaveCount(0);
  await button('Controles de demostración').click();
  await expect(page.getByTestId('demo-controls')).toContainText('No inicia sesión');
  await button('Vista Lourdes').focus();await page.keyboard.press('Enter');
  await expect(page.getByTestId('context-card')).toContainText('Cuenta: Lourdes');
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
  await expect(button('Ir a Resultados')).toBeDisabled();
  await expect(page.getByTestId('report-group')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/15\.2|Glóbulos blancos|Hemograma completo/);
  await button('Vista Carmen').click();
  await expect(page.getByTestId('section-heading')).toHaveText('Resultados');
  await expect(page.getByTestId('result-card')).toHaveCount(0);
  await button('Controles de demostración').click();
  await expect(button('Vista Lourdes')).toHaveCount(0);
  await button('Cambiar idioma a inglés').click();
  await button('Demonstration controls').click();
  await expect(page.getByTestId('demo-controls')).toContainText('does not sign you in');
  await button('Switch language to Spanish').click();
  for(const scale of [1,1.5]) {
   if(scale===1.5){await button('Aumentar letra').click();await button('Aumentar letra').click();}
   const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('[dir="auto"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width&& (r.left<-.5||r.right>innerWidth+.5);}).map(()=>true)}));
   expect(metrics.width).toBeLessThanOrEqual(width);expect(metrics.clipped).toEqual([]);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByTestId('section-heading')).toHaveText('Results');
  await expect(button('View Lourdes')).toHaveCount(0);
  expect(await page.evaluate(async()=>[localStorage.length,sessionStorage.length,(await caches.keys()).length,(await indexedDB.databases()).length])).toEqual([0,0,0,0]);
  expect(errors).toEqual([]);
  evidence.cases.push({width,isolation:true,keyboardSwitch:true,noStorage:true,scale:true});await page.close();
 }
}finally{await browser.close();await writeFile(`${folder}/controls.json`,JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence));
