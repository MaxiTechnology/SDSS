import {test,expect} from './fixtures';
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
 const methods=page.getByRole('region',{name:'Choose a weighting method'});
 await expect(methods.getByRole('button')).toHaveCount(3);
 for(const button of await methods.getByRole('button').all())await expect(button).toBeDisabled();
 await page.getByRole('button',{name:'Configure Quality',exact:true}).click();await page.getByLabel('Preference').selectOption('cost');await page.getByLabel('Minimum (optional)').fill('101');await page.getByRole('button',{name:'Save Criteria',exact:true}).click();await expect(page.getByRole('alert')).toContainText('minimum below');await page.getByLabel('Minimum (optional)').fill('0');
 await page.getByRole('button',{name:'+ Add Custom Criterion',exact:true}).click();await page.getByLabel('Criterion Name').fill('Battery life');await page.getByLabel('Measurement Unit').fill('hours');await page.getByLabel('Maximum (optional)').fill('24');
 await page.getByLabel('Enforce a maximum').check();await page.getByLabel('Maximum Total Price').fill('140000');await page.getByRole('button',{name:'+ Add Mandatory Check',exact:true}).click();await page.getByLabel('Check Name',{exact:true}).fill('Security');await page.getByLabel('Pass Requirement').fill('Valid certificate');
 await page.getByRole('button',{name:'Save Criteria',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Storage unavailable');await expect(page.getByLabel('Criterion Name')).toHaveValue('Battery life');await page.getByRole('button',{name:'Save Criteria',exact:true}).click();await expect(page.getByRole('status')).toContainText('saved');
 for(const button of await methods.getByRole('button').all())await expect(button).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'Configure Battery life',exact:true}).click();await expect(page.getByLabel('Measurement Unit')).toHaveValue('hours');await expect(page.getByLabel('Check Name',{exact:true})).toHaveValue('Security');await expect(page.getByLabel('Maximum Total Price')).toHaveValue('140000');await page.getByRole('button',{name:'Configure Quality',exact:true}).click();await expect(page.getByLabel('Preference')).toHaveValue('cost');
 await page.screenshot({path:'test-results/criteria.png',fullPage:true});
 await page.getByRole('checkbox',{name:'Use Price',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Use Quality',exact:true}).uncheck();await expect(page.getByRole('button',{name:'Save Criteria',exact:true})).toBeDisabled();
 for(const button of await methods.getByRole('button').all())await expect(button).toBeDisabled();
});

for(const width of [1440,320])test(`active criterion is distinct from scoring selection at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const criteria=[{id:'price',name:'Price',unit:'USD',direction:'cost',selected:true,minimum:'0',maximum:null},{id:'quality',name:'Quality',unit:'points',direction:'benefit',selected:true,minimum:'0',maximum:'100'}];
 await page.route('**/api/projects**',route=>route.fulfill({json:route.request().url().endsWith('/criteria')?{revision:1,currency:'USD',configuration:{criteria,mandatory_checks:[],maximum_price:null}}:{id:'p1',reference:'PRJ-T',name:'Test',currency:'USD'}}));
 await page.goto('/#/projects/p1/criteria');
 const price=page.getByRole('button',{name:'Editing Price',exact:true});
 await expect(price).toHaveAttribute('aria-current','true');
 await expect(price).toHaveClass('secondary');
 await expect(price.locator('..').locator('..')).toHaveClass('configuring');
 await expect(page.getByRole('heading',{name:'Configure: Price'})).toBeVisible();
 const quality=page.getByRole('button',{name:'Configure Quality',exact:true});
 await expect(quality).toHaveClass('secondary');
 await expect(quality).not.toHaveAttribute('aria-current','true');
 await page.getByRole('checkbox',{name:'Use Quality'}).uncheck();
 await page.getByRole('checkbox',{name:'Use Quality'}).focus();
 await page.keyboard.press('Tab');
 await expect(quality).toBeFocused();
 expect(await quality.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Enter');
 const editing=page.getByRole('button',{name:'Editing Quality',exact:true});
 await expect(editing).toHaveAttribute('aria-current','true');
 await expect(editing.locator('..').locator('..')).toHaveClass('configuring');
 await expect(page.getByRole('checkbox',{name:'Use Quality'})).not.toBeChecked();
 await expect(page.getByRole('heading',{name:'Configure: Quality'})).toBeVisible();
 await page.getByLabel('Criterion Name').fill('Quality revised');
 await expect(page.getByRole('heading',{name:'Configure: Quality revised'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Editing Quality revised',exact:true})).toHaveAttribute('aria-current','true');
 await page.getByRole('button',{name:'Configure Price',exact:true}).click();
 await page.getByRole('button',{name:'Configure Quality revised',exact:true}).click();
 await expect(page.getByLabel('Criterion Name')).toHaveValue('Quality revised');
 await expect(page.getByRole('checkbox',{name:'Use Quality revised'})).not.toBeChecked();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

for(const width of [1440,320])test(`criteria save and weighting actions fit and remain keyboard accessible at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const criteria=[{id:'price',name:'Price',unit:'USD',direction:'cost',selected:true,minimum:'0',maximum:null},{id:'quality',name:'Quality',unit:'points',direction:'benefit',selected:true,minimum:'0',maximum:'100'}];
 await page.route('**/api/projects**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/criteria'))return route.fulfill({json:{revision:1,currency:'USD',configuration:{criteria,mandatory_checks:[],maximum_price:null}}});
  if(path.endsWith('/weights/manual'))return route.fulfill({json:{criteria,criteria_revision:1,weights:{price:'50',quality:'50'},revision:1,approved:false,needs_review:false}});
  if(path.endsWith('/weights/ahp'))return route.fulfill({json:{criteria,criteria_revision:1,judgments:{'price:quality':'1'},revision:1,weight_revision:1,approved:false,active_method:'manual',needs_review:false,result:null}});
  if(path.endsWith('/weights/ai'))return route.fulfill({json:{criteria,criteria_revision:1,context:{criteria},revision:1,weight_revision:1,weights:{price:'50',quality:'50'},notes:'',approved:false,needs_review:false,active_method:'manual',configured:true,suggestion:null}});
  return route.fulfill({json:{id:'p1',reference:'PRJ-T',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/criteria');
 const methods=page.getByRole('region',{name:'Choose a weighting method'});
 await expect(methods).toContainText('Save your criteria and any changes before continuing.');
 const save=page.getByRole('button',{name:'Save Criteria',exact:true});
 await expect(save.locator('..').getByRole('button')).toHaveCount(2);
 await save.focus();await page.keyboard.press('Tab');
 const manual=methods.getByRole('button',{name:'Continue to Manual Weighting',exact:false});
 await expect(manual).toBeFocused();
 expect(await manual.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 const bounds=await methods.evaluate(el=>{
  const section=el.getBoundingClientRect();
  const buttons=Array.from(el.querySelectorAll('button'),button=>button.getBoundingClientRect());
  return buttons.every((button,i)=>button.left>=section.left&&button.right<=section.right&&buttons.slice(i+1).every(other=>button.right<=other.left||other.right<=button.left||button.bottom<=other.top||other.bottom<=button.top));
 });
 expect(bounds).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 for(const [name,path] of [['Continue to Manual Weighting','manual'],['Use AHP Pairwise Weighting','ahp'],['Use AI Weight Suggestions','ai']]){
  await methods.getByRole('button',{name,exact:false}).click();
  await expect(page).toHaveURL(new RegExp(`/weights/${path}$`));
  await page.goto('/#/projects/p1/criteria');
 }
});

