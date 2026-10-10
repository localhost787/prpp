import { expect } from '../../../node_modules/@playwright/test/index.mjs';
import { translate } from '../src/i18n.mjs';
export async function enterContext(page, account, role, language) {
  if (!['en','es'].includes(language) || !((account==='Carmen'&&role==='self')||(account==='Lourdes'&&role==='delegate'))) throw new Error('Unsupported demo context: explicit Carmen/self or Lourdes/delegate and language required');
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
  const current=await page.locator('html').getAttribute('lang');
  if(current!==language) await page.getByRole('button',{name:translate(current,'languageLabel'),exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await showDemoControls(page);
  await page.getByRole('button',{name:`${language==='es'?'Vista':'View'} ${account}`,exact:true}).click();
  await expect(page.getByTestId('context-card')).toContainText(translate(language,role==='self'?'selfRole':'delegateRole'));
  // Legacy journeys deliberately start on Visit; the public demo now opens on Results.
  await page.getByRole('button',{name:translate(language,'goTo',{section:translate(language,'visit')}),exact:true}).click();
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
}
export async function showDemoControls(page) {
  const language=await page.locator('html').getAttribute('lang');
  const control=page.getByRole('button',{name:language==='es'?'Controles de demostración':'Demonstration controls',exact:true});
  if(await control.getAttribute('aria-expanded')!=='true') await control.click();
}
export async function showResultFilters(page) {
  const control=page.getByRole('button',{name:/^(Buscar o filtrar|Search or filter)$/});
  if(await control.count() && await control.getAttribute('aria-expanded')!=='true') await control.click();
}
export async function expandReports(page) {
  await showResultFilters(page);
  const buttons=page.getByRole('button',{name:/^(Ver informe:|View report:)/});
  // Use visible user actions; no injected state or relaxed privacy assertions.
  while(await buttons.count()) await buttons.first().click();
}
export async function changeRole(page, role, language) {
  await enterContext(page,role==='self'?'Carmen':'Lourdes',role,language);
}
