import {test,expect} from './fixtures';
test('eligibility cancellation, failed save and persistence',async({page})=>{
const project={id:'p1',reference:'PRJ-T',name:'Test',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
let row:any={id:'s1',name:'Supplier A',updated_at:project.updated_at,checks:{cert:{status:'pending',notes:''}},total_price:null,price_status:'pending',eligibility:'pending',revision:0,needs_review:false,reviewer:null,reviewed_at:null};let fail=true;
await page.route('**/api/projects**',async route=>{
const url=route.request().url();
if(url.endsWith('/evidence'))return route.fulfill({json:{files:[],evidence_revision:0,limits:{used_bytes:0,max_bytes:20971520,file_max_bytes:2097152,active_limit:10,stored_files:0,stored_file_limit:100}}});
if(url.endsWith('/eligibility'))return route.fulfill({json:{suppliers:[row],mandatory_checks:[{id:'cert',name:'Certificate',requirement:'Valid sample certificate'}],maximum_price:'100',currency:'USD',criteria_revision:1,eligible_count:row.eligibility==='eligible'?1:0,ready:false}});
if(url.endsWith('/eligibility/s1')){
if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Storage unavailable'}});}
const data=route.request().postDataJSON();row={...row,...data,revision:1,eligibility:'eligible',price_status:'passed',reviewer:'Demo User (unauthenticated)',reviewed_at:project.updated_at};return route.fulfill({json:row});}
return route.fulfill({json:project});
});
await page.goto('/#/projects/p1/eligibility');
await page.getByRole('button',{name:'Review Supplier A',exact:true}).click();
await page.getByLabel('Determination for Certificate').selectOption('passed');
await expect(page.getByRole('button',{name:'Save Review',exact:true})).toBeDisabled();
await page.getByLabel('Review notes for Certificate').fill('Sample certificate is current.');
page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cancel',exact:true}).click();
await page.getByRole('button',{name:'Review Supplier A',exact:true}).click();
await expect(page.getByLabel('Determination for Certificate')).toHaveValue('pending');
await page.getByLabel('Determination for Certificate').selectOption('passed');
await page.getByLabel('Review notes for Certificate').fill('Sample certificate is current.');
await page.getByLabel('Supplier total price (USD)').fill('100');
await page.getByRole('button',{name:'Save Review',exact:true}).click();
await expect(page.getByRole('alert')).toContainText('Storage unavailable');
await expect(page.getByLabel('Review notes for Certificate')).toHaveValue('Sample certificate is current.');
await page.getByRole('button',{name:'Save Review',exact:true}).click();
await expect(page.getByText('Review saved for Supplier A.',{exact:true})).toBeVisible();
await page.reload();await expect(page.getByText('1 eligible',{exact:false})).toBeVisible();
await page.getByRole('button',{name:'Review Supplier A',exact:true}).click();
await expect(page.getByLabel('Determination for Certificate')).toHaveValue('passed');
await page.screenshot({path:'test-results/eligibility.png',fullPage:true});
});
