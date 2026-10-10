import { enterContext, changeRole, expandReports, showDemoControls } from './entry-helpers.mjs';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { listReports, reportCopy } from '../src/reports/index.mjs';
import { translate } from '../src/i18n.mjs';
const folder = '../../docs/evidence/reports-ui';
await mkdir(folder, {recursive:true});
const manifest=JSON.parse(await readFile(new URL('../src/reports/manifest.json',import.meta.url)));
const browser=await chromium.launch({channel:'chrome',headless:true});
const evidence={mode:'synthetic-local-web',cases:[],downloads:[]};
try {
 for(const width of [320,390,1280]) {
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
  page.setDefaultTimeout(6000);
  const errors=[],pdfRequests=[],downloads=[],assetRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  page.on('request',r=>{if(/\.pdf(?:\?|$)/.test(r.url()))pdfRequests.push(r.url());});
  page.on('request',r=>{if(r.url().includes('/pdf-assets-'))assetRequests.push(r.url());});
  page.on('download',d=>downloads.push(d));
  await page.goto('http://127.0.0.1:3001');
  const button=name=>page.getByRole('button',{name,exact:true});
  await enterContext(page, 'Carmen', 'self', 'en');await button('Open Results').click();
  await expect(page.getByTestId('report-group')).toHaveCount(3);
  expect(downloads.length).toBe(0);expect(assetRequests).toEqual([]);
  for(const lang of ['en','es']) {
   const t=(key,args)=>translate(lang,key,args);
   if(lang==='es')await button('Switch language to Spanish').click();
   const expected=listReports({status:'ready',generation:1,session:{patient:{id:'carmen'},permissions:{estudios:true}}},lang).reports;
   for(const report of expected) {
    const group=page.getByTestId(`report-${report.id}`);
    await expect(group.getByText(report.institution,{exact:true})).toBeVisible();
    const open=group.getByRole('button',{name:/^(Ver informe:|View report:)/});
    if(await open.count()) await open.click();
    await expect(group.getByTestId('result-card')).toHaveCount(report.items.length);
    if(width===1280) {
     const waiting=page.waitForEvent('download');
     await group.getByRole('button',{name:`${reportCopy[lang].download}: ${report.title}`,exact:true}).click();
     const download=await waiting;
     expect(download.suggestedFilename()).toBe('synthetic-report.pdf');expect(download.url()).toMatch(/^blob:/);
     const path=`${folder}/${report.id}-${lang}.pdf`;await download.saveAs(path);
     const bytes=await readFile(path);const hash=createHash('sha256').update(bytes).digest('hex');
     expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
     expect({bytes:bytes.length,sha256:hash}).toEqual(manifest.reports[`${report.id}-${lang}`]);
     const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
     const norm=x=>String(x).replace(/\s+/g,' ').trim();
     for(const expectedText of [report.title,report.institution,report.warning,...report.items.flatMap(i=>[i.title,i.value,i.unit,i.range,i.note,i.statusLabel,i.interpretation])])
      if(expectedText!==null&&expectedText!=='')expect(norm(text)).toContain(norm(expectedText));
     await writeFile(`${folder}/${report.id}-${lang}.txt`,text);
     evidence.downloads.push({id:report.id,lang,bytes:bytes.length,sha256:hash,textVerified:true});
    }
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${folder}/${lang}-${width}.png`,fullPage:true});
   await button(t('larger')).click();await button(t('larger')).click();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await button(t('smaller')).click();await button(t('smaller')).click();
  }
  // Dispatch both actions in one JS task: PDF async continuation must not survive context change.
  const before=downloads.length;
  await expandReports(page);
  await page.evaluate(()=>{
   const get=label=>document.querySelector(`[aria-label="${label}"]`);
   get('Descargar PDF sintético: Hemograma completo').click();
   get('Vista Lourdes').click();
  });
  await expect(page.getByTestId('context-card')).toContainText(translate('es','delegateRole'));
  await enterContext(page, 'Lourdes', 'delegate', 'es');
  await expect(button('Ir a Resultados')).toBeDisabled();
  await expect(page.getByTestId('report-group')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/Laboratorio de demostración|Hemograma completo|Otros resultados de sangre|Descargar PDF/);
  await expect(page.getByTestId('report-group')).toHaveCount(0);
  expect(downloads.length).toBe(before);
  await enterContext(page, 'Carmen', 'self', 'es');await button('Abrir Resultados').click();
  await expect(page.getByTestId('report-group')).toHaveCount(3);
  await expandReports(page);
  await page.evaluate(()=>{
   document.querySelector('[aria-label="Descargar PDF sintético: Hemograma completo"]').click();
   document.querySelector('[aria-label="Cambiar idioma a inglés"]').click();
  });
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByTestId('report-group')).toHaveCount(3);
  expect(downloads.length).toBe(before);
  await expandReports(page);
  await page.evaluate(()=>{
   document.querySelector('[aria-label="Download synthetic PDF: Complete blood count"]').click();
   document.querySelector('[aria-label="Go to My visit"]').click();
  });
  await expect(page.getByTestId('report-group')).toHaveCount(0);
  expect(downloads.length).toBe(before);
  await button('Go to Results').click();
  await expect(page.getByTestId('report-group')).toHaveCount(3);
  await expandReports(page);
  await page.evaluate(()=>{
   document.querySelector('[aria-label="Download synthetic PDF: Complete blood count"]').click();
   document.querySelector('[aria-label="View Lourdes"]').click();
  });
  await expect(button('Go to Results')).toBeDisabled();
  await expect(page.getByTestId('report-group')).toHaveCount(0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(downloads.length).toBe(before);
  expect(pdfRequests).toEqual([]);expect(errors).toEqual([]);
  expect(await page.locator('a[download]').count()).toBe(0);
  evidence.cases.push({width,passed:true,errors,pdfRequests,staleContext:true,staleLanguage:true,staleNavigation:true,staleViewSwitch:true,noAssetPreload:true});
  await page.close();
 }
} finally {await writeFile(`${folder}/browser.json`,JSON.stringify(evidence,null,2));await browser.close();}
console.log(JSON.stringify(evidence));
