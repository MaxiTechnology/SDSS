import {test,expect} from './fixtures';
test('saved scenarios retry with same identity, survive reload and remain advisory',async({page})=>{
 const rows=[{id:'a',name:'Alpha',rank:1,score:'0.8'},{id:'b',name:'Beta',rank:2,score:'0.2'}];
 const result={baseline_id:'run',weights:{x:'25',y:'75'},result:{rows:[{...rows[1],rank:1,score:'0.8'},{...rows[0],rank:2,score:'0.2'}]}};
 let scenarios:any[]=[],attempts:string[]=[],fail=true;
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.includes('/sensitivity/scenarios')){
 if(route.request().method()==='GET')return route.fulfill({json:{scenarios}});
 const body=route.request().postDataJSON();attempts.push(body.id);
 scenarios=[{...result,...body,created_at:'2026-11-18T00:00:00Z',actor:'Demo User'}];
 if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Retry save'}});}
 return route.fulfill({json:scenarios[0]});}
 if(url.endsWith('/sensitivity'))return route.fulfill({json:result});
 if(url.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale:false,snapshot:{criteria:[{id:'x',name:'Quality'},{id:'y',name:'Price'}],weights:{x:'75',y:'25'},result:{rows}}}});
 return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/sensitivity');
 await page.getByLabel('Quality scenario weight').fill('25');await page.getByLabel('Price scenario weight').fill('75');
 await page.getByRole('button',{name:'Run Simulation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save Scenario',exact:true})).toBeDisabled();
 await page.getByLabel('Scenario name',{exact:true}).fill('Cost first');await page.getByLabel('Scenario notes').fill('Synthetic priorities');
 await page.getByRole('button',{name:'Save Scenario',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Retry save');
 await expect(page.getByLabel('Scenario name',{exact:true})).toHaveValue('Cost first');
 await page.getByRole('button',{name:'Save Scenario',exact:true}).click();expect(attempts[0]).toBe(attempts[1]);
 await expect(page.getByText('Saved scenarios for this baseline (1/20)')).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'Scenario saved.'})).not.toBeFocused();
 await page.reload();await expect(page.getByRole('heading',{name:'Cost first',exact:true})).toBeVisible();
 await expect(page.getByLabel('Quality scenario weight')).toHaveValue('75');
 await page.getByRole('button',{name:'View scenario: Cost first'}).click();await expect(page.getByLabel('Quality scenario weight')).toHaveValue('25');
 await expect(page.getByText('Highest-ranked supplier set changed.',{exact:false})).toBeVisible();
 await page.screenshot({path:'test-results/saved-sensitivity.png',fullPage:true});
});

 for(const width of [1440,320])test(`saved scenario cards and weight controls fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:800});
  const longName=`Synthetic ${'LongScenarioName'.repeat(7)}`,criterion=`Criterion ${'LongName'.repeat(8)}`,supplier=`Supplier ${'LongName'.repeat(8)}`;
  const rows=[{id:'a',name:supplier,rank:1,score:'0.98765449'},{id:'b',name:'Supplier B',rank:2,score:'0.12345678'}];
  const scenarios=[{id:'s1',name:longName,notes:'Synthetic scenario explanation',created_at:'2026-11-18T00:00:00Z',baseline_id:'run',weights:{x:'25.25',y:'74.75'},result:{rows}},{id:'s2',name:'Second scenario',notes:'',created_at:'2026-11-18T00:00:00Z',baseline_id:'run',weights:{x:'50',y:'50'},result:{rows}}];
  let stale=false,writes=0,baselineQueries:string[]=[];
  await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
  await page.route('**/api/projects**',route=>{
   const url=new URL(route.request().url());
   if(route.request().method()!=='GET'){writes++;return route.abort();}
   if(url.pathname.endsWith('/sensitivity/scenarios')){baselineQueries.push(url.searchParams.get('baseline_id')??'');return route.fulfill({json:{scenarios}});}
   if(url.pathname.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale,snapshot:{criteria:[{id:'x',name:criterion},{id:'y',name:'Price'}],weights:{x:'75',y:'25'},result:{rows}}}});
   return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
  });
  await page.goto('/#/projects/p1/sensitivity');
  await expect(page.getByRole('heading',{name:'Sensitivity Analysis',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Explore alternative weights',exact:true})).toBeVisible();
  await expect(page.getByText('Testing a scenario does not approve weights or award a supplier.',{exact:true})).toBeVisible();
  const weight=page.getByLabel(`${criterion} scenario weight`),price=page.getByLabel('Price scenario weight');
  await expect(weight).toHaveValue('75');await expect(weight.locator('..').locator('..')).toContainText(`${criterion} (base 75%)`);
  await expect(weight.locator('..')).toContainText('%');
  await expect(page.getByText('Total Weight: 100.00% — must equal 100%.',{exact:true})).toBeVisible();
  const card=page.locator('.sensitivity-scenario').first();
  await expect(page.locator('.sensitivity-scenario')).toHaveCount(2);
  await expect(card.getByRole('heading',{name:longName})).toBeVisible();
  await expect(card).toContainText('Synthetic scenario explanation');
  const time=await page.evaluate(value=>new Date(value).toLocaleString(),'2026-11-18T00:00:00Z');
  await expect(card).toContainText(`Saved ${time}`);await expect(card.getByRole('listitem')).toHaveCount(4);
  await expect(card.getByRole('listitem').nth(0)).toHaveText(`${criterion}: 25.25%`);
  await expect(card.getByRole('listitem').nth(2)).toHaveText(`${supplier}: rank 1, score 0.987654`);
  await expect(page.locator('.sensitivity-scenario').nth(1)).toContainText('No additional notes.');
  expect(await card.evaluate(el=>{const style=getComputedStyle(el),rect=el.getBoundingClientRect();return style.borderTopStyle==='solid'&&el.scrollWidth<=el.clientWidth&&rect.left>=0&&rect.right<=innerWidth;})).toBe(true);
  await weight.focus();expect(await weight.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');await expect(price).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Reset to Baseline'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Run Simulation'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Reload Saved Scenarios'})).toBeFocused();
  await page.keyboard.press('Tab');const view=card.getByRole('button',{name:`View scenario: ${longName}`});await expect(view).toBeFocused();
  expect(await view.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/sensitivity-layout-${width}.png`,fullPage:true});
  await view.click();await expect(weight).toHaveValue('25.25');await expect(price).toHaveValue('74.75');
  await expect(page.getByText(`Loaded saved scenario: ${longName}. Approved weights remain unchanged.`)).toBeVisible();
  await expect(page.getByRole('region',{name:'Scenario comparison table'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save Scenario',exact:true})).toBeDisabled();
  await weight.fill('25');await expect(page.getByRole('button',{name:'Run Simulation'})).toBeDisabled();
  await expect(page.getByRole('region',{name:'Scenario comparison table'})).toHaveCount(0);
  await page.getByRole('button',{name:'Reset to Baseline'}).click();await expect(weight).toHaveValue('75');
  stale=true;await page.reload();
  await expect(page.getByRole('alert')).toContainText('The baseline is out of date.');
  await expect(page.getByRole('button',{name:'Run Simulation'})).toHaveCount(0);
  await expect(page.locator('.sensitivity-scenario').first().getByRole('button',{name:`View scenario: ${longName}`})).toBeDisabled();
  await page.getByRole('button',{name:'Back to Rankings'}).click();await expect(page).toHaveURL(/projects\/p1\/rankings$/);
  expect(baselineQueries.every(id=>id==='run')).toBe(true);expect(writes).toBe(0);
 });

for(const [width,motion] of [[1440,'no-preference'],[320,'reduce']] as const)test(`viewing a saved scenario focuses its notice at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:600});await page.emulateMedia({reducedMotion:motion});
 await page.addInitScript(()=>{
  const original=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){
   if(this.classList.contains('sensitivity-notice')){
    document.documentElement.dataset.noticeScrolls=String(Number(document.documentElement.dataset.noticeScrolls||0)+1);
    document.documentElement.dataset.noticeScrollBehavior=typeof options==='object'?options.behavior:'';
   }
   original.call(this,options);
  };
 });
 const rows=[{id:'a',name:'Supplier A',rank:1,score:'0.8'},{id:'b',name:'Supplier B',rank:2,score:'0.2'}];
 const scenarios=Array.from({length:8},(_,i)=>({id:`s${i}`,name:`Scenario ${i}`,notes:'Synthetic scenario',created_at:'2026-11-18T00:00:00Z',baseline_id:'run',weights:{x:'25',y:'75'},result:{rows}}));
 let writes=0;
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  const url=route.request().url();
  if(url.includes('/sensitivity/scenarios'))return route.fulfill({json:{scenarios}});
  if(url.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale:false,snapshot:{criteria:[{id:'x',name:'Quality'},{id:'y',name:'Price'}],weights:{x:'75',y:'25'},result:{rows}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/sensitivity');
 await page.addStyleTag({content:'html {scroll-behavior:smooth}'});
 await expect(page.getByRole('button',{name:'View scenario: Scenario 7'})).toBeVisible();
 expect(await page.evaluate(()=>window.scrollY)).toBe(0);
 const scrollCount=()=>page.evaluate(()=>Number(document.documentElement.dataset.noticeScrolls||0));
 expect(await scrollCount()).toBe(0);
 const reload=page.getByRole('button',{name:'Reload Saved Scenarios'});
 await reload.click();await expect(reload).toBeFocused();expect(await scrollCount()).toBe(0);
 const view=page.getByRole('button',{name:'View scenario: Scenario 7'});
 await view.click();
 const notice=page.getByRole('status').filter({hasText:'Loaded saved scenario:'});
 await expect(notice).toHaveText('Loaded saved scenario: Scenario 7. Approved weights remain unchanged.');
 await expect(notice).toBeFocused();await expect(notice).toBeInViewport();
 expect(await notice.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(el).outlineStyle!=='none';})).toBe(true);
 expect(await scrollCount()).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.dataset.noticeScrollBehavior)).toBe('instant');
 await expect(page.getByLabel('Quality scenario weight')).toHaveValue('25');
 await expect(page.getByRole('region',{name:'Scenario comparison table'})).toBeVisible();
 await page.getByLabel('Quality scenario weight').fill('24');await expect(page.getByLabel('Quality scenario weight')).toBeFocused();expect(await scrollCount()).toBe(1);
 await view.focus();await page.keyboard.press('Enter');
 await expect(notice).toBeFocused();await expect(notice).toBeInViewport();expect(await scrollCount()).toBe(2);
 await expect(page.getByLabel('Quality scenario weight')).toHaveValue('25');
 const other=page.getByRole('button',{name:'View scenario: Scenario 6'});await other.focus();await page.keyboard.press('Space');
 await expect(notice).toHaveText('Loaded saved scenario: Scenario 6. Approved weights remain unchanged.');
 await expect(notice).toBeFocused();await expect(notice).toBeInViewport();expect(await scrollCount()).toBe(3);
 await reload.click();await expect(reload).toBeFocused();expect(await scrollCount()).toBe(3);
 expect(writes).toBe(0);
});
