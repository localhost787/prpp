import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';
import {build} from 'vite';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {buttonVariants,palette} from '../src/ui.mjs';
const require=createRequire(import.meta.url);
const folder='../../docs/evidence/AYO-111/after';await mkdir(folder,{recursive:true});
const bundle=await build({configFile:false,envDir:false,root:process.cwd(),logLevel:'warn',resolve:{alias:{'react-native':require.resolve('react-native-web').replace('/dist/cjs/index.js','/dist/index.js')}},define:{'process.env.NODE_ENV':'"production"'},build:{write:false,minify:false,lib:{entry:'tests/action-gallery.jsx',name:'ActionGallery',formats:['iife']}}});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={states:[],errors:[],brand:{}};
const luminance=color=>{
 const rgb=color.startsWith('#')?color.slice(1).match(/../g).map(c=>parseInt(c,16)):color.match(/[\d.]+/g).slice(0,3).map(Number);
 const [r,g,b]=rgb.map(n=>{const c=n/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
try{
 const page=await browser.newPage({viewport:{width:1280,height:844}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.setContent('<html><body style="margin:0"><div id="root"></div></body></html>');
 await page.addScriptTag({content:(Array.isArray(bundle)?bundle[0]:bundle).output.find(x=>x.type==='chunk').code});
 const read=async control=>control.evaluate(el=>{const s=getComputedStyle(el),label=getComputedStyle(el.querySelector('[dir="auto"]')),r=el.getBoundingClientRect();return{background:s.backgroundColor,color:label.color,border:s.borderColor,outline:s.outlineWidth,offset:s.outlineOffset,width:r.width,height:r.height};});
 for(const variant of buttonVariants){
  for(const selected of [false,true]){
   const name=variant+(selected?' selected':'');const control=page.getByRole('button',{name,exact:true});
   await page.mouse.move(1250,800);await control.evaluate(el=>el.blur());
   const normal=await read(control);
   await control.hover();const hover=await read(control);
   expect(hover.background).not.toBe(normal.background);
   await page.mouse.down();await page.waitForTimeout(150);const pressed=await read(control);await page.mouse.up();
   expect(pressed.background).not.toBe(hover.background);
   await page.mouse.move(1250,800);await page.keyboard.press('Tab');await control.focus();
   const focus=await read(control);expect(focus.outline).toBe('3px');expect(focus.offset).toBe('3px');
   expect(focus.width).toBe(normal.width);expect(focus.height).toBe(normal.height);
   expect(normal.width).toBeGreaterThanOrEqual(44);expect(normal.height).toBeGreaterThanOrEqual(44);
   if(selected){await expect(control).toHaveAttribute('aria-pressed','true');await expect(control.getByTestId('selected-marker')).toHaveCount(1);}
   for(const [state,data]of Object.entries({normal,hover,pressed,focus})){
    const bg=data.background==='rgba(0, 0, 0, 0)'?'#FFFFFF':data.background;
    const ratio=contrast(data.color,bg);expect(ratio,`${name} ${state} text contrast`).toBeGreaterThanOrEqual(4.5);
    report.states.push({variant,selected,state,...data,textContrast:ratio});
   }
   await page.screenshot({path:`${folder}/controls-${variant}-${selected?'selected':'focus'}.png`});
  }
  const disabled=page.getByRole('button',{name:variant+' disabled',exact:true});await expect(disabled).toBeDisabled();
  const normal=await read(disabled);await disabled.hover({force:true});await page.mouse.down();await page.waitForTimeout(150);const pressed=await read(disabled);await page.mouse.up();
  expect(pressed).toEqual(normal);const ratio=contrast(normal.color,normal.background);expect(ratio).toBeGreaterThanOrEqual(4.5);
  report.states.push({variant,state:'disabled',...normal,textContrast:ratio});
 }
 await expect(page.getByTestId('press-count')).toHaveText('8');
 for(const [name,c]of Object.entries({blue:palette.blue,brandRed:palette.brandRed,textRed:palette.red}))report.brand[name]={color:c,onWhite:contrast(c,'#FFFFFF')};
 expect(report.errors).toEqual([]);
}finally{await writeFile(`${folder}/controls.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
