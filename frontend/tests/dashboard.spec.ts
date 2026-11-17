import {test,expect} from '@playwright/test';
test('dashboard real totals, status filtering, search, pagination and workflow navigation',async({page})=>{
 const statuses=['Approved','Deferred','Needs review','Draft','In progress','Ready to evaluate','Evaluated'];
 const items=Array.from({length:14},(_,i)=>({id:'p'+i,name:'Project '+i,reference:'P'+i,category:i===0?'Hardware':'Other',currency:'USD',status:'Draft',workflow_status:statuses[i%7],workflow_stage:i===0?'Decision':'Criteria',supplier_count:3,updated_at:'2026-11-18T00:00:00Z',last_activity_at:'2026-11-18T00:00:00Z',resume_path:'/projects/p'+i+'/decision',decision_id:i===0?'d1':null}));
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/rankings'))return route.fulfill({json:{id:'r1',stale:false,snapshot:{result:{rows:[{id:'s1',name:'Supplier A',rank:1,score:'0.8'},{id:'s2',name:'Supplier B',rank:2,score:'0.2'}]}}}});
 if(url.endsWith('/decisions'))return route.fulfill({json:{decisions:[]}});
 if(/\/api\/projects$/.test(url))return route.fulfill({json:items});
 return route.fulfill({json:items[0]});
 });
 await page.goto('/#/dashboard');await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'All projects 14',exact:true})).toBeVisible();await expect(page.getByText('Supplier entries',{exact:true}).locator('..')).toContainText('42');
 await page.getByRole('button',{name:'Approved 2',exact:true}).click();await expect(page.getByLabel('Filter projects by status')).toHaveValue('Approved');await expect(page.locator('tbody tr')).toHaveCount(2);
 await page.getByRole('button',{name:'Clear filters'}).click();await expect(page.locator('tbody tr')).toHaveCount(6);await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('2 / 3',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();await page.getByLabel('Search projects',{exact:true}).fill('Hardware');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('Approved');
 await page.getByLabel('Search projects',{exact:true}).fill('no matching record');await expect(page.getByText('No matching projects',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
 await page.getByRole('button',{name:'Continue Workflow',exact:true}).first().click();await expect(page).toHaveURL(/projects\/p0\/decision/);
});


test('dashboard unavailable state does not invent zero totals and retry recovers',async({page})=>{
 let fail=true;
 await page.route('**/api/projects',route=>fail?route.fulfill({status:503,json:{detail:'Saved project storage unavailable'}}):route.fulfill({json:[]}));
 await page.goto('/#/dashboard');await expect(page.getByRole('alert')).toContainText('storage unavailable');
 await expect(page.getByRole('button',{name:'All projects 0',exact:true})).toHaveCount(0);
 fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('button',{name:'All projects 0',exact:true})).toBeVisible();
 await expect(page.getByText('No saved projects yet.',{exact:false})).toBeVisible();
});
