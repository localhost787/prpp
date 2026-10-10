import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='../../docs/evidence/sidebar-height';await mkdir(dir,{recursive:true});
try {
 for(const width of [390,1280]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto('http://127.0.0.1:3001');
  await expect(page.getByTestId('portal-tagline')).toHaveText('Your portal, your medical record.');
  await page.getByRole('button',{name:'Switch language to Spanish',exact:true}).click();
  await expect(page.getByTestId('portal-tagline')).toHaveText('Su portal, su record médico.');
  await page.getByRole('button',{name:'Cambiar idioma a inglés',exact:true}).click();
  if(width===1280){
   for(const section of ['Results','My visit']) {
    await page.getByRole('button',{name:`Go to ${section}`,exact:true}).click();
    const shell=await page.getByTestId('dashboard-shell').boundingBox();
    const rail=await page.getByTestId('sidebar-rail').boundingBox();
    expect(Math.abs(rail.height-shell.height)).toBeLessThan(2);
    expect(rail.height).toBeGreaterThanOrEqual(850);
    const tagline=await page.getByTestId('portal-tagline').boundingBox();
    expect(tagline.y+tagline.height).toBeLessThanOrEqual(850);
    await page.screenshot({path:`${dir}/${section.replaceAll(' ','-')}.png`,fullPage:true});
   }
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.close();
 }
}finally{await browser.close();}
console.log('Full-height sidebar and exact footer copy: PASS (390/1280).');
