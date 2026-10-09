import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
try {
 for(const height of [844,500]) {
  const page=await browser.newPage({viewport:{width:1280,height}});
  await page.goto(process.env.PORTAL_URL || 'http://127.0.0.1:3001');
  await page.getByRole('button',{name:'Aumentar letra',exact:true}).click();
  await page.getByRole('button',{name:'Aumentar letra',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Secciones del portal',exact:true});
  await page.evaluate(()=>window.scrollTo(0,900));
  const visit=nav.getByRole('button',{name:'Ir a Mi visita',exact:true});
  await expect(visit).toBeInViewport();
  const more=nav.getByRole('button',{name:'Ir a Más',exact:true});
  await more.focus();
  await expect(more).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('section-heading')).toHaveText('Servicios y ayuda');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  report.push({width:1280,height,scale:1.5,passed:true});await page.close();
 }
 console.log(JSON.stringify(report));
}finally{await browser.close();}
