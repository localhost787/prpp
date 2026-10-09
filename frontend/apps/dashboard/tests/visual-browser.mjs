import { enterContext, changeRole } from './entry-helpers.mjs';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { translate } from '../src/i18n.mjs';
const folder = '../../docs/evidence/AYO-111/after';
await mkdir(folder, {recursive:true});
const browser = await chromium.launch({channel:'chrome', headless:true});
const report = {browser:browser.version(), mode:'synthetic-local', cases:[], denied:[], states:[], errors:[], requests:[]};
try {
 for (const width of [1280,390,320]) {
  const page = await browser.newPage({viewport:{width,height:844}});
  page.setDefaultTimeout(7000);
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') report.errors.push(m.text());});
  page.on('request',r=>{if(['fetch','xhr'].includes(r.resourceType())||!r.url().startsWith('http://127.0.0.1:3001/'))report.requests.push(r.url());});
  const button=name=>page.getByRole('button',{name,exact:true});
  const capture=async (id,details,screenshot=true)=>{
   await page.evaluate(()=>window.scrollTo(0,0));
   const metrics=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    const buttons=[...document.querySelectorAll('[role="button"],input')].map(el=>({label:el.getAttribute('aria-label'),...rect(el),pressed:el.getAttribute('aria-pressed'),disabled:el.getAttribute('aria-disabled')}));
    const clipped=[...document.querySelectorAll('[dir="auto"]')].filter(el=>{const r=el.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(el=>el.textContent);
    const luminance=color=>{const [r,g,b]=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const background=el=>{for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return 'rgb(255, 255, 255)';};
    const pairs=new Map();
    for(const el of document.querySelectorAll('[dir="auto"],input')){const fg=getComputedStyle(el).color,bg=background(el);pairs.set(fg+bg,{fg,bg,ratio:ratio(fg,bg)});}
    const borders=[...document.querySelectorAll('[role="button"]:not([aria-disabled="true"]),input')].map(el=>{const c=getComputedStyle(el).borderColor;return{color:c,background:background(el.parentElement),ratio:c==='rgba(0, 0, 0, 0)'?null:ratio(c,background(el.parentElement))};}).filter(b=>b.ratio!==null);
    return{scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,buttons,clipped,contrasts:[...pairs.values()],borders,notice:rect(document.querySelector('[data-testid="demo-notice"]')),heading:document.querySelector('[data-testid="section-heading"]')?rect(document.querySelector('[data-testid="section-heading"]')):null};
   });
   expect(metrics.scrollWidth,id).toBeLessThanOrEqual(width);expect(metrics.clipped,id).toEqual([]);
   expect(metrics.contrasts.every(c=>c.ratio>=4.5),id+' normal text contrast AA').toBe(true);
   expect(metrics.borders.every(c=>c.ratio>=3),id+' enabled control border contrast AA').toBe(true);
   expect(metrics.buttons.every(b=>b.width>=44&&b.height>=44),id+' 44px targets').toBe(true);
   expect(metrics.notice.y,id+' persistent global notice').toBe(0);
   expect(metrics.notice.height,id+' notice leaves room for content').toBeLessThan(300);
   if(screenshot) await page.screenshot({path:`${folder}/${id}.png`,fullPage:true});
   report.cases.push({id,width,...details,...metrics,screenshot:screenshot?`${id}.png`:null});
  };
  for(const language of ['en','es']){
   const t=(key,params)=>translate(language,key,params);
   await page.goto('http://127.0.0.1:3001');
   if(language==='es') await button('Switch language to Spanish').click();
   const enter=button(t('accountLabel',{name:'Carmen'})),box=await enter.boundingBox();
   if(width===1280) expect(box.width,'desktop CTA content width').toBeLessThan(720);
   if(width===390) expect(box.y,'entry first viewport').toBeLessThan(650);
   await expect(page.getByTestId('demo-notice')).toContainText(t('demoNotice'));
   await capture(`${width}-${language}-landing`,{language,section:'landing',scale:1,entry:box});
   for(const [account,role]of [['Carmen','self'],['Rafael','delegate'],['Lourdes','delegate'],['Lourdes','self']]){
    await enterContext(page, account, role, language);
    await expect(page.getByTestId('patient-name')).toHaveText(account==='Lourdes'&&role==='self'?'Lourdes':'Carmen Rivera Colón');
    await expect(page.getByTestId('context-card')).toContainText(account);
    for(const scale of [1,1.5]){
     if(scale===1.5){await button(t('larger')).click();await button(t('larger')).click();await expect(button(t('larger'))).toBeDisabled();}
     for(const section of ['visit','results','care','family','more']){
      const nav=button(t('goTo',{section:t(section)}));
      if(account==='Lourdes'&&role==='delegate'&&section==='results'){
       await expect(nav).toBeDisabled();await expect(page.getByTestId('result-card')).toHaveCount(0);
       expect(await page.locator('body').innerText()).not.toMatch(/15\.2|White blood cells|Glóbulos blancos/);
       report.denied.push({width,language,account,role,scale,section,passed:true});continue;
      }
      await nav.click();await expect(nav).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('section-heading')).toHaveText(t(section));
      if(section==='results'){
       await expect(page.getByTestId('result-card')).toHaveCount(account==='Lourdes'?0:6);
       if(account==='Carmen'&&scale===1){
        const search=page.getByRole('textbox',{name:t('searchResult')});await search.focus();
        const focus=await search.evaluate(el=>({outline:getComputedStyle(el).outlineWidth,offset:getComputedStyle(el).outlineOffset}));
        expect(focus).toEqual({outline:'3px',offset:'3px'});
       }
      }
      if(section==='visit'&&width===1280&&scale===1) expect((await page.getByTestId('context-card').boundingBox()).height,'context does not stretch into an empty tower').toBeLessThan(600);
      await capture(`${width}-${language}-${account}-${role}-${section}-${scale}`,{language,account,role,section,scale},scale===1||account==='Carmen');
     }
     if(scale===1.5){await button(t('smaller')).click();await button(t('smaller')).click();}
    }
   }
   await enterContext(page, 'Carmen', 'self', language);await button(t('goTo',{section:t('visit')})).click();
   for(const [scenario,key]of [['loading','visitLoading'],['error','visitError'],['empty','visitEmpty'],['denied','visitRestricted']]){
    await button(t('visitScenario_'+scenario)).click();await expect(page.getByText(t(key),{exact:true})).toBeVisible();
    await expect(page.getByTestId('visit-phase')).toHaveCount(0);
    await capture(`${width}-${language}-visit-${scenario}`,{language,account:'Carmen',role:'self',section:'visit',scenario,scale:1});
    report.states.push({width,language,scenario,passed:true});
   }
   await button(t('close')).click();await expect(button(t('accountLabel',{name:'Carmen'}))).toBeFocused();
   await expect(page.getByTestId('patient-name')).toHaveCount(0);
  }
  await page.close();
 }
 expect(report.errors).toEqual([]);expect(report.requests).toEqual([]);
} finally {await writeFile(`${folder}/visual.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({cases:report.cases.length,denied:report.denied.length,states:report.states.length,errors:report.errors,requests:report.requests}));
