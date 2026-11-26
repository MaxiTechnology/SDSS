import {test,expect} from './fixtures';
test('rankings calculate from a saved matrix and flag stale snapshots',async({page})=>{
 let stale=false,fail=true;
 const matrix={entries:{a:{x:'3'},b:{x:'1'}},suppliers:[{id:'a',name:'A'},{id:'b',name:'B'}],criteria:[{id:'x',name:'Quality',unit:'points',direction:'benefit',minimum:null,maximum:null}],context:'x'.repeat(64),revision:1,ready:true,needs_review:false};
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/matrix'))return route.fulfill({json:matrix});
 if(url.endsWith('/rankings')){
 if(route.request().method()==='POST'&&fail){fail=false;return route.fulfill({status:503,json:{detail:'Please retry'}});}
 return route.fulfill({json:{id:'run',created_at:'2026-11-17T10:00:00Z',stale,snapshot:{method:'TOPSIS',result:{rows:[{id:'a',name:'A',score:'1',rank:1},{id:'b',name:'B',score:'0',rank:2}]}}}});
 }
 return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD',status:'Draft'}});
 });
 await page.goto('/#/projects/p1/matrix');
 await page.getByRole('button',{name:'Calculate Rankings'}).click();await expect(page.getByRole('alert')).toContainText('Please retry');
 await page.getByRole('button',{name:'Calculate Rankings'}).click();await expect(page.getByText('Highest scoring supplier: A.',{exact:false})).toBeVisible();
 await expect(page.getByRole('cell',{name:'1.000000',exact:true})).toBeVisible();
 await page.getByText('View Calculation Details').click();await expect(page.locator('pre')).toContainText('TOPSIS');
 stale=true;await page.reload();await expect(page.getByRole('alert')).toContainText('out of date');
 await page.screenshot({path:'test-results/rankings.png',fullPage:true});
});

