import {test,expect} from './fixtures';
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

for(const width of [1440,320])test(`AHP control groups and history remain usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const criteria=[{id:'a',name:'Price'},{id:'b',name:'Quality'}];
 const result={weights:{a:'50',b:'50'},cr:'0.0999999',ci:'0.05',ri:'0.5',lambda_max:'2.1',acceptable:true,matrix:[['1','1'],['1','1']],method:'AHP'};
 const judgments={'a:b':'1'};
 const saved={criteria,criteria_revision:1,judgments,revision:1,weight_revision:1,approved:true,active_method:'ahp',needs_review:false,result};
 let writes=0;
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET')writes++;
  const url=route.request().url();
  if(url.endsWith('/history'))return route.fulfill({json:{versions:[{revision:1,created_at:'2026-11-18',snapshot:{criteria,judgments,approved:true,result}}]}});
  return route.fulfill({json:url.endsWith('/weights/ahp')?saved:{id:'p1',name:'Test AHP',reference:'P1',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/weights/ahp');
 const methods=page.getByRole('region',{name:'Other weighting methods'});
 const tools=page.getByRole('region',{name:'Comparison tools'});
 await expect(methods.getByRole('button')).toHaveCount(2);
 await expect(tools.getByRole('button',{name:'Reload saved comparisons'})).toBeVisible();
 await expect(page.getByText('1 of 1 comparisons answered')).toBeVisible();
 await expect(page.getByText('Consistency ratio (CR): 0.100000', {exact:false})).toContainText('Within the 0.10 limit.');
 const draft=page.getByRole('button',{name:'Save Draft',exact:true});
 const approve=page.getByRole('button',{name:'Approve AHP Weights'});
 const next=page.getByRole('button',{name:'Continue to Eligibility Review',exact:false});
 await expect(next).toBeEnabled();
 await draft.focus();await page.keyboard.press('Tab');await expect(approve).toBeFocused();
 expect(await approve.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 const layout=await page.locator('.ahp-weighting').evaluate(el=>{
  const rect=(selector:string)=>el.querySelector(selector)!.getBoundingClientRect();
  const methods=rect('.weighting-methods'),tools=rect('.ahp-comparison-tools'),table=rect('.table-scroll'),calculate=rect('.ahp-calculate'),save=rect('.weighting-save-actions'),next=rect('.weighting-continue'),history=rect('.ahp-history');
  const buttons=Array.from(el.querySelectorAll('.weighting-methods button,.ahp-comparison-tools button,.ahp-calculate button,.weighting-save-actions button,.weighting-continue button'),button=>button.getBoundingClientRect());
  return methods.bottom<tools.top&&tools.bottom<table.top&&table.bottom<calculate.top&&save.bottom<next.top&&next.bottom<history.top&&buttons.every((a,i)=>buttons.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
 });
 expect(layout).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.getByText('Saved comparison history (latest 20 versions)').click();
 await expect(page.getByText('Price compared with Quality: 1')).toBeVisible();
 await expect(page.getByText('CR: 0.100000',{exact:true})).toBeVisible();
 await page.getByLabel('Price compared with Quality').selectOption('2');
 await expect(next).toBeDisabled();await expect(approve).toBeDisabled();
 page.once('dialog',dialog=>dialog.dismiss());await tools.getByRole('button',{name:'Reload saved comparisons'}).click();
 await expect(page.getByLabel('Price compared with Quality')).toHaveValue('2');
 page.once('dialog',dialog=>dialog.accept());await tools.getByRole('button',{name:'Reload saved comparisons'}).click();
 await expect(page.getByLabel('Price compared with Quality')).toHaveValue('1');
 await expect(next).toBeEnabled();expect(writes).toBe(0);
});
