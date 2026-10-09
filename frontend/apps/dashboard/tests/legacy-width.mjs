import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto('http://127.0.0.1:3001');
  await page.locator('.mock-start').waitFor();
  const width = await page.locator('.mock-start').evaluate(el => el.getBoundingClientRect().width);
  console.log({viewport:1280, appWidth:width, app:'Vite respaldo'});
  assert.equal(width,1280, 'El respaldo no debe tener marco de teléfono');
  await page.screenshot({path:'../../docs/evidence/dashboard-expo/vite-respaldo-1280.png',fullPage:true});
} finally { await browser.close(); }
