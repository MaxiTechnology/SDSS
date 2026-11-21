import { test, expect } from './fixtures';
test('supplier records persist through reload, edits and removal; failed saves retain entries', async ({page}) => {
 const project={id:'p1',reference:'PRJ-TEST',name:'Test project',currency:'USD',category:'',budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 let rows:any[]=[]; let fail=true;
 await page.route('**/api/projects**',async route=>{
  const req=route.request(), url=new URL(req.url());
  if(!url.pathname.includes('/suppliers')) return route.fulfill({json:url.pathname==='/api/projects'?[project]:project});
  if(req.method()==='GET') return route.fulfill({json:rows});
  if(req.method()==='POST') {if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Save unavailable'}});} const row={...req.postDataJSON(),updated_at:'2026-11-16T11:00:00Z'}; rows.push(row);return route.fulfill({status:201,json:row});}
  const id=url.pathname.split('/').pop();
  if(req.method()==='PUT'){const row={...rows.find(r=>r.id===id),...req.postDataJSON()};rows=rows.map(r=>r.id===id?row:r);return route.fulfill({json:row});}
  rows=rows.filter(r=>r.id!==id);return route.fulfill({status:204});
 });
 await page.goto('/#/projects/p1/suppliers');
 await expect(page.getByRole('heading',{name:'Add Suppliers',level:1})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Project suppliers',level:2})).toBeVisible();
 await expect(page.getByText('No suppliers added yet')).toBeVisible();
 await expect(page.getByText('0 saved suppliers')).toBeVisible();
 await expect(page.getByText('Add at least two suppliers to continue.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'+ Add Supplier',exact:true}).first().click();
 await page.getByLabel('Supplier Name').fill('Dell');
 await page.getByRole('dialog').getByRole('button',{name:'Add Supplier',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Save unavailable');
 await expect(page.getByLabel('Supplier Name')).toHaveValue('Dell');
 await page.getByRole('dialog').getByRole('button',{name:'Add Supplier',exact:true}).click();
 await expect(page.getByText('Add at least one more supplier', {exact:false})).toBeVisible();
 await expect(page.getByText('1 saved supplier',{exact:true})).toBeVisible();
 await expect(page.getByText('Supplier added.',{exact:true})).toBeVisible();
 for(const name of ['Apex','Lenovo']){
 await page.getByRole('button',{name:'+ Add Supplier',exact:true}).click(); await page.getByLabel('Supplier Name').fill(name);await page.getByRole('dialog').getByRole('button',{name:'Add Supplier',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 if(name==='Apex'){await expect(page.getByText('2 saved suppliers',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue to Criteria',exact:false})).toBeEnabled();}}
 await expect(page.getByText('3 saved suppliers',{exact:true})).toBeVisible();
 await expect(page.getByText('Minimum of two met.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to Criteria',exact:false})).toBeEnabled();
 await page.reload(); await expect(page.getByRole('row')).toHaveCount(4);
 await page.getByRole('button',{name:'Edit Dell',exact:true}).click();await page.getByLabel('Location').fill('London');await page.getByRole('button',{name:'Save Supplier',exact:true}).click();await expect(page.getByText('London')).toBeVisible();
 await page.getByRole('button',{name:'Edit Dell',exact:true}).click();await page.getByLabel('Supplier Name').fill('Unsaved');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByText('Unsaved', {exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/suppliers.png',fullPage:true});
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Remove Apex',exact:true}).click();await expect(page.getByRole('button',{name:'Remove Apex',exact:true})).toBeVisible();
 for(const name of ['Apex','Lenovo']){page.once('dialog',d=>d.accept());await page.getByRole('button',{name:`Remove ${name}`,exact:true}).click();await expect(page.getByRole('button',{name:`Remove ${name}`,exact:true})).toHaveCount(0);}
 await expect(page.getByRole('button',{name:'Continue to Criteria',exact:false})).toBeDisabled();
 await page.reload();await expect(page.getByRole('row')).toHaveCount(2);
});

test('supplier loading and error do not show a saved count until retry succeeds',async({page})=>{
 const project={id:'p1',reference:'PRJ-TEST',name:'Test project',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let first=true;
 await page.route('**/api/projects**',async route=>{
  if(!new URL(route.request().url()).pathname.endsWith('/suppliers'))return route.fulfill({json:project});
  if(first){first=false;await gate;return route.fulfill({status:503,json:{detail:'Suppliers unavailable'}});}
  return route.fulfill({json:[]});
 });
 await page.goto('/#/projects/p1/suppliers');
 await expect(page.getByText('Loading suppliers…')).toBeVisible();
 await expect(page.getByText('0 saved suppliers')).toHaveCount(0);
 release();
 await expect(page.getByRole('alert')).toContainText('Suppliers unavailable');
 await expect(page.getByText('0 saved suppliers')).toHaveCount(0);
 await page.getByRole('button',{name:'Refresh suppliers'}).click();
 await expect(page.getByText('0 saved suppliers')).toBeVisible();
});

for(const width of [1440,320])test(`add supplier dialog supports keyboard, recovery and focus at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===320?480:900});
 const project={id:'p1',reference:'PRJ-TEST',name:'Test project',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 const attempts:{id:string;name:string;location:string;description:string}[]=[];
 let releaseSave!:()=>void;const saveGate=new Promise<void>(resolve=>{releaseSave=resolve;});
 await page.route('**/api/projects**',async route=>{
  const request=route.request();
  if(!new URL(request.url()).pathname.endsWith('/suppliers'))return route.fulfill({json:project});
  if(request.method()==='GET')return route.fulfill({json:[]});
  const entry=request.postDataJSON();attempts.push(entry);
  if(attempts.length===1){await saveGate;return route.fulfill({status:503,json:{detail:'Save unavailable'}});}
  return route.fulfill({status:201,json:{...entry,updated_at:project.updated_at}});
 });
 await page.goto('/#/projects/p1/suppliers');
 const trigger=page.getByRole('button',{name:'+ Add Supplier',exact:true});
 await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Add Supplier'}), name=dialog.getByLabel('Supplier Name'), location=dialog.getByLabel('Location'), description=dialog.getByLabel('Description'), submit=dialog.getByRole('button',{name:'Add Supplier',exact:true}), close=dialog.getByRole('button',{name:'Close supplier dialog'});
 await expect(name).toBeFocused();
 await expect(name).toHaveAttribute('required','');
 await expect(name).toHaveAccessibleDescription('Use the name that identifies this supplier in the project.');
 await expect(dialog.getByText('(Optional)')).toHaveCount(2);
 await page.keyboard.press('Tab');await expect(location).toBeFocused();
 expect(await location.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Tab');await expect(description).toBeFocused();
 await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(submit).toBeFocused();
 await submit.click();
 expect(await name.evaluate(el=>(el as HTMLInputElement).validity.valueMissing)).toBe(true);
 expect(attempts).toHaveLength(0);
 await close.focus();await page.keyboard.press('Shift+Tab');await expect(submit).toBeFocused();
 await page.keyboard.press('Tab');await expect(close).toBeFocused();
 expect(await close.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await name.fill('Supplier A');await location.fill('London');await description.fill('Description');
 await submit.click();
 await expect(dialog.getByRole('button',{name:'Saving…'})).toBeDisabled();
 await page.keyboard.press('Tab');
 expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Shift+Tab');
 expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
 releaseSave();
 await expect(dialog.getByRole('alert')).toContainText('Save unavailable');
 await expect(submit).toBeFocused();
 await expect(name).toHaveValue('Supplier A');await expect(location).toHaveValue('London');await expect(description).toHaveValue('Description');
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 page.once('dialog',d=>d.dismiss());await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(dialog).toBeVisible();await expect(name).toHaveValue('Supplier A');
 await submit.click();
 await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 expect(attempts).toHaveLength(2);expect(attempts[1].id).toBe(attempts[0].id);
 await trigger.click();page.once('dialog',d=>d.accept());await dialog.getByLabel('Supplier Name').fill('Unsaved');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 await trigger.click();await page.keyboard.press('Escape');
 await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
});

for(const width of [1440,375])test(`supplier actions remain usable with keyboard at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const project={id:'p1',reference:'PRJ-TEST',name:'Test project',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 await page.route('**/api/projects**',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/suppliers')?['Supplier A','Supplier B'].map((name,i)=>({id:`s${i}`,name,location:'',description:'',updated_at:project.updated_at})):project}));
 await page.goto('/#/projects/p1/suppliers');
 await expect(page.getByText('2 saved suppliers',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 const heading=page.locator('.project-suppliers > .card-heading'), summary=page.locator('.project-suppliers > .success'), table=page.getByRole('region',{name:'Project suppliers table'});
 const headingBox=(await heading.boundingBox())!, summaryBox=(await summary.boundingBox())!, tableBox=(await table.boundingBox())!, addBox=(await page.getByRole('button',{name:'+ Add Supplier',exact:true}).boundingBox())!;
 expect(Math.abs((headingBox.y+headingBox.height/2)-(addBox.y+addBox.height/2))).toBeLessThanOrEqual(1);
 expect(summaryBox.y-(headingBox.y+headingBox.height)).toBeLessThanOrEqual(12);
 expect(tableBox.y-(summaryBox.y+summaryBox.height)).toBeLessThanOrEqual(13);
 const editA=(await page.getByRole('button',{name:'Edit Supplier A'}).boundingBox())!, editB=(await page.getByRole('button',{name:'Edit Supplier B'}).boundingBox())!;
 expect(Math.abs(editA.x-editB.x)).toBeLessThanOrEqual(1);
 if(width===375){
  expect(editA.height).toBeGreaterThanOrEqual(44);
  expect(await table.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await table.focus();await page.keyboard.press('ArrowRight');
  await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 }
 await page.locator('.breadcrumb').focus();
 for(const name of ['+ Add Supplier','Edit Supplier A','Remove Supplier A']){
  if(name==='Edit Supplier A')await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const button=page.getByRole('button',{name,exact:true});
  await expect(button).toBeFocused();
  expect(await button.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 }
 page.once('dialog',dialog=>dialog.dismiss());
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Remove Supplier A',exact:true})).toBeVisible();
});
