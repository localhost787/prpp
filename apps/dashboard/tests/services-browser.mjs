import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {enterContext} from './entry-helpers.mjs';
import {translate} from '../src/i18n.mjs';
const baseline=process.argv.includes('--baseline');
const folder=`../../docs/evidence/AYO-98/${baseline?'before':'after'}`;
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={cases:[],errors:[],requests:[],geoCalls:0};
try{
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))report.errors.push(m.text());});
 await page.addInitScript(()=>{window.geoCalls=0;for(const key of ['getCurrentPosition','watchPosition'])navigator.geolocation[key]=()=>{window.geoCalls++;throw Error('Unexpected geolocation');};});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:3001'||['xhr','fetch'].includes(r.request().resourceType())){report.requests.push(r.request().url());return r.abort();}return r.continue();});
 for(const language of ['en','es']){
  const t=(k,p)=>translate(language,k,p),button=name=>page.getByRole('button',{name,exact:true});
  await page.goto('http://127.0.0.1:3001');
  if(language==='es')await button('Switch language to Spanish').click();
  for(const [account,role] of [['Carmen','self'],['Lourdes','delegate'],['Lourdes','self'],['Rafael','delegate']]){
   await enterContext(page,account,role,language);
   await expect(page.getByTestId('services-panel')).toHaveCount(0);
   await button(t('goTo',{section:t('more')})).click();
   if(!baseline)await button(language==='en'?'Open Services':'Abrir Servicios').click();
   for(const scale of [1,1.5]){
    if(scale===1.5){await button(t('larger')).click();await button(t('larger')).click();}
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${folder}/${width}-${language}-${account}-${role}-${scale}.png`,fullPage:true});
    if(!baseline){
     const panel=page.getByTestId('services-panel');await expect(panel).toBeVisible();
     await expect(panel.getByRole('heading')).toHaveCount(5);
     const text=await panel.innerText();
     expect(text).toMatch(language==='en'?/General fictional directory/:/Directorio general ficticio/);
     expect(text).toMatch(language==='en'?/example origin/:/origen de ejemplo/);
     expect(text.match(language==='en'?/Not documented/g:/No documentado/g)).toHaveLength(8);
     expect(text).not.toMatch(/Carmen|Lourdes|Rafael|Ceftriax|Ana Ramos/);
     expect(await page.getByRole('button',{name:language==='en'?/^Go to /:/^Ir a /}).count()).toBe(5);
     const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('[dir="auto"]')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(e=>e.textContent),targets:[...document.querySelectorAll('[role="button"]')].every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})}));
     expect(metrics).toEqual({overflow:false,clipped:[],targets:true});
    }
    report.cases.push({width,language,account,role,scale,mode:baseline?'baseline':'verified'});
    if(scale===1.5){await button(t('smaller')).click();await button(t('smaller')).click();}
   }
   if(!baseline){
    const before=await page.getByTestId('context-card').innerText();
    await button(t('languageLabel')).click();await expect(page.getByTestId('services-panel')).toContainText(language==='en'?'Directorio general ficticio':'General fictional directory');
    await page.getByRole('button',{name:translate(language==='en'?'es':'en','languageLabel'),exact:true}).click();
    await expect(page.getByTestId('context-card')).toHaveText(before,{useInnerText:true});
    await button(t('backMore')).click();await expect(page.getByTestId('services-panel')).toHaveCount(0);await button(t('openServices')).click();
    await button(t('goTo',{section:t('care')})).click();await expect(page.getByTestId('services-panel')).toHaveCount(0);await button(t('goTo',{section:t('more')})).click();await expect(page.getByTestId('services-panel')).toHaveCount(0);
    await button(t('openServices')).click();
   }
   report.geoCalls+=await page.evaluate(()=>window.geoCalls);
  }
  await button(t('close')).click();await expect(page.getByTestId('services-panel')).toHaveCount(0);
 }
 await page.close();
 }
 expect(report.errors).toEqual([]);expect(report.requests).toEqual([]);expect(report.geoCalls).toBe(0);
}finally{await writeFile(`${folder}/browser.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({cases:report.cases.length,errors:report.errors,requests:report.requests,geoCalls:report.geoCalls}));
