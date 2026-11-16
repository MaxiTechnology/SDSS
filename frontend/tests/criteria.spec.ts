import {test,expect} from '@playwright/test';
test('criteria configure, validate, recover failed saves and reopen saved revision',async({page})=>{
 const project={id:'p1',reference:'PRJ-T',name:'Test',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 let saved:any={revision:0,currency:'USD',configuration:{criteria:[{id:'price',name:'Price',unit:'USD',direction:'cost',selected:true,minimum:'0',maximum:null},{id:'quality',name:'Quality',unit:'points',direction:'benefit',selected:true,minimum:'0',maximum:'100'}],mandatory_checks:[],maximum_price:null}};let failed=false;
 await page.route('**/api/projects**',async route=>{
 if(!route.request().url().endsWith('/criteria'))return route.fulfill({json:project});
 if(route.request().method()==='GET')return route.fulfill({json:saved});
 if(!failed){failed=true;return route.fulfill({status:503,json:{detail:'Storage unavailable'}});}
 const {expected_revision,...configuration}=route.request().postDataJSON();expect(expected_revision).toBe(saved.revision);saved={...saved,revision:saved.revision+1,configuration};return route.fulfill({json:saved});
 });
 await page.goto('/#/projects/p1/criteria');await expect(page.getByRole('heading',{name:'Evaluation Criteria',exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Configure Quality',exact:true}).click();await page.getByLabel('Preference').selectOption('cost');await page.getByLabel('Minimum (optional)').fill('101');await page.getByRole('button',{name:'Save Criteria',exact:true}).click();await expect(page.getByRole('alert')).toContainText('minimum below');await page.getByLabel('Minimum (optional)').fill('0');
 await page.getByRole('button',{name:'+ Add Custom Criterion',exact:true}).click();await page.getByLabel('Criterion Name').fill('Battery life');await page.getByLabel('Measurement Unit').fill('hours');await page.getByLabel('Maximum (optional)').fill('24');
 await page.getByLabel('Enforce a maximum').check();await page.getByLabel('Maximum Total Price').fill('140000');await page.getByRole('button',{name:'+ Add Mandatory Check',exact:true}).click();await page.getByLabel('Check Name',{exact:true}).fill('Security');await page.getByLabel('Pass Requirement').fill('Valid certificate');
 await page.getByRole('button',{name:'Save Criteria',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Storage unavailable');await expect(page.getByLabel('Criterion Name')).toHaveValue('Battery life');await page.getByRole('button',{name:'Save Criteria',exact:true}).click();await expect(page.getByRole('status')).toContainText('saved');
 await page.reload();await page.getByRole('button',{name:'Configure Battery life',exact:true}).click();await expect(page.getByLabel('Measurement Unit')).toHaveValue('hours');await expect(page.getByLabel('Check Name',{exact:true})).toHaveValue('Security');await expect(page.getByLabel('Maximum Total Price')).toHaveValue('140000');await page.getByRole('button',{name:'Configure Quality',exact:true}).click();await expect(page.getByLabel('Preference')).toHaveValue('cost');
 await page.screenshot({path:'test-results/criteria.png',fullPage:true});
 await page.getByRole('checkbox',{name:'Use Price',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Use Quality',exact:true}).uncheck();await expect(page.getByRole('button',{name:'Save Criteria',exact:true})).toBeDisabled();
});

