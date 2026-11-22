import {test,expect} from './fixtures';
test('AI consent, unavailable retry, edits, exact total, approval and reload',async({page})=>{
 const criteria=[{id:'price',name:'Price',unit:'USD',direction:'cost'},{id:'quality',name:'Quality',unit:'points',direction:'benefit'}];
 let saved={criteria,criteria_revision:1,context:{category:'IT',criteria},revision:0,weight_revision:1,weights:{price:'0.00',quality:'0.00'},notes:'',suggestion:null as any,approved:false,needs_review:false,active_method:'ahp',configured:true};
 let fail=true,requests:string[]=[];
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/history'))return route.fulfill({json:{versions:[]}});
 if(url.endsWith('/suggest')){
 const p=route.request().postDataJSON();requests.push(p.id);expect(p.consent).toBe(true);
 if(fail){fail=false;return route.fulfill({status:503,json:{detail:'AI is temporarily unavailable. Your saved work was kept.'}});}
 saved={...saved,revision:1,weights:{price:'60.00',quality:'40.00'},suggestion:{id:p.id,provider:'Cloudflare Workers AI',model:'test-model',priorities:p.priorities,summary:'Balance price and quality.',input_context:saved.context,weights:{price:'60.00',quality:'40.00'},rationales:{price:'Control the cost.',quality:'Maintain quality.'}}};return route.fulfill({json:saved});
 }
 if(url.endsWith('/weights/ai')){
 if(route.request().method()==='PUT'){const p=route.request().postDataJSON();saved={...saved,revision:2,weight_revision:2,weights:p.weights,notes:p.notes,approved:p.approved,active_method:'ai'};}
 return route.fulfill({json:saved});}
 return route.fulfill({json:{id:'p1',name:'AI test',reference:'P1',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/weights/ai');await page.getByLabel('Purchasing priorities').fill('Balance cost and quality');
 await expect(page.getByRole('button',{name:'Request AI Suggestion'})).toBeDisabled();await page.getByLabel('I agree to send',{exact:false}).check();
 await page.getByRole('button',{name:'Request AI Suggestion'}).click();await expect(page.getByRole('alert')).toContainText('temporarily unavailable');await expect(page.getByLabel('Purchasing priorities')).toHaveValue('Balance cost and quality');
 await page.getByRole('button',{name:'Request AI Suggestion'}).click();expect(requests[0]).toBe(requests[1]);
 await expect(page.getByText('Control the cost.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Approve AI Weights'})).toBeDisabled();
 await page.getByLabel('AI weight for Price').fill('55');await page.getByLabel('I reviewed the AI explanations',{exact:false}).check();await expect(page.getByRole('button',{name:'Approve AI Weights'})).toBeDisabled();
 await page.getByLabel('AI weight for Quality').fill('45');await page.getByLabel('AI review notes').fill('Adjusted after review');await page.getByLabel('I reviewed the AI explanations',{exact:false}).check();
 await page.screenshot({path:'test-results/ai-review.png',fullPage:true});
 await page.getByRole('button',{name:'Approve AI Weights'}).click();await page.reload();await expect(page.getByText('AI-assisted weights are approved.',{exact:true})).toBeVisible();await expect(page.getByLabel('AI weight for Price')).toHaveValue('55');
 await page.getByRole('button',{name:'Continue to Eligibility Review',exact:false}).click();await expect(page).toHaveURL(/eligibility/);
});

 for(const width of [1440,320])test(`AI weighting sections remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:850});
  const criteria=[{id:'price',name:'Price',unit:'USD',direction:'cost'},{id:'quality',name:'Quality',unit:'points',direction:'benefit'}];
  const context={category:'IT',criteria};
  const suggestion={id:'s1',provider:'Synthetic provider',model:'test-model',priorities:'Balance cost and quality',summary:'Balance price and quality.',input_context:context,weights:{price:'60.00',quality:'40.00'},rationales:{price:'Control cost',quality:'Maintain quality'}};
  const saved={criteria,criteria_revision:1,context,revision:1,weight_revision:1,weights:suggestion.weights,notes:'Saved notes',suggestion,approved:true,needs_review:false,active_method:'ai',configured:true};
  let writes=0;
  await page.route('**/api/projects**',route=>{
   if(route.request().method()!=='GET'){writes++;return route.abort();}
   const url=route.request().url();
   if(url.endsWith('/history'))return route.fulfill({json:{versions:[{revision:1,created_at:'2026-11-18',snapshot:{event:'Saved',approved:true,notes:'Saved notes',weights:saved.weights,suggestion}}]}});
   return route.fulfill({json:url.endsWith('/weights/ai')?saved:{id:'p1',name:'AI test',reference:'P1',currency:'USD'}});
  });
  await page.goto('/#/projects/p1/weights/ai');
  const methods=page.getByRole('region',{name:'Other weighting methods'});
  const review=page.getByRole('region',{name:'Saved AI suggestion'});
  const request=page.getByRole('group',{name:'Request a suggestion'});
  await expect(page.getByRole('heading',{name:'Request a suggestion'})).toBeVisible();
  await expect(methods.getByRole('button')).toHaveCount(2);
  await expect(request.getByRole('button',{name:'Request AI Suggestion'})).toBeDisabled();
  await expect(review.getByLabel('AI review notes')).toHaveValue('Saved notes');
  const next=page.getByRole('button',{name:'Continue to Eligibility Review',exact:false});
  await expect(next).toBeEnabled();
  const draft=review.getByRole('button',{name:'Save Draft',exact:true});
  const approve=review.getByRole('button',{name:'Approve AI Weights'});
  await draft.focus();await page.keyboard.press('Tab');await expect(approve).toBeFocused();
  expect(await approve.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  const layout=await page.locator('.ai-weighting').evaluate(el=>{
   const rect=(selector:string)=>el.querySelector(selector)!.getBoundingClientRect();
   const methods=rect('.weighting-methods'),request=rect('.ai-request'),review=rect('.ai-review'),save=rect('.ai-save-actions'),next=rect('.weighting-continue'),history=rect('.ai-history');
   const buttons=Array.from(el.querySelectorAll('.weighting-methods button,.ai-request button,.ai-save-actions button,.weighting-continue button'),button=>button.getBoundingClientRect());
   return methods.bottom<request.top&&request.bottom<review.top&&save.bottom<next.top&&next.bottom<history.top&&buttons.every((a,i)=>buttons.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
  });
  expect(layout).toBe(true);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByText('AI draft and approval history (latest 20 versions)').click();
  await expect(page.getByText('Version 1: Saved (approved)')).toBeVisible();
  await review.getByLabel('AI review notes').fill('Unsaved review');
  await expect(next).toBeDisabled();
  page.once('dialog',dialog=>dialog.dismiss());await methods.getByRole('button',{name:'Use Manual Weighting'}).click();
  await expect(page).toHaveURL(/weights\/ai$/);
  await expect(review.getByLabel('AI review notes')).toHaveValue('Unsaved review');
  expect(writes).toBe(0);
 });
