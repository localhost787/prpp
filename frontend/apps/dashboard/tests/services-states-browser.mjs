import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
import {build} from 'vite';import {createRequire} from 'node:module';import {writeFile,mkdir} from 'node:fs/promises';
import {SERVICES_DICTIONARIES} from '../src/services/services.mjs';
const require=createRequire(import.meta.url);
const bundle=await build({configFile:false,envDir:false,root:process.cwd(),logLevel:'warn',resolve:{alias:{'react-native':require.resolve('react-native-web').replace('/dist/cjs/index.js','/dist/index.js')}},define:{'process.env.NODE_ENV':'"production"'},build:{write:false,minify:false,lib:{entry:'tests/services-harness.jsx',name:'ServicesHarness',formats:['iife']}}});
const browser=await chromium.launch({channel:'chrome',headless:true});const evidence={errors:[],requests:[],cases:[],geoCalls:0};
const folder='../../docs/evidence/AYO-98/states';await mkdir(folder,{recursive:true});
try{
 for(const width of [320,390,1280])for(const language of ['en','es']){
 const page=await browser.newPage({viewport:{width,height:844}});
 page.on('pageerror',e=>evidence.errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))evidence.errors.push(m.text());});
 await page.route('**/*',r=>{evidence.requests.push(r.request().url());return r.abort();});
 await page.setContent('<div id="root"></div>');await page.evaluate(()=>{window.geoCalls=0;for(const k of ['getCurrentPosition','watchPosition'])navigator.geolocation[k]=()=>{window.geoCalls++;};});
 await page.addScriptTag({content:(Array.isArray(bundle)?bundle[0]:bundle).output.find(x=>x.type==='chunk').code});
 const panel=page.getByTestId('services-panel'),copy=SERVICES_DICTIONARIES[language];
 await expect(panel).toBeVisible();
 for(const state of ['loading','error','empty']){
 await page.evaluate(({state,language})=>window.setServicesProps({state,language,textScale:1.5}),{state,language});
 await expect(panel).toContainText(copy[state]);await expect(page.getByTestId('services-list')).toHaveCount(0);
 if(state==='loading')await expect(page.locator('[aria-busy="true"]')).toHaveCount(1);
 if(state==='error'){
 const retry=page.getByRole('button',{name:copy.retry,exact:true});const rect=await retry.boundingBox();expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);
 await retry.focus();await page.keyboard.press('Enter');await expect(page.getByTestId('services-list')).toBeVisible();expect(await page.evaluate(()=>window.retryCalls)).toBe(1);
 await page.evaluate(({language})=>window.setServicesProps({state:'error',language,textScale:1.5}),{language});await expect(retry).toBeVisible();
 }
 const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('[dir="auto"]')].filter(e=>{const r=e.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;}).map(e=>e.textContent)}));expect(metrics).toEqual({overflow:false,clipped:[]});
 await page.screenshot({path:`${folder}/${width}-${language}-${state}.png`,fullPage:true});evidence.cases.push({width,language,state,scale:1.5,verified:true});
 }
 await page.evaluate(({language})=>window.setServicesProps({state:'list',language,textScale:1.5,services:[]}),{language});await expect(panel).toContainText(copy.empty);
 evidence.geoCalls+=await page.evaluate(()=>window.geoCalls);await page.close();
 }
 expect(evidence.errors).toEqual([]);expect(evidence.requests).toEqual([]);expect(evidence.geoCalls).toBe(0);
}finally{await writeFile(`${folder}/browser.json`,JSON.stringify(evidence,null,2));await browser.close();}
console.log(JSON.stringify(evidence));
