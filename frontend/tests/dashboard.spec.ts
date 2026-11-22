import {test,expect} from './fixtures';
test('dashboard real totals, status filtering, search, pagination and workflow navigation',async({page})=>{
 const statuses=['Approved','Deferred','Needs review','Draft','In progress','Ready to evaluate','Evaluated'];
 const items=Array.from({length:14},(_,i)=>({id:'p'+i,name:'Project '+i,reference:'P'+i,category:i===0?'Hardware':'Other',currency:'USD',status:'Draft',workflow_status:statuses[i%7],workflow_stage:i===0?'Decision':'Criteria',supplier_count:3,updated_at:'2026-11-18T00:00:00Z',last_activity_at:'2026-11-18T00:00:00Z',resume_path:'/projects/p'+i+'/decision',decision_id:i===0?'d1':null}));
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/rankings'))return route.fulfill({json:{id:'r1',stale:false,snapshot:{result:{rows:[{id:'s1',name:'Supplier A',rank:1,score:'0.8'},{id:'s2',name:'Supplier B',rank:2,score:'0.2'}]}}}});
 if(url.endsWith('/decisions'))return route.fulfill({json:{decisions:[]}});
 if(/\/api\/projects$/.test(url))return route.fulfill({json:items});
 return route.fulfill({json:items[0]});
 });
 await page.goto('/#/dashboard');await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'All projects 14',exact:true})).toBeVisible();await expect(page.getByText('Supplier entries',{exact:true}).locator('..')).toContainText('42');
 await page.getByRole('button',{name:'Approved 2',exact:true}).click();await expect(page.getByLabel('Filter projects by status')).toHaveValue('Approved');await expect(page.locator('tbody tr')).toHaveCount(2);
 await page.getByRole('button',{name:'Clear filters'}).click();await expect(page.locator('tbody tr')).toHaveCount(6);await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('2 / 3',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();await page.getByLabel('Search projects',{exact:true}).fill('Hardware');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('Approved');
 await page.getByLabel('Search projects',{exact:true}).fill('no matching record');await expect(page.getByText('No matching projects',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
 await page.getByRole('button',{name:'Continue Workflow',exact:true}).first().click();await expect(page).toHaveURL(/projects\/p0\/decision/);
});


test('dashboard unavailable state does not invent zero totals and retry recovers',async({page})=>{
 let fail=true;
 await page.route('**/api/projects',route=>fail?route.fulfill({status:503,json:{detail:'Saved project storage unavailable'}}):route.fulfill({json:[]}));
 await page.goto('/#/dashboard');await expect(page.getByRole('alert')).toContainText('storage unavailable');
 await expect(page.getByRole('button',{name:'All projects 0',exact:true})).toHaveCount(0);
 fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('button',{name:'All projects 0',exact:true})).toBeVisible();
 await expect(page.getByText('No saved projects yet.',{exact:false})).toBeVisible();
});


test('backend outage explains server availability and retry restores saved counts',async({page})=>{
 let failure='gateway';
 await page.route('**/api/projects',route=>{
 if(failure==='gateway')return route.fulfill({status:500,contentType:'text/plain',body:'Internal proxy error'});
 if(failure==='network')return route.abort('connectionrefused');
 return route.fulfill({json:[]});
 });
 await page.goto('/#/dashboard');
 await expect(page.getByRole('alert')).toContainText('server is temporarily unavailable');
 await expect(page.getByRole('alert')).not.toContainText('check your entries');
 await expect(page.getByRole('button',{name:'All projects 0',exact:true})).toHaveCount(0);
 failure='network';await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Could not reach the server');
 failure='';await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('button',{name:'All projects 0',exact:true})).toBeVisible();
});

