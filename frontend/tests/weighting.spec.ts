import {test,expect} from '@playwright/test';
test('manual weighting draft, exact total, failed save, approval and reopening',async({page})=>{
 const project={id:'p1',reference:'PRJ-T',name:'Test',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 let saved:any={criteria:[{id:'price',name:'Price',unit:'USD'},{id:'quality',name:'Quality',unit:'points'},{id:'delivery',name:'Delivery',unit:'days'}],criteria_revision:1,weights:{price:'0',quality:'0',delivery:'0'},revision:0,approved:false,needs_review:false};let fail=true;
 await page.route('**/api/projects**',async route=>{
 if(!route.request().url().endsWith('/weights/manual'))return route.fulfill({json:project});
 if(route.request().method()==='GET')return route.fulfill({json:saved});
 if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Storage unavailable'}});}
 const data=route.request().postDataJSON();expect(data.expected_revision).toBe(saved.revision);saved={...saved,...data,revision:saved.revision+1};return route.fulfill({json:saved});
 });
 await page.goto('/#/projects/p1/weights/manual');
 await page.getByRole('button',{name:'Distribute Equally'}).click();
 await expect(page.getByLabel('Weight for Price')).toHaveValue('33.34');
 await page.getByLabel('Weight for Price').fill('38.34');await expect(page.getByRole('button',{name:'Approve Weights',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save Draft',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Storage unavailable');await expect(page.getByLabel('Weight for Price')).toHaveValue('38.34');
 await page.getByRole('button',{name:'Save Draft',exact:true}).click();await page.reload();await expect(page.getByLabel('Weight for Price')).toHaveValue('38.34');
 await page.getByLabel('Weight for Price').fill('33.34');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Approve Weights',exact:true}).click();await expect(page.getByText('Manual weights approved and saved.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('checkbox')).toBeChecked();await page.getByLabel('Weight for Quality').fill('30');await expect(page.getByRole('checkbox')).not.toBeChecked();await expect(page.getByRole('button',{name:'Approve Weights',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/weighting.png',fullPage:true});
});
