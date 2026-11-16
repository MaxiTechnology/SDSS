import { test, expect } from '@playwright/test';
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
 await expect(page.getByText('No suppliers added yet')).toBeVisible();
 await page.getByRole('button',{name:'+ Add Supplier',exact:true}).first().click();
 await page.getByLabel('Supplier Name').fill('Dell');
 await page.getByRole('dialog').getByRole('button',{name:'Add Supplier',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Save unavailable');
 await expect(page.getByLabel('Supplier Name')).toHaveValue('Dell');
 await page.getByRole('dialog').getByRole('button',{name:'Add Supplier',exact:true}).click();
 await expect(page.getByText('Add at least one more supplier', {exact:false})).toBeVisible();
 for(const name of ['Apex','Lenovo']){
 await page.getByRole('button',{name:'+ Add Supplier',exact:true}).click(); await page.getByLabel('Supplier Name').fill(name);await page.getByRole('dialog').getByRole('button',{name:'Add Supplier',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();}
 await page.reload(); await expect(page.getByRole('row')).toHaveCount(4);
 await page.getByRole('button',{name:'Edit Dell',exact:true}).click();await page.getByLabel('Location').fill('London');await page.getByRole('button',{name:'Save Supplier',exact:true}).click();await expect(page.getByText('London')).toBeVisible();
 await page.getByRole('button',{name:'Edit Dell',exact:true}).click();await page.getByLabel('Supplier Name').fill('Unsaved');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByText('Unsaved', {exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/suppliers.png',fullPage:true});
 for(const name of ['Apex','Lenovo']){page.once('dialog',d=>d.accept());await page.getByRole('button',{name:`Remove ${name}`,exact:true}).click();await expect(page.getByRole('button',{name:`Remove ${name}`,exact:true})).toHaveCount(0);}
 await expect(page.getByRole('button',{name:'Continue to Criteria',exact:false})).toBeDisabled();
 await page.reload();await expect(page.getByRole('row')).toHaveCount(2);
});
