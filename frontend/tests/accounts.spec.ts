import {test,expect} from './fixtures';
test('administrator creates a role-specific account, retries safely and resets its initial password',async({page})=>{
 let rows:any[]=[],fail=true,ids:string[]=[];
 await page.route('**/api/auth/users**',async r=>{
  const method=r.request().method();
  if(method==='GET')return r.fulfill({json:{users:rows}});
  const body=r.request().postDataJSON();
  if(r.request().url().endsWith('/reset-password')){rows[0]={...rows[0],must_change:true};return r.fulfill({json:rows[0]});}
  ids.push(body.id);if(fail){fail=false;return r.fulfill({status:503,json:{detail:'Temporary account storage outage'}});}
  rows=[{...body,active:true,must_change:true,updated_at:'2026-11-19T00:00:00Z'}];return r.fulfill({status:201,json:rows[0]});
 });
 await page.setViewportSize({width:375,height:850});await page.goto('/#/accounts');await expect(page.getByRole('button',{name:'Create Project',exact:true})).toHaveCount(0);await page.getByLabel('New username',{exact:true}).fill('test-approver');await page.getByLabel('New display name',{exact:true}).fill('Test Approver');await page.getByLabel('New account role',{exact:true}).selectOption('approver');await page.getByLabel('Initial password',{exact:true}).fill('Synthetic initial password');await page.getByLabel('Confirm initial password',{exact:true}).fill('Synthetic initial password');await page.getByRole('button',{name:'Create Account',exact:true}).click();await expect(page.getByRole('alert')).toContainText('outage');await expect(page.getByLabel('New username',{exact:true})).toHaveValue('test-approver');await page.getByRole('button',{name:'Create Account',exact:true}).click();await expect(page.getByRole('cell',{name:'test-approver',exact:true})).toBeVisible();expect(rows[0].role).toBe('approver');expect(ids[0]).toBe(ids[1]);await expect(page.getByLabel('Initial password',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Edit test-approver',exact:true}).click();await page.getByLabel('Account role',{exact:true}).selectOption('officer');await page.getByLabel('New initial password',{exact:true}).fill('Replacement initial password');await page.getByRole('button',{name:'Reset Initial Password',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'must replace it'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'test-results/accounts-phone.png',fullPage:true});
});