for(const width of [1440,320])test(`recent activity table remains readable and accessible at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const longName=`Synthetic Purchasing Project ${'LongIdentifier'.repeat(10)}`,stamp='2026-11-18T00:00:00Z',updated='2026-11-17T00:00:00Z';
 const items=Array.from({length:7},(_,i)=>({id:`p${i}`,name:i===0?longName:`Synthetic Project ${i}`,reference:`PRJ-${i}`,status:'Draft',workflow_status:i===0?'Needs review':'Approved',workflow_stage:i===0?'Review purchasing decision':'Decision',supplier_count:3,updated_at:updated,last_activity_at:i===0?stamp:undefined,resume_path:`/projects/p${i}/decision`,decision_id:i===0?'d0':null}));
 let writes=0;
 await page.route('**/api/projects**',route=>{if(route.request().method()!=='GET'){writes++;return route.abort();}return route.fulfill({json:new URL(route.request().url()).pathname==='/api/projects'?items:items[0]});});
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.goto('/#/dashboard');
 const table=page.getByRole('region',{name:'Recent project activity table'}),rows=table.locator('tbody tr'),row=rows.first(),project=row.locator('td').first();
 const hint=page.getByText('Scroll horizontally to see more project activity and actions.');
 if(width===320){await expect(hint).toBeVisible();await expect(table).toHaveAttribute('aria-describedby','dashboard-activity-hint');}
 else{await expect(hint).toHaveCount(0);await expect(table).not.toHaveAttribute('aria-describedby');}
 await expect(rows).toHaveCount(6);
 await expect(rows.locator('td:first-child strong')).toHaveText(items.slice(0,6).map(item=>item.name));
 await expect(project.locator('small')).toHaveText('PRJ-0');
 await expect(row.locator('td').nth(1)).toHaveText('Needs review');await expect(row.locator('td').nth(2)).toHaveText('Review purchasing decision');
 const dates=await page.evaluate(values=>values.map(value=>new Date(value).toLocaleString()),[stamp,updated]);
 await expect(row.locator('td').nth(3)).toHaveText(dates[0]);await expect(rows.nth(1).locator('td').nth(3)).toHaveText(dates[1]);
 await expect(rows.nth(1).getByRole('button',{name:'Saved Report'})).toHaveCount(0);
 expect(await project.evaluate(el=>{const name=el.querySelector('strong')!.getBoundingClientRect(),reference=el.querySelector('small')!.getBoundingClientRect();return name.bottom<=reference.top&&el.scrollWidth<=el.clientWidth;})).toBe(true);
 expect(await row.locator('td').evaluateAll(cells=>cells.every(cell=>cell.scrollWidth<=cell.clientWidth&&getComputedStyle(cell).borderBottomStyle==='solid'))).toBe(true);
 for(const [cell,word] of [[project.locator('strong'),'Purchasing'],[row.locator('td').nth(2),'purchasing'],[row.locator('td').nth(3),dates[0].split(' ')[0]]] as const){
  expect(await cell.evaluate((el,text)=>{const node=el.firstChild,start=(node?.textContent||'').indexOf(text);if(!node||start<0)return false;const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+text.length);return range.getClientRects().length===1;},word)).toBe(true);
 }
 const before=await project.boundingBox();expect(before).not.toBeNull();
 expect(await project.evaluate(el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor,z:Number(getComputedStyle(el).zIndex)}))).toEqual({position:'sticky',background:'rgb(255, 255, 255)',z:2});
 expect(await table.getByRole('columnheader',{name:'Project',exact:true}).evaluate(el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor,z:Number(getComputedStyle(el).zIndex)}))).toEqual({position:'sticky',background:'rgb(239, 244, 255)',z:3});
 await table.screenshot({path:`test-results/dashboard-activity-left-${width}.png`});
 await table.focus();expect(await table.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 if(await table.evaluate(el=>el.scrollWidth>el.clientWidth)){
  await page.keyboard.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await table.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  await expect.poll(()=>table.evaluate(el=>el.scrollWidth-el.clientWidth-el.scrollLeft)).toBeLessThanOrEqual(1);
 }
 const after=await project.boundingBox();expect(after).not.toBeNull();expect(Math.abs(after!.x-before!.x)).toBeLessThanOrEqual(1);
 await table.screenshot({path:`test-results/dashboard-activity-right-${width}.png`});
 await table.focus();await page.keyboard.press('Tab');
 for(const name of ['Continue Workflow','Saved Report']){
  const button=row.getByRole('button',{name,exact:true});await expect(button).toBeFocused();
  const geometry=await button.evaluate(el=>{const table=el.closest('.table-scroll')!.getBoundingClientRect(),project=el.closest('tr')!.querySelector('td')!.getBoundingClientRect(),button=el.getBoundingClientRect();return {visible:button.left>=project.right-1&&button.right<=table.right+1,focus:getComputedStyle(el).outlineStyle,content:el.scrollWidth<=el.clientWidth};});
  expect(geometry.visible,`${name}: ${JSON.stringify(geometry)}`).toBe(true);expect(geometry.focus).not.toBe('none');expect(geometry.content).toBe(true);
  if(name==='Continue Workflow')await page.keyboard.press('Tab');
 }
 expect(await row.locator('.dashboard-activity-actions').evaluate(el=>{const buttons=Array.from(el.querySelectorAll('button'),b=>b.getBoundingClientRect());return buttons[0].bottom<=buttons[1].top;})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await row.getByRole('button',{name:'Saved Report'}).click();await expect(page).toHaveURL(/projects\/p0\/reports\/d0$/);
 expect(writes).toBe(0);
});

test('activity scrolling hint follows viewport and table content changes',async({page})=>{
 await page.setViewportSize({width:1440,height:850});
 const stamp='2026-11-18T00:00:00Z';
 let items:{id:string;name:string;reference:string;status:string;updated_at:string}[]=[];
 await page.route('**/api/projects**',route=>route.fulfill({json:items}));
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.goto('/#/dashboard');
 const hint=page.getByText('Scroll horizontally to see more project activity and actions.'),table=page.getByRole('region',{name:'Recent project activity table'});
 await expect(page.getByText('No saved projects yet.',{exact:false})).toBeVisible();await expect(hint).toHaveCount(0);
 items=[{id:'p1',name:'Synthetic project',reference:'P1',status:'Draft',updated_at:stamp}];
 await page.getByRole('button',{name:'Refresh dashboard'}).click();await expect(table).toBeVisible();await expect(hint).toHaveCount(0);
 await page.setViewportSize({width:320,height:850});await expect(hint).toBeVisible();await expect(table).toHaveAttribute('aria-describedby','dashboard-activity-hint');
 await page.setViewportSize({width:1440,height:850});await expect(hint).toHaveCount(0);await expect(table).not.toHaveAttribute('aria-describedby');
 await page.addStyleTag({content:'.dashboard .dashboard-activity table:has(#synthetic-wide-content) {min-width:1800px}'});
 await table.locator('tbody tr td:last-child').evaluate(cell=>{const content=document.createElement('span');content.id='synthetic-wide-content';cell.append(content);});
 await expect.poll(()=>table.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await expect(hint).toBeVisible();
 await page.locator('#synthetic-wide-content').evaluate(el=>el.remove());
 await expect.poll(()=>table.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(hint).toHaveCount(0);
 items=[];await page.getByRole('button',{name:'Refresh dashboard'}).click();await expect(table).toHaveCount(0);await expect(hint).toHaveCount(0);
 items=[{id:'p2',name:'Another synthetic project',reference:'P2',status:'Draft',updated_at:stamp}];
 await page.setViewportSize({width:320,height:850});await page.getByRole('button',{name:'Refresh dashboard'}).click();await expect(table).toBeVisible();await expect(hint).toBeVisible();
});
