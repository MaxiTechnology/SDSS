import {test,expect} from '@playwright/test';
for(const method of ['ai','ahp'])test(`late initial ${method} response cannot erase edits`,async({page})=>{
 let count=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const criteria=[{id:'price',name:'Price',unit:'USD',direction:'cost'},{id:'quality',name:'Quality',unit:'points',direction:'benefit'}];
 const ai={criteria,criteria_revision:1,context:{category:'IT',criteria},revision:0,weight_revision:1,weights:{price:'0.00',quality:'0.00'},notes:'',suggestion:null,approved:false,needs_review:false,active_method:'manual',configured:true};
 const ahp={criteria,criteria_revision:1,judgments:{'price:quality':null},revision:0,weight_revision:1,approved:false,active_method:'manual',needs_review:false,result:null};
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/history'))return route.fulfill({json:{versions:[]}});
 if(url.endsWith('/suggest'))return route.fulfill({status:503,json:{detail:'Synthetic provider outage'}});
 if(url.endsWith(`/weights/${method}`)){
 count++;if(count===1){await gate;return route.fulfill({headers:{'x-test-stale':'yes'},json:method==='ai'?ai:ahp});}
 return route.fulfill({json:method==='ai'?ai:ahp});}
 return route.fulfill({json:{id:'p1',name:'Synthetic stale read',reference:'P1',currency:'USD'}});
 });
 await page.goto(`/#/projects/p1/weights/${method}`);
 if(method==='ai'){
 await page.getByLabel('Purchasing priorities',{exact:true}).fill('Keep these unsaved priorities.');
 await page.getByLabel('I agree to send the listed context and my priority notes to Cloudflare for a suggestion.').check();
 await page.getByRole('button',{name:'Request AI Suggestion',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Synthetic provider outage');
 }else await page.getByLabel('Price compared with Quality',{exact:true}).selectOption('2');
 const response=page.waitForResponse(r=>r.headers()['x-test-stale']==='yes');release();await (await response).finished();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 if(method==='ai'){
 await expect(page.getByLabel('Purchasing priorities',{exact:true})).toHaveValue('Keep these unsaved priorities.');
 await expect(page.getByRole('alert')).toContainText('Synthetic provider outage');
 }else await expect(page.getByLabel('Price compared with Quality',{exact:true})).toHaveValue('2');
});
