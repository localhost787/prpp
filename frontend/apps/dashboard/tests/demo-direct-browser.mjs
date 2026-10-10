import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { showDemoControls, expandReports } from './entry-helpers.mjs';
import { translate } from '../src/i18n.mjs';
const folder='../../docs/evidence/demo-direct'; await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={mode:'local-synthetic-intercepted-export',cases:[],errors:[],requests:[]};
try {
 for(const width of [320,390,1280]) {
  const context=await browser.newContext({viewport:{width,height:844}});
  await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!=='http://127.0.0.1:3001'||['xhr','fetch'].includes(r.resourceType())){report.requests.push(r.url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('websocket',s=>report.requests.push(s.url()));
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.goto('http://127.0.0.1:3001');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
  await expect(page.getByTestId('account-chooser')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  for(const language of ['es','en','es']) {
   if(await page.locator('html').getAttribute('lang')!==language) await button(translate(language==='es'?'en':'es','languageLabel')).click();
   const t=(key,args)=>translate(language,key,args);
   const view=name=>button(`${language==='es'?'Vista':'View'} ${name}`);
   await showDemoControls(page);
   await button(t('goTo',{section:t('visit')})).click();
   await expect(page.getByTestId('context-card')).toContainText(t('selfRole'));
   await button(language==='es'?'Opciones de demostración':'Demonstration options').click();
   await button(t('visitAdvance')).click();
   await expect(page.getByTestId('visit-summary')).toContainText(language==='es'?'Etapa 6 de 7':'Stage 6 of 7');
   await button(t('goTo',{section:t('family')})).click();
   await expect(page.getByTestId('section-heading')).toHaveText(t('family'));
   await expect(page.getByRole('heading',{name:'Lourdes Santiago Rivera',exact:true})).toBeVisible();
   expect(await page.locator('body').innerText()).not.toMatch(/Rafael/);
   const toggle=page.getByRole('switch').first(); const checked=await toggle.getAttribute('aria-checked');await toggle.click();await expect(toggle).not.toHaveAttribute('aria-checked',checked);
   await button(t('goTo',{section:t('results')})).click();
   await expandReports(page);
   await expect(page.getByTestId('result-card').first()).toBeVisible();
   await view('Lourdes').focus();await page.keyboard.press('Enter');
   await expect(page.getByTestId('context-card')).toContainText(t('delegateRole'));
   await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
   await expect(button(t('goTo',{section:t('results')}))).toBeDisabled();
   await expect(page.getByTestId('result-card')).toHaveCount(0);await expect(page.getByTestId('report-group')).toHaveCount(0);
   expect(await page.locator('body').innerText()).not.toMatch(/15\.2|Hemograma|Rafael/);
   await button(t('goTo',{section:t('family')})).click();await expect(page.getByRole('switch')).toHaveCount(0);
   await view('Carmen').click();await expect(page.getByTestId('section-heading')).toHaveText(t('results'));
   await button(t('goTo',{section:t('visit')})).click();
   await expect(page.getByTestId('visit-summary')).toContainText(language==='es'?'Etapa 5 de 7':'Stage 5 of 7');
   await button(t('goTo',{section:t('family')})).click();await expect(page.getByRole('switch').first()).not.toHaveAttribute('aria-checked',checked);
   // Restore the demo grants explicitly for the next language pass. View switches no longer reset them.
   await page.getByRole('switch').first().click();
   for (const index of [1,2]) { const sw=page.getByRole('switch').nth(index);if(await sw.getAttribute('aria-checked')==='false')await sw.click(); }
   await view('Carmen').click();
   for(const scale of [1,1.5]) {
    if(scale===1.5){await button(t('larger')).click();await button(t('larger')).click();}
    const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('[dir="auto"]')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(e=>e.textContent),buttons:[...document.querySelectorAll('[role="button"]')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))}));
    expect(metrics.width).toBeLessThanOrEqual(width);expect(metrics.clipped).toEqual([]);expect(metrics.buttons.every(b=>b.w>=44&&b.h>=44)).toBe(true);
    await page.screenshot({path:`${folder}/${width}-${language}-${scale}.png`,fullPage:true});
    if(scale===1.5){await button(t('smaller')).click();await button(t('smaller')).click();}
   }
  }
  await button('Vista Lourdes').click();await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByTestId('context-card')).toContainText(translate('en','selfRole'));
  const storage=await page.evaluate(async()=>[localStorage.length,sessionStorage.length,(await caches.keys()).length,(await indexedDB.databases()).length]);expect(storage).toEqual([0,0,0,0]);
  report.cases.push({width,languages:['es','en','es'],scales:[1,1.5],storage});await context.close();
 }
 expect(report.errors).toEqual([]);expect(report.requests).toEqual([]);
}finally{await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
