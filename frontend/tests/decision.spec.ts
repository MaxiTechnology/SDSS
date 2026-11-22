import {test,expect} from './fixtures';
import reportFixture from './report-fixture.json' with {type:'json'};
test('confirm alternative, retry safely, revise to deferral and preserve history',async({page})=>{
 let decisions:any[]=[],fail=true;const requests:string[]=[];
 const rows=[{id:'11111111-1111-4111-8111-111111111111',name:'Alpha',rank:1,score:'0.75'},{id:'22222222-2222-4222-8222-222222222222',name:'Beta',rank:2,score:'0.25'}];
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/decisions')){
 if(route.request().method()==='POST'){
 const p=route.request().postDataJSON();requests.push(p.id);
 if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Retry confirmation'}});}
 const d={id:p.id,ranking_id:p.ranking_id,version:p.expected_version+1,stale:false,actor:'Demo User (unauthenticated)',created_at:'2026-11-18T00:00:00Z',snapshot:{action:p.action,supplier:p.supplier_id?rows.find(r=>r.id===p.supplier_id):null,reason:p.reason,revision_reason:p.revision_reason}};
 decisions=[d,...decisions];return route.fulfill({json:d});
 }return route.fulfill({json:{decisions}});}
 if(url.endsWith('/rankings'))return route.fulfill({json:{id:'run',created_at:'2026-11-18T00:00:00Z',stale:false,snapshot:{result:{rows}}}});
 return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/decision');
 await page.getByLabel('Decision',{exact:true}).selectOption('alternative');await page.getByLabel('Eligible supplier').selectOption(rows[1].id);
 await page.getByRole('checkbox').check();await expect(page.getByRole('button',{name:'Confirm Decision'})).toBeDisabled();
 await page.getByLabel('Decision reason').fill('Better service support');await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Confirm Decision'}).click();await expect(page.getByRole('alert')).toContainText('Retry confirmation');
 await page.getByRole('button',{name:'Confirm Decision'}).click();expect(requests[0]).toBe(requests[1]);
 await expect(page.getByRole('heading',{name:'Alternative supplier approved — version 1'})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm Decision'})).toHaveCount(0);
 await page.getByRole('button',{name:'Create a decision revision'}).click();await page.getByLabel('Decision',{exact:true}).selectOption('defer');await page.getByLabel('Decision reason').fill('Await budget');await page.getByLabel('Revision reason').fill('Funding changed');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm Decision'}).click();
 await expect(page.getByText('No supplier was awarded.')).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Purchase deferred — version 2'})).toBeVisible();
 await page.getByText('Decision history (2)').click();await expect(page.getByRole('heading',{name:'Version 1: Alternative supplier approved'})).toBeVisible();
 await page.screenshot({path:'test-results/decision.png',fullPage:true});
});

