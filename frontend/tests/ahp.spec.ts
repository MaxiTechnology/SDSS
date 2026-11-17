import {test,expect} from '@playwright/test';
test('AHP incomplete, inconsistent, save retry, approval and reopening',async({page})=>{
 let fail=true;
 const criteria=[{id:'a',name:'Price'},{id:'b',name:'Quality'},{id:'c',name:'Delivery'}];
 const result={weights:{a:'57.14',b:'28.57',c:'14.29'},cr:'0',ci:'0',ri:'0.58',lambda_max:'3',acceptable:true,matrix:[['1','2','4'],['0.5','1','2'],['0.25','0.5','1']],method:'AHP principal eigenvector'};
 let saved={criteria,criteria_revision:1,judgments:{'a:b':null,'a:c':null,'b:c':null} as Record<string,string|null>,revision:0,weight_revision:1,approved:false,active_method:'manual',needs_review:false,result:null as typeof result|null};
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url(),method=route.request().method();
 if(url.endsWith('/history'))return route.fulfill({json:{versions:[]}});
 if(url.endsWith('/calculate')){const p=route.request().postDataJSON();return route.fulfill({json:{...result,cr:p.judgments['a:b']==='9'?'1.4':'0',acceptable:p.judgments['a:b']!=='9'}});}
 if(url.endsWith('/ahp')){
 if(method==='PUT'){if(fail){fail=false;return route.fulfill({status:503,json:{detail:'AHP saving unavailable'}});}const p=route.request().postDataJSON();saved={...saved,judgments:p.judgments,revision:saved.revision+1,weight_revision:2,approved:p.approved,active_method:'ahp',result};}
 return route.fulfill({json:saved});}
 return route.fulfill({json:{id:'p1',name:'Test AHP',reference:'P1',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/weights/ahp');await expect(page.getByRole('button',{name:'Calculate AHP Weights'})).toBeDisabled();
 await page.getByLabel('Price compared with Quality').selectOption('9');await page.getByLabel('Price compared with Delivery').selectOption('1/9');await page.getByLabel('Quality compared with Delivery').selectOption('9');
 await page.getByRole('button',{name:'Calculate AHP Weights'}).click();await expect(page.getByText('Above 0.10.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Approve AHP Weights'})).toBeDisabled();
 await page.getByLabel('Price compared with Quality').selectOption('2');await page.getByLabel('Price compared with Delivery').selectOption('4');await page.getByLabel('Quality compared with Delivery').selectOption('2');
 await page.getByRole('button',{name:'Calculate AHP Weights'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Approve AHP Weights'}).click();await expect(page.getByRole('alert')).toContainText('unavailable');await expect(page.getByLabel('Price compared with Quality')).toHaveValue('2');
 await page.getByRole('button',{name:'Approve AHP Weights'}).click();await expect(page.getByRole('button',{name:'Continue to Eligibility Review',exact:false})).toBeEnabled();await page.reload();await expect(page.getByText('AHP weights are approved.',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/ahp.png',fullPage:true});
 await page.getByRole('button',{name:'Continue to Eligibility Review',exact:false}).click();await expect(page).toHaveURL(/eligibility/);
});
