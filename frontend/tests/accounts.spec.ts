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

for(const width of [1440,320])test(`account list remains readable and accessible at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const longName=`Synthetic Display ${'LongName'.repeat(12)}`,longUsername=`user_${'longidentifier'.repeat(7)}`;
 const users=[
  {id:'u1',username:longUsername,display_name:longName,role:'administrator',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},
  {id:'u2',username:'disabled-user',display_name:'Historical Synthetic User',role:'officer',active:false,must_change:true,updated_at:'2026-11-18T00:00:00Z'}
 ];
 let writes=0,reads=0;
 await page.route('**/api/auth/users**',route=>{if(route.request().method()!=='GET'){writes++;return route.abort();}reads++;return route.fulfill({json:{users}});});
 await page.goto('/#/accounts');
 const list=page.locator('.accounts-list'),table=page.getByRole('region',{name:'User accounts table'}),rows=table.locator('tbody tr');
 const heading=list.getByRole('heading',{name:'Existing accounts'}),refresh=list.getByRole('button',{name:'Refresh Accounts'});
 await expect(heading).toBeVisible();await expect(refresh).toBeEnabled();await expect(rows).toHaveCount(2);
 expect(await list.evaluate(el=>{const heading=el.querySelector('h2')!.getBoundingClientRect(),button=el.querySelector(':scope > button')!.getBoundingClientRect(),table=el.querySelector('.table-scroll')!.getBoundingClientRect();return heading.bottom<=button.top&&button.bottom<table.top;})).toBe(true);
 await expect(rows.nth(0).locator('td').nth(0)).toHaveText(longName);await expect(rows.nth(0).locator('td').nth(1)).toHaveText(longUsername);
 await expect(rows.nth(1).locator('td').nth(0)).toHaveText('Historical Synthetic User');await expect(rows.nth(1).locator('td').nth(1)).toHaveText('disabled-user');
 await expect(rows.nth(0).locator('td').nth(2)).toHaveText('Administrator');await expect(rows.nth(1).locator('td').nth(2)).toHaveText('Procurement Officer');
 await expect(rows.locator('.account-status')).toHaveText(['Active','Disabled']);
 await expect(rows.nth(1).locator('td').nth(3)).toContainText('Initial');
 const badgeColors=await rows.locator('.account-status').evaluateAll(badges=>badges.map(b=>getComputedStyle(b).backgroundColor));expect(badgeColors[0]).not.toBe(badgeColors[1]);
 const previousReads=reads;await refresh.click();await expect.poll(()=>reads).toBeGreaterThan(previousReads);await expect(rows).toHaveCount(2);
 expect(await rows.locator('td').evaluateAll(cells=>cells.every(cell=>cell.scrollWidth<=cell.clientWidth&&getComputedStyle(cell).borderBottomStyle==='solid'))).toBe(true);
 await table.screenshot({path:`test-results/accounts-list-left-${width}.png`});
 await refresh.focus();await page.keyboard.press('Tab');await expect(table).toBeFocused();expect(await table.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 if(await table.evaluate(el=>el.scrollWidth>el.clientWidth)){
  await page.keyboard.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await table.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  await expect.poll(()=>table.evaluate(el=>el.scrollWidth-el.clientWidth-el.scrollLeft)).toBeLessThanOrEqual(1);
 }
 await table.screenshot({path:`test-results/accounts-list-right-${width}.png`});
 await table.focus();await page.keyboard.press('Tab');
 const edit=rows.nth(0).getByRole('button',{name:`Edit ${longUsername}`,exact:true});await expect(edit).toBeFocused();
 expect(await edit.evaluate(el=>{const region=el.closest('.table-scroll')!.getBoundingClientRect(),button=el.getBoundingClientRect();return button.left>=region.left-1&&button.right<=region.right+1&&el.scrollWidth<=el.clientWidth&&getComputedStyle(el).outlineStyle!=='none';})).toBe(true);
 await page.keyboard.press('Tab');await expect(rows.nth(1).getByRole('button',{name:'Edit disabled-user',exact:true})).toBeFocused();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await rows.nth(1).getByRole('button',{name:'Edit disabled-user',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Edit disabled-user',exact:true})).toBeVisible();
 expect(reads).toBeGreaterThan(0);expect(writes).toBe(0);
});

for(const width of [1440,320])test(`create account groups and keyboard order at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 let writes=0;
 await page.route('**/api/auth/users**',route=>{if(route.request().method()!=='GET'){writes++;return route.abort();}return route.fulfill({json:{users:[]}});});
 await page.goto('/#/accounts');
 const form=page.locator('form.account-create'),details=form.getByRole('group',{name:'Account details'}),initial=form.getByRole('group',{name:'Initial password'});
 const username=details.getByLabel('New username',{exact:true}),name=details.getByLabel('New display name',{exact:true}),role=details.getByLabel('New account role',{exact:true});
 const initialField=initial.getByLabel('Initial password',{exact:true}),confirmation=initial.getByLabel('Confirm initial password',{exact:true}),submit=form.getByRole('button',{name:'Create Account'});
 await expect(form.getByRole('heading',{name:'Create account'})).toBeVisible();
 await expect(initial.getByText('Choose an initial password of 15–128 characters. Share it privately with the user.')).toBeVisible();
 await expect(role).toHaveValue('officer');
 await expect(username).toHaveAttribute('required','');await expect(username).toHaveAttribute('minlength','3');await expect(username).toHaveAttribute('maxlength','80');await expect(username).toHaveAttribute('autocomplete','off');
 await expect(name).toHaveAttribute('required','');await expect(name).toHaveAttribute('maxlength','100');
 for(const field of [initialField,confirmation]){
  await expect(field).toHaveAttribute('type','password');await expect(field).toHaveAttribute('required','');
  await expect(field).toHaveAttribute('minlength','15');await expect(field).toHaveAttribute('maxlength','128');await expect(field).toHaveAttribute('autocomplete','new-password');
 }
 const bounds=await Promise.all([username,name,role,initialField,confirmation,submit].map(field=>field.boundingBox()));
 expect(bounds.every(box=>box!==null)).toBe(true);
 if(width===320){
  for(let i=1;i<5;i++)expect(bounds[i]!.y).toBeGreaterThanOrEqual(bounds[i-1]!.y+bounds[i-1]!.height);
 }else{
  expect(bounds[0]!.y).toBe(bounds[1]!.y);expect(bounds[3]!.y).toBe(bounds[4]!.y);
 }
 expect(bounds[5]!.y).toBeGreaterThan(bounds[4]!.y+bounds[4]!.height);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await form.screenshot({path:`test-results/account-create-${width}.png`});
 await username.focus();
 for(const field of [name,role,initialField,confirmation,submit]){await page.keyboard.press('Tab');await expect(field).toBeFocused();expect(await field.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');}
 expect(writes).toBe(0);
});

for(const width of [1440,320])test(`account edit layout and keyboard order at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const longUsername=`test_${'longusername'.repeat(6)}`;
 const users=[
  {id:'u1',username:longUsername,display_name:'Synthetic User',role:'officer',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},
  {id:'00000000-0000-4000-8000-000000000001',username:'test-admin',display_name:'Test Administrator',role:'administrator',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'}
 ];
 let writes=0;
 await page.route('**/api/auth/users**',route=>{if(route.request().method()!=='GET'){writes++;return route.abort();}return route.fulfill({json:{users}});});
 await page.goto('/#/accounts');
 await page.getByRole('button',{name:`Edit ${longUsername}`,exact:true}).click();
 const form=page.locator('form.account-edit'),heading=form.getByRole('heading',{name:`Edit ${longUsername}`,exact:true}),details=form.getByRole('group',{name:'Account details'});
 const display=details.getByLabel('Display name',{exact:true}),role=details.getByLabel('Account role',{exact:true}),active=details.getByLabel('Account active',{exact:true});
 const save=form.getByRole('button',{name:'Save Account',exact:true}),cancel=form.getByRole('button',{name:'Cancel Account Edit',exact:true});
 const resetSection=form.locator('.account-edit-reset'),resetField=resetSection.locator('input'),resetButton=resetSection.getByRole('button');
 await expect(heading).toBeVisible();await expect(form.getByText('Role, name or status changes end this account’s current sessions. At least one administrator must remain active.')).toBeVisible();
 await expect(display).toHaveValue('Synthetic User');await expect(display).toHaveAttribute('required','');await expect(display).toHaveAttribute('maxlength','100');
 await expect(role).toHaveValue('officer');await expect(active).toBeChecked();
 await expect(resetField).toHaveAttribute('type','password');await expect(resetField).toHaveAttribute('autocomplete','new-password');await expect(resetField).toHaveAttribute('minlength','15');await expect(resetField).toHaveAttribute('maxlength','128');await expect(resetButton).toBeDisabled();
 const boxes=await Promise.all([display,role,active,save,resetSection,resetField,resetButton].map(element=>element.boundingBox()));
 expect(boxes.every(box=>box!==null)).toBe(true);
 if(width===320)expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y+boxes[0]!.height);
 else expect(boxes[0]!.y).toBe(boxes[1]!.y);
 expect(boxes[3]!.y).toBeGreaterThan(boxes[2]!.y+boxes[2]!.height);expect(boxes[4]!.y).toBeGreaterThan(boxes[3]!.y+boxes[3]!.height);
 expect(boxes[6]!.y).toBeGreaterThan(boxes[5]!.y+boxes[5]!.height);
 expect(await resetSection.evaluate(el=>getComputedStyle(el).borderTopStyle)).toBe('solid');
 expect(await heading.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await form.screenshot({path:`test-results/account-edit-${width}.png`});
 await display.focus();
 for(const field of [role,active,save,cancel,resetField]){await page.keyboard.press('Tab');await expect(field).toBeFocused();expect(await field.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');}
 await cancel.click();await page.getByRole('button',{name:'Edit test-admin',exact:true}).click();await expect(page.locator('form.account-edit .account-edit-reset')).toHaveCount(0);
 expect(writes).toBe(0);
});
