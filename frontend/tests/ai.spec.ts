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
