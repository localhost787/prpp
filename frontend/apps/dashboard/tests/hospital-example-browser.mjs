import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const folder='../../docs/evidence/hospital-example';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const evidence={mode:'local-synthetic-http',cases:[],errors:[]};
try {
 for(const width of [320,390,1280]) {
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
  page.on('pageerror',e=>evidence.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')evidence.errors.push(m.text());});
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.goto('http://127.0.0.1:3001');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByTestId('section-heading')).toHaveText('Results');
  await expect(page.getByTestId('results-panel')).toContainText('Your hospital results, in your hands.');
  for(const [lang,hospital,title,download] of [['en','Demo Hospital','Complete blood count','Download synthetic PDF'],['es','Hospital de demostración','Hemograma completo','Descargar PDF sintético']]) {
   if(lang==='es')await button('Switch language to Spanish').click();
   const group=page.getByTestId('report-a');
   await expect(group).toContainText(hospital);
   await expect(group).toContainText('9:41');
   await expect(page.getByTestId('demo-notice')).toContainText(lang==='en'?'fictional data':'datos ficticios');
   await button(`${lang==='en'?'View report':'Ver informe'}: ${title}`).click();
   await expect(group.getByTestId('result-card')).toHaveCount(2);
   await expect(group).toContainText('15.2');await expect(group).toContainText('12.8 g/dL');
   if(width===1280){
    const waiting=page.waitForEvent('download');await button(`${download}: ${title}`).click();
    const file=await waiting;const path=`${folder}/hospital-${lang}.pdf`;await file.saveAs(path);
    const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
    expect(text).toContain(hospital);expect(text).toContain(title);expect(text).toContain(lang==='en'?'SYNTHETIC DEMO':'DEMOSTRACIÓN SINTÉTICA');
   }
   await button(`${lang==='en'?'Close report':'Cerrar informe'}: ${title}`).click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByTestId('report-a')).toContainText('Demo Hospital');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${folder}/hospital-en-${width}.png`,fullPage:true});
  evidence.cases.push({width,defaultEnglish:true,reloadEnglish:true,bilingualHospital:true});await page.close();
 }
 expect(evidence.errors).toEqual([]);
}finally{await browser.close();await writeFile(`${folder}/browser.json`,JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence));
