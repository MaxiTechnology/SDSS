import {test,expect} from '@playwright/test';
test('recovery requires explicit copy and save, keeps typed entries on failure and does not calculate early',async({page})=>{
 let fail=true,saves=0;
 let matrix:any={entries:{a:{price:null,quality:null},c:{price:null,quality:null}},suppliers:[{id:'a',name:'Supplier A'},{id:'c',name:'Supplier C'}],criteria:[{id:'price',name:'Price',unit:'USD',direction:'cost',minimum:'0',maximum:null},{id:'quality',name:'Quality',unit:'points / 100',direction:'benefit',minimum:'0',maximum:'100'}],context:'x'.repeat(64),revision:3,needs_review:true,ready:false,recovery:{count:2,available:true,entries:{a:{price:'100',quality:'90'},c:{price:null,quality:null}}}};
 await page.route('**/api/projects**',async route=>{
 if(!route.request().url().endsWith('/matrix'))return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 if(route.request().method()==='PUT'){
 saves++;if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Retry save'}});}
 const body=route.request().postDataJSON();expect(body.expected_revision).toBe(3);
 matrix={...matrix,entries:body.entries,revision:4,needs_review:false,ready:true,recovery:null};}
 return route.fulfill({json:matrix});});
 await page.goto('/#/projects/p1/matrix');
 const a=page.getByLabel('Supplier A: Price'),c=page.getByLabel('Supplier C: Price'),calculate=page.getByRole('button',{name:'Calculate Rankings'});
 await expect(a).toHaveValue('');await expect(calculate).toBeDisabled();
 await page.screenshot({path:'test-results/matrix-recovery-offer.png',fullPage:true});
 await page.getByRole('button',{name:'Recover Previous Values'}).click();
 await expect(a).toHaveValue('100');await expect(c).toHaveValue('');expect(saves).toBe(0);await expect(calculate).toBeDisabled();
 await c.fill('110');await page.getByLabel('Supplier C: Quality').fill('85');await expect(calculate).toBeDisabled();
 await page.getByRole('button',{name:'Save Matrix Draft'}).click();await expect(page.getByRole('alert')).toContainText('Retry save');await expect(a).toHaveValue('100');
 await page.getByRole('button',{name:'Save Matrix Draft'}).click();await expect(calculate).toBeEnabled();
 await page.reload();await expect(a).toHaveValue('100');await expect(page.getByRole('button',{name:'Recover Previous Values'})).toHaveCount(0);
 await page.screenshot({path:'test-results/matrix-recovered.png',fullPage:true});
});
