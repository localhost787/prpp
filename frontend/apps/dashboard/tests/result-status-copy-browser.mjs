import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const folder='../../docs/evidence/result-status-copy';await mkdir(folder,{recursive:true});
try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:3001');
  for(const [lang,available,status,title] of [['en','Results available','Final or preliminary status not provided','Other blood results'],['es','Resultados disponibles','No se indicó si son finales o preliminares','Otros resultados de sangre']]){
   if(lang==='es')await page.getByRole('button',{name:'Switch language to Spanish',exact:true}).click();
   const report=page.getByTestId('report-c');
   await expect(report).toContainText(available);await expect(report).toContainText(status);
   await expect(report).not.toContainText(lang==='en'?'Status not available':'Estado no disponible');
   await page.getByRole('button',{name:`${lang==='en'?'View report':'Ver informe'}: ${title}`,exact:true}).click();
   await expect(report).toContainText('168 mg/dL');await expect(report).toContainText('1.1 mg/dL');
   await expect(report.getByRole('button',{name:new RegExp(lang==='en'?'Download synthetic PDF':'Descargar PDF sintético')})).toBeEnabled();
   await report.screenshot({path:`${folder}/${width}-${lang}.png`});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await page.getByRole('button',{name:`${lang==='en'?'Close report':'Cerrar informe'}: ${title}`,exact:true}).click();
  }
  await page.close();
 }
}finally{await browser.close();}
console.log('Available values and unspecified completion status remain distinct: PASS.');
