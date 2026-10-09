import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {enterContext} from './entry-helpers.mjs';
import {translate} from '../src/i18n.mjs';
const baseline=process.argv.includes('--baseline');
const folder=`../../docs/evidence/AYO-89/${baseline?'before':'after'}`;
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={cases:[],errors:[],requests:[]};
try{
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:3001'||['xhr','fetch'].includes(r.request().resourceType())){report.requests.push(r.request().url());return r.abort();}return r.continue();});
 for(const language of ['en','es']){
  const t=(k,p)=>translate(language,k,p),button=name=>page.getByRole('button',{name,exact:true});
  await page.goto('http://127.0.0.1:3001');
  if(language==='es')await button('Switch language to Spanish').click();
  for(const [account,role] of [['Carmen','self'],['Lourdes','delegate'],['Lourdes','self']]){
   await enterContext(page,account,role,language);
   await button(t('goTo',{section:t('care')})).click();
   for(const scale of [1,1.5]){
    if(scale===1.5){await button(t('larger')).click();await button(t('larger')).click();}
    await page.evaluate(()=>window.scrollTo(0,0));
    const id=`${width}-${language}-${account}-${role}-${scale}`;
    await page.screenshot({path:`${folder}/${id}.png`,fullPage:true});
    if(!baseline){
     const panel=page.getByTestId('care-panel');await expect(panel).toBeVisible();
     await expect(page.getByTestId('section-heading')).toHaveText(t('care'));
     const text=await panel.innerText();expect(text).not.toMatch(/\bNPO\b/);
     if(account==='Lourdes'&&role==='self'){
      expect(text).not.toMatch(/Ceftriax|Ana Ramos|10:15/);await expect(page.getByTestId('care-team-section')).toHaveCount(0);
     }else{expect(text).toMatch(/Ceftriax/);expect(text).toMatch(/Ana Ramos/);expect(text).toMatch(/1 g/);expect(text).toMatch(/10:15 AM/);}
     const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('[dir="auto"]')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(e=>e.textContent),targets:[...document.querySelectorAll('[role="button"]')].every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})}));
     expect(metrics).toEqual({overflow:false,clipped:[],targets:true});
    }
    report.cases.push({width,language,account,role,scale,passed:true});
    if(scale===1.5){await button(t('smaller')).click();await button(t('smaller')).click();}
   }
  }
  if(!baseline){
   await enterContext(page,'Lourdes','delegate',language);await button(t('goTo',{section:t('care')})).click();
   for(const scenario of ['denied','noParticipant','loading','error','empty','normal']){
    await button(t(`care_${scenario}`)).click();
    if(['loading','error'].includes(scenario)){await expect(page.getByTestId('care-panel')).toHaveCount(0);await expect(page.getByText(t(scenario==='loading'?'careLoading':'careError'),{exact:true})).toBeVisible();}
    else{
     const panel=page.getByTestId('care-panel');await expect(panel).toBeVisible();
     if(scenario==='denied'){await expect(page.getByTestId('care-medicines-section')).not.toContainText(/Ceftriax|Acetamin|10:15/);await expect(page.getByTestId('care-team-section')).toContainText('Ana Ramos');await expect(page.getByTestId('care-instructions-section')).toContainText(language==='en'?'Do not eat':'No coma');}
     if(scenario==='noParticipant'||scenario==='empty')await expect(page.getByTestId('care-team-section')).toHaveCount(0);
    }
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${folder}/${width}-${language}-${scenario}.png`,fullPage:true});
   }
   await button(t('care_denied')).click();
   await enterContext(page,'Lourdes','self',language);await button(t('goTo',{section:t('care')})).click();
   await expect(button(t('care_normal'))).toHaveAttribute('aria-pressed','true');
   await expect(page.getByTestId('care-panel')).not.toContainText(/Carmen|Ceftriax|Ana Ramos/);
  }
  await button(t('close')).click();await expect(page.getByTestId('care-panel')).toHaveCount(0);
 }
 await page.close();
 }
 expect(report.errors).toEqual([]);expect(report.requests).toEqual([]);
}finally{await writeFile(`${folder}/browser.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({cases:report.cases.length,errors:report.errors,requests:report.requests}));
