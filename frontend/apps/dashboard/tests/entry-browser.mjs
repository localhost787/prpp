import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { enterContext, changeRole } from './entry-helpers.mjs';
import { translate } from '../src/i18n.mjs';
const folder='../../docs/evidence/AYO-74';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={mode:'local-synthetic-web',cases:[],errors:[],requests:[]};
try {
 for(const width of [320,390,1280]) {
  const context=await browser.newContext({viewport:{width,height:844}});
  await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!=='http://127.0.0.1:3001'||['xhr','fetch'].includes(r.resourceType())){report.requests.push(r.url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('websocket',s=>report.requests.push(s.url()));
  const button=name=>page.getByRole('button',{name,exact:true});
  const clean=async()=>{await expect(page.getByTestId('patient-name')).toHaveCount(0);await expect(page.getByTestId('visit-panel')).toHaveCount(0);await expect(page.getByTestId('report-group')).toHaveCount(0);await expect(page.getByTestId('result-card')).toHaveCount(0);expect(await page.locator('body').innerText()).not.toMatch(/15\.2|Cubicle 12|Carmen Rivera Colón/);};
  const capture=async id=>{
   await page.evaluate(()=>window.scrollTo(0,0));
   const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('[role="button"]')].map(el=>({label:el.getAttribute('aria-label'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),clipped:[...document.querySelectorAll('[dir="auto"]')].filter(el=>{const r=el.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(el=>el.textContent)}));
   expect(metrics.scroll).toBeLessThanOrEqual(width);expect(metrics.clipped).toEqual([]);expect(metrics.buttons.every(b=>b.width>=44&&b.height>=44)).toBe(true);
   await expect(page.getByTestId('demo-notice')).toHaveCount(1);await page.screenshot({path:`${folder}/${id}-${width}.png`,fullPage:true});return metrics;
  };
  await page.goto('http://127.0.0.1:3001');await expect(page.locator('html')).toHaveAttribute('lang','en');await clean();
  await expect(page.getByRole('heading',{name:'Choose an account',exact:true})).toBeVisible();
  await expect(button('Enter example')).toHaveCount(0);await expect(button('Go to Results')).toHaveCount(0);
  await expect(page.getByTestId('account-chooser').getByRole('button')).toHaveCount(3);
  await capture('chooser-en');
  for(const language of ['en','es']) {
   if(language==='es')await button('Switch language to Spanish').click();
   const t=(key,args)=>translate(language,key,args);
   await button(t('larger')).click();await button(t('larger')).click();await capture(`chooser-${language}-150`);
   await button(t('accountLabel',{name:'Lourdes'})).focus();await page.keyboard.press('Enter');await clean();
   await expect(page.getByTestId('account-chooser')).toContainText('Lourdes');await capture(`roles-${language}-150`);
   await button(t('languageLabel')).click();const other=language==='en'?'es':'en';
   await expect(page.getByTestId('account-chooser')).toContainText('Lourdes');await clean();await button(translate(other,'languageLabel')).click();
   await button(t('smaller')).click();await button(t('smaller')).click();
   // Direct self entry: no intermediate Carmen session or clinical panel.
   await button(t('roleLabel',{role:t('myHealth')})).focus();await page.keyboard.press('Enter');
   await expect(page.getByTestId('patient-name')).toHaveText('Lourdes');await expect(page.getByTestId('visit-panel')).toContainText(t('visitEmpty'));
   await changeRole(page,'delegate',language);await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');await expect(button(t('goTo',{section:t('results')}))).toBeDisabled();
   await button(t('changeAccount')).click();await clean();await expect(button(t('accountLabel',{name:'Carmen'}))).toBeFocused();
   for(const [account,role,roleCount] of [['Carmen','self',1],['Lourdes','self',2],['Lourdes','delegate',2]]) {
    await button(t('accountLabel',{name:account})).click();await clean();
    await expect(page.getByTestId('account-chooser').getByRole('button',{name:language==='en'?/^Role:/:/^Rol:/})).toHaveCount(roleCount);
    await button(t('roleLabel',{role:t(role==='self'?'myHealth':'delegatedCarmen')})).click();
    await expect(page.getByTestId('patient-name')).toHaveText(account==='Lourdes'&&role==='self'?'Lourdes':'Carmen Rivera Colón');
    await expect(page.getByTestId('context-card')).toContainText(account);
    if(account==='Lourdes'&&role==='delegate')await expect(button(t('goTo',{section:t('results')}))).toBeDisabled();else await expect(button(t('goTo',{section:t('results')}))).toBeEnabled();
    await capture(`dashboard-${language}-${account}-${role}`);
    await button(t('close')).click();await clean();
   }
   await button(t('accountLabel',{name:'Lourdes'})).click();await button(t('backAccounts')).focus();await page.keyboard.press('Enter');await clean();
  }
  await page.reload();await enterContext(page,'Carmen','self','en');await page.goBack();await clean();await expect(button('Account: Carmen')).toBeFocused();
  await page.goForward();await clean();
  await enterContext(page,'Lourdes','delegate','en');await page.reload();await clean();await expect(page.locator('html')).toHaveAttribute('lang','en');
  const storage=await page.evaluate(async()=>[localStorage.length,sessionStorage.length,(await caches.keys()).length,(await indexedDB.databases()).length]);expect(storage).toEqual([0,0,0,0]);
  report.cases.push({width,height:844,roles:4,languages:['en','es'],scales:[1,1.5],initialNoClinical:true,directLourdesSelf:true,keyboard:true,backForwardClean:true,refreshClean:true,storage});await context.close();
 }
 expect(report.errors).toEqual([]);expect(report.requests).toEqual([]);
}finally{await writeFile(`${folder}/entry-browser.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
