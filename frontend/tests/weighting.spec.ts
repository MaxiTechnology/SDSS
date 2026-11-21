import {test,expect} from './fixtures';
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

for(const width of [1440,320])test(`manual weighting action groups remain usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const saved={method:'ahp',criteria:[{id:'price',name:'Price',unit:'USD'},{id:'quality',name:'Quality',unit:'points'}],criteria_revision:1,weights:{price:'70.00',quality:'30.00'},revision:1,approved:true,needs_review:false};
 let writes=0;
 await page.route('**/api/projects**',route=>{
  if(route.request().method()==='PUT')writes++;
  return route.fulfill({json:route.request().url().endsWith('/weights/manual')?saved:{id:'p1',reference:'PRJ-T',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/weights/manual');
 await expect(page.getByText('Another weighting method is active.',{exact:false})).toBeVisible();
 const methods=page.getByRole('region',{name:'Other weighting methods'});
 const tools=page.getByRole('region',{name:'Weight editing tools'});
 const back=page.getByRole('button',{name:'Back to Criteria',exact:false});
 const draft=page.getByRole('button',{name:'Save Draft',exact:true});
 const approve=page.getByRole('button',{name:'Approve Weights',exact:true});
 const next=page.getByRole('button',{name:'Continue to Eligibility Review',exact:false});
 await expect(methods.getByRole('button')).toHaveCount(2);
 await expect(tools.getByRole('button')).toHaveCount(2);
 await expect(next).toBeEnabled();
 await draft.focus();await page.keyboard.press('Tab');await expect(approve).toBeFocused();
 expect(await approve.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 const layout=await page.locator('.manual-weighting').evaluate(el=>{
  const methods=el.querySelector('.weighting-methods')!.getBoundingClientRect();
  const tools=el.querySelector('.weighting-tools')!.getBoundingClientRect();
  const save=el.querySelector('.weighting-save-actions')!.getBoundingClientRect();
  const next=el.querySelector('.weighting-continue')!.getBoundingClientRect();
  const buttons=Array.from(el.querySelectorAll('.weighting-methods button,.weighting-tools button,.weighting-save-actions button,.weighting-continue button'),button=>button.getBoundingClientRect());
  return methods.bottom<tools.top&&save.bottom<next.top&&buttons.every((a,i)=>buttons.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
 });
 expect(layout).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await tools.getByRole('button',{name:'Distribute Equally'}).click();
 await expect(page.getByLabel('Weight for Price')).toHaveValue('50.00');
 await expect(next).toBeDisabled();
 page.once('dialog',dialog=>dialog.dismiss());
 await methods.getByRole('button',{name:'Use AHP Pairwise Weighting'}).click();
 await expect(page).toHaveURL(/weights\/manual$/);
 page.once('dialog',dialog=>dialog.dismiss());await back.click();
 await expect(page).toHaveURL(/weights\/manual$/);
 await tools.getByRole('button',{name:'Reset to Saved'}).click();
 await expect(page.getByLabel('Weight for Price')).toHaveValue('70.00');
 await expect(next).toBeEnabled();
 expect(writes).toBe(0);
});
