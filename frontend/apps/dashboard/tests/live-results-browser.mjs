import {build} from 'vite';
import {createRequire} from 'node:module';
import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
const require=createRequire(import.meta.url);
const bundle=await build({configFile:false,envDir:false,root:process.cwd(),logLevel:'warn',resolve:{alias:{'react-native':require.resolve('react-native-web').replace('/dist/cjs/index.js','/dist/index.js')}},define:{'process.env.NODE_ENV':'"production"'},build:{write:false,lib:{entry:'tests/live-results-harness.jsx',name:'ResultsHarness',formats:['iife']}}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort();});
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:(Array.isArray(bundle)?bundle[0]:bundle).output.find(x=>x.type==='chunk').code});
 await expect.poll(()=>page.evaluate(()=>typeof window.enterResults)).toBe('function');
 await page.evaluate(()=>window.enterResults());
 await expect(page.getByTestId('result-card')).toHaveCount(1);await expect(page.getByTestId('results-panel')).toContainText('Sin interpretación');await expect(page.getByTestId('results-panel')).toContainText('Preliminar');
 await expect(page.getByRole('button',{name:/Descargar/})).toHaveCount(0);await expect(page.getByTestId('report-group')).toHaveCount(0);
 await page.evaluate(()=>{window.reads=[];window.enterResults('lourdes',false);});
 await expect(page.getByTestId('result-card')).toHaveCount(0);await expect(page.locator('body')).not.toContainText('Resultado de prueba aislada');expect(await page.evaluate(()=>window.reads)).toEqual([]);
 await page.evaluate(()=>window.enterResults('lourdes',null));await expect(page.locator('body')).toContainText('No se ha confirmado');expect(await page.evaluate(()=>window.reads)).toEqual([]);
 await page.evaluate(()=>{window.empty=true;window.enterResults();});await expect(page.locator('body')).toContainText('La consulta no devolvió resultados');
 await page.evaluate(()=>{window.empty=false;window.fail=true;window.enterResults();});await expect(page.getByRole('button',{name:'Reintentar resultados',exact:true})).toBeVisible();
 await expect(page.locator('body')).toContainText('No pudimos cargar los resultados de la fuente conectada.');
 await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'Reintentar resultados',exact:true}).click();await expect(page.getByTestId('result-card')).toHaveCount(1);
 await page.evaluate(()=>{window.pause=true;window.enterResults();});await expect.poll(()=>page.evaluate(()=>typeof window.releaseResults)).toBe('function');
 await page.evaluate(()=>{window.enterResults('lourdes',false);window.pause=false;window.releaseResults();});await expect(page.getByTestId('result-card')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(errors).toEqual([]);expect(requests).toEqual([]);console.log(width+' PASS isolated results/source/denied/unknown/empty/error/retry/late-response/no-PDF');await page.close();
}}finally{await browser.close();}
