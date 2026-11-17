import {test,expect} from '@playwright/test';
test('matrix saves drafts, validates ranges and reopens',async({page})=>{
 const project={id:'p1',reference:'PRJ-T',name:'Test',currency:'USD',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 let matrix:any={entries:{a:{quality:null},b:{quality:null}},suppliers:[{id:'a',name:'Supplier A'},{id:'b',name:'Supplier B'}],criteria:[{id:'quality',name:'Quality',unit:'points / 100',direction:'benefit',minimum:'0',maximum:'100'}],context:'x'.repeat(64),revision:0,needs_review:false,ready:false};let fail=true;
 await page.route('**/api/projects**',async route=>{
 if(!route.request().url().endsWith('/matrix'))return route.fulfill({json:project});
 if(route.request().method()==='PUT'){
 if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Storage unavailable'}});}
 matrix={...matrix,entries:route.request().postDataJSON().entries,revision:matrix.revision+1,ready:true};
 }
 return route.fulfill({json:matrix});
 });
 await page.goto('/#/projects/p1/matrix');
 const a=page.getByLabel('Supplier A: Quality');const b=page.getByLabel('Supplier B: Quality');
 await a.fill('101');await expect(page.getByRole('button',{name:'Save Matrix Draft'})).toBeDisabled();
 await a.fill('90');await b.fill('80');
 await page.getByRole('button',{name:'Save Matrix Draft'}).click();await expect(page.getByRole('alert')).toContainText('Storage unavailable');await expect(a).toHaveValue('90');
 await page.getByRole('button',{name:'Save Matrix Draft'}).click();await expect(page.getByRole('status')).toContainText('Matrix saved');
 await page.reload();await expect(a).toHaveValue('90');await expect(b).toHaveValue('80');
 await page.screenshot({path:'test-results/matrix.png',fullPage:true});
});
