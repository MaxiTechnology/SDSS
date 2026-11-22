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

for(const width of [1440,320])test(`eligibility guidance, table and continuation remain clear at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const stamp='2026-11-16T10:00:00Z';
 const row={id:'s1',name:'Supplier A',updated_at:stamp,checks:{cert:{status:'passed',notes:'Reviewed'}},total_price:'90',price_status:'passed',eligibility:'eligible',revision:1,needs_review:false,reviewer:'Reviewer A',reviewed_at:stamp};
 let ready=false,writes=0;
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(route.request().url().endsWith('/eligibility')){
   return route.fulfill({json:{weight_method:'ahp',suppliers:[row,{...row,id:'s2',name:'Supplier B',eligibility:ready?'eligible':'pending',reviewer:null,reviewed_at:null}],mandatory_checks:ready?[]:[{id:'cert',name:'Certificate',requirement:'Valid certificate'}],maximum_price:ready?null:'100',currency:'USD',criteria_revision:1,eligible_count:ready?2:1,ready}});
  }
  return route.fulfill({json:{id:'p1',reference:'PRJ-T',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/eligibility');
 await expect(page.getByRole('heading',{name:'Supplier eligibility',exact:true})).toBeVisible();
 await expect(page.getByText('1 eligible · 1 excluded or pending')).toBeVisible();
 await expect(page.getByText('No mandatory requirements are configured.',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Missing or unreviewed requirements remain Pending.',{exact:false})).toBeVisible();
 await expect(page.getByText('Review notes record the signed-in reviewer.',{exact:false})).toBeVisible();
 const table=page.getByRole('region',{name:'Supplier eligibility table'});
 const first=table.getByRole('row').filter({hasText:'Supplier A'});
 await expect(first.getByRole('button',{name:'Review Supplier A'})).toBeVisible();
 await expect(first.getByText('Reviewer A')).toBeVisible();
 const localTime=await page.evaluate(value=>new Date(value).toLocaleString(),stamp);
 await expect(first.locator('.review-meta')).toContainText(localTime);
 const next=page.getByRole('button',{name:'Continue to Evaluation Matrix',exact:false});
 await expect(next).toBeDisabled();
 await expect(page.getByText('At least two suppliers must qualify before evaluation.')).toBeVisible();
 if(width===320){await table.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);}
 const refresh=page.getByRole('button',{name:'Refresh Reviews'});
 ready=true;
 await refresh.click();
 await expect(page.getByText('No mandatory requirements are configured.',{exact:false})).toBeVisible();
 await expect(page.getByText('Minimum eligible pool met.')).toBeVisible();
 await expect(next).toBeEnabled();
 await refresh.focus();await page.keyboard.press('Tab');await expect(next).toBeFocused();
 expect(await next.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 const layout=await page.locator('.eligibility-page').evaluate(el=>{
  const nav=el.querySelector('.eligibility-navigation')!.getBoundingClientRect(),continuation=el.querySelector('.eligibility-continuation')!.getBoundingClientRect();
  const buttons=Array.from(el.querySelectorAll('.eligibility-navigation button,.eligibility-continuation button'),button=>button.getBoundingClientRect());
  return nav.bottom<continuation.top&&buttons.every((a,i)=>buttons.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
 });
 expect(layout).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 if(width===320){await next.click();await expect(page).toHaveURL(/projects\/p1\/matrix$/);}
 else{await page.getByRole('button',{name:'Back to AHP Weighting',exact:false}).click();await expect(page).toHaveURL(/projects\/p1\/weights\/ahp$/);}
 expect(writes).toBe(0);
});
