import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import { enterContext } from './entry-helpers.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const folder='../../docs/evidence/notices-usability';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results={mode:'local-synthetic-http',cases:[],errors:[]};
try{
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on('pageerror',e=>results.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
  await page.goto('http://127.0.0.1:3001');
  for(const language of ['en','es']){
   await enterContext(page,'Carmen','self',language);
   const panel=page.getByTestId('notices-panel');
   const mark=panel.getByRole('button',{name:language==='en'?'Mark all as read':'Marcar todos como leídos',exact:true});
   await expect(mark).toBeVisible();await expect(mark).toBeEnabled();
   await expect(panel).toContainText(language==='en'?'3 unread':'3 sin leer');
   await expect(panel).toContainText(language==='en'?'Your arrival was registered.':'Se registró su llegada.');
   await mark.focus();await page.keyboard.press('Enter');
   await expect(panel).toContainText(language==='en'?'All read in this view':'Todos leídos en esta vista');
   await expect(mark).toBeDisabled();
   await expect(panel).toContainText('9:05');await expect(panel).toContainText('8:12');
   await expect(panel).toContainText(language==='en'?'Local demo':'Demostración local');
   await page.getByRole('button',{name:language==='en'?'Switch language to Spanish':'Cambiar idioma a inglés',exact:true}).click();
   await expect(panel).toContainText(language==='en'?'Todos leídos en esta vista':'All read in this view');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   await panel.screenshot({path:`${folder}/read-${width}-${language==='en'?'es':'en'}.png`});
   await enterContext(page,'Lourdes','delegate',language);
   await expect(panel).toContainText(language==='en'?'3 unread':'3 sin leer');
   await page.getByRole('button',{name:language==='en'?'Demonstration options':'Opciones de demostración',exact:true}).click();
   await page.getByRole('button',{name:language==='en'?'Simulate no visit permission':'Simular sin permiso de visita',exact:true}).click();
   await expect(panel.getByRole('button')).toHaveCount(0);
   expect(await panel.innerText()).not.toMatch(/unread|sin leer|9:05|8:12|arrival|llegada/);
   results.cases.push({width,language,readAction:true,languagePreservation:true,restriction:true});
  }
  await page.close();
 }
 expect(results.errors).toEqual([]);
}finally{await browser.close();await writeFile(`${folder}/browser.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
