import { expect } from '../../../node_modules/@playwright/test/index.mjs';
import { translate } from '../src/i18n.mjs';
export async function enterContext(page, account, role, language) {
  if (!['en','es'].includes(language) || !((account==='Carmen'&&role==='self')||(account==='Lourdes'&&role==='delegate'))) throw new Error('Unsupported demo context: explicit Carmen/self or Lourdes/delegate and language required');
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
  const current=await page.locator('html').getAttribute('lang');
  if(current!==language) await page.getByRole('button',{name:translate(current,'languageLabel'),exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await page.getByRole('button',{name:`${language==='es'?'Vista':'View'} ${account}`,exact:true}).click();
  await expect(page.getByTestId('context-card')).toContainText(translate(language,role==='self'?'selfRole':'delegateRole'));
  await expect(page.getByTestId('patient-name')).toHaveText('Carmen Rivera Colón');
}
export async function changeRole(page, role, language) {
  await enterContext(page,role==='self'?'Carmen':'Lourdes',role,language);
}