for(const width of [1440,320])test(`saved decision summary and actions fit ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const supplier=`Synthetic supplier ${'LongName'.repeat(10)}`,actor=`Synthetic approver ${'LongIdentity'.repeat(8)}`,reason='Synthetic decision rationale.';
 const created='2026-11-18T00:00:00Z',rows=[{id:'a',name:supplier,rank:1,score:'0.987654'}];
 let decisionStale=false,rankingStale=false,writes=0;
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/decisions'))return route.fulfill({json:{decisions:[{id:'d2',ranking_id:'run',version:2,stale:decisionStale,actor,created_at:created,snapshot:{action:'approve',supplier:rows[0],reason,revision_reason:'New information'}},{id:'d1',ranking_id:'run',version:1,stale:false,actor:'Earlier approver',created_at:'2026-11-17T00:00:00Z',snapshot:{action:'defer',supplier:null,reason:'Earlier reason',revision_reason:''}}]}});
  if(path.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale:rankingStale,snapshot:{result:{rows}}}});
  if(path.endsWith('/report'))return route.fulfill({json:reportFixture});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/decision');
 await expect(page.getByRole('heading',{name:'Final Purchasing Decision',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Decision overview',exact:true})).toBeVisible();
 const summary=page.locator('.decision-summary');
 await expect(summary.getByRole('heading',{name:'Recommended supplier approved — version 2'})).toBeVisible();
 await expect(summary.locator('dt')).toHaveText(['Selected supplier','Decision reason','Confirmed by','Confirmed on']);
 const time=await page.evaluate(value=>new Date(value).toLocaleString(),created);
 await expect(summary.locator('dd')).toHaveText([supplier,reason,actor,time]);
 await expect(page.getByText('This historical decision needs review because the evaluation has changed.')).toHaveCount(0);
 expect(await summary.evaluate(el=>{const r=el.getBoundingClientRect();return getComputedStyle(el).borderTopStyle==='solid'&&el.scrollWidth<=el.clientWidth&&r.left>=0&&r.right<=innerWidth;})).toBe(true);
 const report=page.getByRole('button',{name:'View Decision Report'}),revision=page.getByRole('button',{name:'Create a decision revision'}),history=page.getByText('Decision history (2)',{exact:true});
 await expect(report).toBeEnabled();await expect(revision).toBeEnabled();
 await report.focus();expect(await report.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Tab');await expect(revision).toBeFocused();
 await page.keyboard.press('Tab');await expect(history).toBeFocused();expect(await history.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Version 1: Purchase deferred'})).toBeVisible();
 await expect(page.getByText('Earlier reason',{exact:true})).toBeVisible();await expect(page.getByText('Earlier approver',{exact:false})).toBeVisible();
 const layout=await page.locator('.decision-page').evaluate(el=>{
  const rects=['.decision-summary','.decision-report-action','.decision-revision-action','.decision-history','.decision-navigation'].map(selector=>el.querySelector(selector)!.getBoundingClientRect());
  return rects.every((rect,i)=>i===0||rects[i-1].bottom<=rect.top);
 });
 expect(layout).toBe(true);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:`test-results/decision-layout-${width}.png`,fullPage:true});
 decisionStale=true;await page.reload();
 await expect(page.getByText('This historical decision needs review because the evaluation has changed.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Create a decision revision'})).toBeEnabled();
 rankingStale=true;await page.reload();
 await expect(page.getByRole('alert')).toContainText('Rankings are out of date.');
 await expect(page.getByRole('button',{name:'Create a decision revision'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'View Decision Report'})).toBeEnabled();
 await page.getByRole('button',{name:'View Decision Report'}).click();await expect(page).toHaveURL(/projects\/p1\/reports\/d2$/);
 await page.getByRole('button',{name:'Back to Decision'}).click();await page.getByRole('button',{name:'Back to Rankings'}).click();await expect(page).toHaveURL(/projects\/p1\/rankings$/);
 expect(writes).toBe(0);
});

test('officers see the saved deferred decision without a revision action',async({page})=>{
 await page.route('**/api/auth/session',route=>route.fulfill({json:{user:{id:'o1',username:'officer',display_name:'Officer',role:'officer',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},csrf_token:'a'.repeat(64),setup_required:false}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET')return route.abort();
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/decisions'))return route.fulfill({json:{decisions:[{id:'d1',ranking_id:'run',version:1,stale:false,actor:'Approver',created_at:'2026-11-18T00:00:00Z',snapshot:{action:'defer',supplier:null,reason:'Await budget',revision_reason:''}}]}});
  if(path.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale:false,snapshot:{result:{rows:[{id:'a',name:'A',rank:1,score:'1'}]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/decision');
 await expect(page.getByRole('heading',{name:'Purchase deferred — version 1'})).toBeVisible();
 await expect(page.getByText('No supplier was awarded.')).toBeVisible();
 await expect(page.getByText('An Approver or Administrator must confirm the final decision.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Create a decision revision'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Confirm Decision'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'View Decision Report'})).toBeEnabled();
});

test('decision summary shows an absent reason without altering recorded reasons',async({page})=>{
 const actor='Historical Approver',created='2026-11-18T00:00:00Z',recorded='  Synthetic explanation\nwith details.  ';
 let reason='',writes=0;
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/decisions'))return route.fulfill({json:{decisions:[{id:'d1',ranking_id:'run',version:1,stale:false,actor,created_at:created,snapshot:{action:'approve',supplier:{name:'Synthetic Supplier',rank:1,score:'0.8'},reason,revision_reason:''}}]}});
  if(path.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale:false,snapshot:{result:{rows:[{id:'a',name:'Synthetic Supplier',rank:1,score:'0.8'}]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 for(const width of [1440,320]){
  await page.setViewportSize({width,height:800});
  for(const value of ['',recorded]){
   reason=value;await page.goto('/#/projects/p1/decision');await page.reload();
   const summary=page.locator('.decision-summary');
   await expect(summary.locator('dt')).toHaveText(['Selected supplier','Decision reason','Confirmed by','Confirmed on']);
   await expect(summary.locator('dd').nth(1)).toHaveText(value||'Not recorded');
   expect(await summary.locator('dd').nth(1).textContent()).toBe(value||'Not recorded');
   await expect(summary.locator('dd').nth(2)).toHaveText(actor);
   const time=await page.evaluate(value=>new Date(value).toLocaleString(),created);await expect(summary.locator('dd').nth(3)).toHaveText(time);
   expect(await summary.evaluate(el=>{
    const bounds=el.getBoundingClientRect(),rows=Array.from(el.querySelectorAll('dl > div')).map(row=>row.getBoundingClientRect());
    return el.scrollWidth<=el.clientWidth&&rows.every((r,i)=>r.left>=bounds.left&&r.right<=bounds.right&&rows.slice(i+1).every(other=>r.right<=other.left||other.right<=r.left||r.bottom<=other.top||other.bottom<=r.top));
   })).toBe(true);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
 }
 expect(writes).toBe(0);
});
