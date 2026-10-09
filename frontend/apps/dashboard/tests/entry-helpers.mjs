import { expect } from '../../../node_modules/@playwright/test/index.mjs';
import { translate } from '../src/i18n.mjs';
export async function enterContext(page, account, role, language) {
  if (!account || !role || !language) throw new Error('Explicit account, role and language required');
  const t=(key,args)=>translate(language,key,args);
  const button=name=>page.getByRole('button',{name,exact:true});
  if(await button(t('changeAccount')).isVisible()) await button(t('changeAccount')).click();
  if(await button(t('backAccounts')).isVisible()) await button(t('backAccounts')).click();
  await button(t('accountLabel',{name:account})).click();
  await expect(page.getByTestId('patient-name')).toHaveCount(0);
  await button(t('roleLabel',{role:t(role==='self'?'myHealth':'delegatedCarmen')})).click();
  await expect(page.getByTestId('patient-name')).toHaveText(account==='Lourdes'&&role==='self'?'Lourdes':'Carmen Rivera Colón');
}
export async function changeRole(page, role, language) {
  const t=(key,args)=>translate(language,key,args);
  await page.getByRole('button',{name:t('changeContext'),exact:true}).click();
  await expect(page.getByTestId('patient-name')).toHaveCount(0);
  await page.getByRole('button',{name:t('roleLabel',{role:t(role==='self'?'myHealth':'delegatedCarmen')}),exact:true}).click();
}
