import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('account selectors hide decorative checks while keeping selected state',()=>{
 const code=readFileSync(new URL('../App.jsx',import.meta.url),'utf8');
 const row=code.split('\n').find(line=>line.includes('accounts.map(account => <Action'));
 assert.match(row,/showMarker=\{false\}/);
 assert.match(row,/selected=\{state.account === account\}/);
});