for(const width of [1440,320])test(`ranking results stay readable and navigable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const stamp='2026-11-17T10:00:00Z',name=`Synthetic supplier ${'LongName'.repeat(12)}`;
 let stale=false,writes=0;
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(route.request().url().endsWith('/rankings'))return route.fulfill({json:{id:'r1',created_at:stamp,stale,snapshot:{method:'TOPSIS',criteria:[],weights:{},result:{rows:[{id:'a',name,score:'0.98765449',rank:1},{id:'b',name:'Supplier B',score:'0.98765449',rank:1},{id:'c',name:'Supplier C',score:'0.12345678',rank:3}]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/rankings');
 await expect(page.getByRole('heading',{name:'Supplier Rankings',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Ranking results',exact:true})).toBeVisible();
 await expect(page.getByText('The highest score is tied. No single supplier is recommended.',{exact:true})).toBeVisible();
 const time=await page.evaluate(value=>new Date(value).toLocaleString(),stamp);
 await expect(page.getByText(`Calculated ${time}. Scores range from 0 to 1; higher is better.`,{exact:true})).toBeVisible();
 const table=page.getByRole('region',{name:'Supplier rankings table'}),rows=table.getByRole('row');
 await expect(rows).toHaveCount(4);await expect(rows.nth(1)).toContainText(name);
 await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('1');await expect(rows.nth(1).getByRole('cell').nth(2)).toHaveText('0.987654');
 await expect(rows.nth(2).getByRole('cell').nth(0)).toHaveText('1');await expect(rows.nth(3).getByRole('cell').nth(0)).toHaveText('3');await expect(rows.nth(3).getByRole('cell').nth(2)).toHaveText('0.123457');
 expect(await rows.nth(1).evaluate(el=>{const cells=Array.from(el.querySelectorAll('td'));return {contained:cells.every(c=>c.scrollWidth<=c.clientWidth),nameWrap:getComputedStyle(cells[1]).whiteSpace,rankAlign:getComputedStyle(cells[0]).textAlign,scoreAlign:getComputedStyle(cells[2]).textAlign,separator:getComputedStyle(cells[1]).borderBottomStyle};})).toEqual({contained:true,nameWrap:'normal',rankAlign:'right',scoreAlign:'right',separator:'solid'});
 await table.focus();expect(await table.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Tab');const summary=page.getByText('View Calculation Details',{exact:true});await expect(summary).toBeFocused();
 expect(await summary.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Enter');const details=page.locator('.rankings-details pre');await expect(details).toContainText('TOPSIS');
 await page.keyboard.press('Tab');await expect(details).toBeFocused();
 await page.keyboard.press('Tab');const generate=page.getByRole('button',{name:'Generate AI Recommendation'});await expect(generate).toBeFocused();
 await page.keyboard.press('Tab');const back=page.getByRole('button',{name:'Back to Matrix'});await expect(back).toBeFocused();
 await page.keyboard.press('Tab');const analysis=page.getByRole('button',{name:'Run Sensitivity Analysis'});await expect(analysis).toBeFocused();
 await page.keyboard.press('Tab');const next=page.getByRole('button',{name:'Continue to Final Decision'});await expect(next).toBeFocused();
 expect(await next.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 const layout=await page.locator('.rankings-page').evaluate(el=>{
  const sections=['.rankings-summary','.table-scroll','.rankings-details','.rankings-navigation','.rankings-analysis','.rankings-continuation'].map(s=>el.querySelector(s)!.getBoundingClientRect());
  return sections.every((rect,i)=>i===0||sections[i-1].bottom<=rect.top);
 });
 expect(layout).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:`test-results/rankings-layout-${width}.png`,fullPage:true});
 await analysis.click();await expect(page).toHaveURL(/projects\/p1\/sensitivity$/);
 stale=true;await page.goto('/#/projects/p1/rankings');
 await expect(page.getByRole('alert')).toContainText('These rankings are out of date.');
 await expect(page.getByText('The highest score is tied. No single supplier is recommended.',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Run Sensitivity Analysis'})).toBeDisabled();await expect(page.getByRole('button',{name:'Continue to Final Decision'})).toBeDisabled();
 await page.getByRole('button',{name:'Back to Matrix'}).click();await expect(page).toHaveURL(/projects\/p1\/matrix$/);
 expect(writes).toBe(0);
});

test('AI recommendation retries failures and retains only current rankings without repeated requests',async({page})=>{
 let stale=false,fail=true,requests=0,rankingId='r1';
 await page.route('**/api/projects**',async route=>{
  const url=route.request().url();
  if(url.endsWith('/rankings/recommendation')){
   requests++;
   if(fail){fail=false;return route.fulfill({status:503,json:{detail:'AI is temporarily unavailable. TOPSIS remains available.'}});}
   return route.fulfill({json:{
    ranking_id:rankingId,ranking_stale:false,recommendation_type:'supplier',
    recommended_supplier:'Supplier A',ranking_position:1,topsis_score:'0.800000',
    next_best_supplier:'Supplier B',next_best_score:'0.600000',
    key_reasons:['Supplier A has higher Quality than Supplier B.'],
    supplier_comparison:'Supplier A performs better on Quality. Supplier B performs better on Price. Quality has greater approved importance.',
    decision:'Consider Supplier A for selection based on its stronger performance on Quality.'
   }});
  }
  if(url.endsWith('/rankings'))return route.fulfill({json:{id:rankingId,created_at:'2026-11-17T10:00:00Z',stale,snapshot:{method:'TOPSIS',result:{rows:[{id:'a',name:'Supplier A',score:'0.8',rank:1},{id:'b',name:'Supplier B',score:'0.6',rank:2}]}}}});
  if(url.endsWith('/matrix'))return route.fulfill({json:{entries:{a:{x:'3'},b:{x:'1'}},suppliers:[{id:'a',name:'Supplier A'},{id:'b',name:'Supplier B'}],criteria:[{id:'x',name:'Quality',unit:'points',direction:'benefit'}],context:'x'.repeat(64),revision:1,ready:true,needs_review:false}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/projects/p1/rankings');
 await expect(page.getByRole('heading',{name:'AI Recommendation',exact:true})).toBeVisible();
 await expect(page.getByText('AI recommendations support decision-making. Final supplier selection remains with the authorized decision-maker.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Generate AI Recommendation'}).click();
 await expect(page.getByRole('alert')).toContainText('AI is temporarily unavailable');
 await page.getByRole('button',{name:'Try Again'}).click();
 await expect(page.getByRole('heading',{name:'Recommended Supplier',exact:true})).toBeVisible();
 await expect(page.getByText('Supplier A',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('TOPSIS score: 0.800000',{exact:true}).or(page.getByText('TOPSIS score: 0.800000',{exact:false}))).toBeVisible();
 await expect(page.getByRole('heading',{name:'Key Reasons for Recommendation',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Supplier Comparison and Trade-offs',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Recommended Decision',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Generate AI Recommendation'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Regenerate Recommendation'})).toHaveCount(0);
 await expect(page.getByText(/Supplier B performs better on Price/)).toBeVisible();
 const explanations=page.locator('.ai-recommendation-content section').filter({hasNot:page.getByRole('heading',{name:'Recommended Supplier'})});
 await expect(explanations).toHaveCount(3);
 for(const section of await explanations.all())expect(await section.innerText()).not.toMatch(/TOPSIS|normalized|score|0\.\d{4,}/i);
 await page.screenshot({path:'test-results/rankings-ai-desktop.png',fullPage:true});
 await page.setViewportSize({width:320,height:800});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:'test-results/rankings-ai-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Back to Matrix'}).click();
 await expect(page.getByRole('heading',{name:'Supplier values'})).toBeVisible();
 await page.evaluate(()=>location.hash='/projects/p1/rankings');
 await expect(page.getByText('Consider Supplier A for selection based on its stronger performance on Quality.',{exact:true})).toBeVisible();
 expect(requests).toBe(2);
 stale=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('alert')).toContainText('out of date');
 await expect(page.locator('.ai-recommendation-content')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Generate AI Recommendation'})).toBeDisabled();
 stale=false;rankingId='r2';
 await page.getByRole('button',{name:'Back to Matrix'}).click();
 await expect(page.getByRole('heading',{name:'Supplier values'})).toBeVisible();
 await page.evaluate(()=>location.hash='/projects/p1/rankings');
 await expect(page.getByRole('button',{name:'Generate AI Recommendation'})).toBeEnabled();
 await page.getByRole('button',{name:'Generate AI Recommendation'}).click();
 await expect(page.locator('.ai-recommendation-content')).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue to Final Decision'})).toBeEnabled();
 await page.reload();
 await expect(page.locator('.ai-recommendation-content')).toBeVisible();
 await expect(page.getByRole('button',{name:'Generate AI Recommendation'})).toHaveCount(0);
 expect(requests).toBe(3);
 await page.route('**/api/auth/logout',route=>route.fulfill({json:{ok:true}}));
 await page.getByRole('button',{name:'Sign Out'}).click();
 await expect(page.getByRole('heading',{name:'Sign in to SSDSS'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('sdss-recommendations:')))).toEqual([]);
 await page.evaluate(()=>sessionStorage.setItem('sdss-recommendations:old-user','[]'));
 await page.route('**/api/auth/session',route=>route.fulfill({json:{user:null,csrf_token:null,setup_required:false}}));
 await page.reload();
 await expect(page.getByRole('heading',{name:'Sign in to SSDSS'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('sdss-recommendations:')))).toEqual([]);
});

test('a concurrent ranking change disables retry until rankings are recalculated',async({page})=>{
 await page.route('**/api/projects**',route=>{
  const url=route.request().url();
  if(url.endsWith('/rankings/recommendation'))return route.fulfill({status:409,json:{detail:'The ranking changed while AI was responding.'}});
  if(url.endsWith('/rankings'))return route.fulfill({json:{id:'r1',created_at:'2026-11-17T10:00:00Z',stale:false,snapshot:{method:'TOPSIS',result:{rows:[{id:'a',name:'Supplier A',score:'0.8',rank:1},{id:'b',name:'Supplier B',score:'0.6',rank:2}]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/rankings');
 await page.getByRole('button',{name:'Generate AI Recommendation'}).click();
 await expect(page.getByRole('alert').filter({hasText:'ranking changed while AI'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Try Again'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Continue to Final Decision'})).toBeDisabled();
});

test('tied AI recommendation does not select one supplier',async({page})=>{
 await page.route('**/api/projects**',route=>{
  const url=route.request().url();
  if(url.endsWith('/rankings/recommendation'))return route.fulfill({json:{
   ranking_id:'r1',ranking_stale:false,recommendation_type:'tie',
   recommended_supplier:null,ranking_position:null,topsis_score:null,
   next_best_supplier:'Supplier B',next_best_score:'0.700000',
   key_reasons:['The highest-ranking suppliers share equal scores.'],
   supplier_comparison:'The tied leaders should be compared using the same saved evaluation evidence.',
   decision:'No single supplier should be selected automatically from the tie.'
  }});
  if(url.endsWith('/rankings'))return route.fulfill({json:{id:'r1',created_at:'2026-11-17T10:00:00Z',stale:false,snapshot:{method:'TOPSIS',result:{rows:[{id:'a',name:'Supplier A',score:'0.7',rank:1},{id:'b',name:'Supplier B',score:'0.7',rank:1}]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/rankings');
 await page.getByRole('button',{name:'Generate AI Recommendation'}).click();
 await expect(page.getByText('Tied result:',{exact:false}).first()).toBeVisible();
 await expect(page.getByText(/No single supplier is recommended/).last()).toBeVisible();
 await expect(page.locator('.ai-recommendation-content').getByText(/Supplier A.*Ranking position: 1; TOPSIS score: 0.700000/)).toBeVisible();
 await expect(page.locator('.ai-recommendation-content').getByText(/Supplier B.*Ranking position: 1; TOPSIS score: 0.700000/)).toBeVisible();
});

test('approvers can continue from rankings without the preparation-only analysis action',async({page})=>{
 await page.route('**/api/auth/session',route=>route.fulfill({json:{user:{id:'a1',username:'approver',display_name:'Approver',role:'approver',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},csrf_token:'a'.repeat(64),setup_required:false}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET')return route.abort();
  if(route.request().url().endsWith('/rankings'))return route.fulfill({json:{id:'r1',created_at:'2026-11-17T10:00:00Z',stale:false,snapshot:{method:'TOPSIS',result:{rows:[{id:'a',name:'Supplier A',score:'0.8',rank:1}]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/rankings');
 await expect(page.getByText('Highest scoring supplier: Supplier A. Final approval is still required.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Run Sensitivity Analysis'})).toHaveCount(0);
 const next=page.getByRole('button',{name:'Continue to Final Decision'});await expect(next).toBeEnabled();await next.click();await expect(page).toHaveURL(/projects\/p1\/decision$/);
});
