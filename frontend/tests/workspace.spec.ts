import {test,expect} from './fixtures';
const stamp='2026-11-19T00:00:00Z';
const projects=[{id:'p1',name:'Source project',reference:'PRJ-ONE',currency:'USD',updated_at:stamp,supplier_count:2,criteria_revision:1,weight_revision:1,weights_approved:true,weight_method:'manual',criteria_count:2},{id:'p2',name:'Target project',reference:'PRJ-TWO',currency:'USD',updated_at:stamp,supplier_count:2,criteria_revision:0,weight_revision:0,weights_approved:false,weight_method:null,criteria_count:0}];
const configuration={criteria:[{id:'price',name:'Price',unit:'USD',direction:'cost',selected:true,minimum:'0',maximum:null},{id:'quality',name:'Quality',unit:'points',direction:'benefit',selected:true,minimum:'0',maximum:'100'}],mandatory_checks:[{id:'cert',name:'Certificate',requirement:'Synthetic accepted document'}],maximum_price:'150'};
const template={id:'t1',name:'Reusable criteria',notes:'Synthetic template',currency:'USD',configuration,weights:{price:'50.00',quality:'50.00'},source_project_id:'p1',source_revision:1,version:1,active:true,actor:'Fixture Administrator',created_at:stamp,updated_at:stamp};
const supplier={id:'s1',project_id:'p1',name:'Alpha Supplier',location:'Synthetic location',description:'Original details',updated_at:stamp,project_name:'Source project',reference:'PRJ-ONE'};
const evaluation={...projects[0],workflow_status:'Approved',workflow_stage:'Decision',resume_path:'/projects/p1/decision',last_activity_at:stamp,evaluation_current:true,calculation:{id:'r1',created_at:stamp,rows:[{id:'s1',name:'Alpha Supplier',rank:1,score:'0.8'}]}};
const report={id:'d1',project_id:'p1',project_name:'Source project',reference:'PRJ-ONE',version:2,actor:'Approver Fixture',created_at:stamp,action:'approve',selected_supplier:'Alpha Supplier',reason:'Fixture decision',latest_saved:true};

test('workspace navigation, supplier search/copy, evaluation filters and versioned PDF retry',async({page})=>{
 let copied:any=null,pdfFail=true;
 await page.route('**/api/projects',r=>r.fulfill({json:[]}));
 await page.route('**/api/workspace/**',r=>{const path=new URL(r.request().url()).pathname;if(path.endsWith('/suppliers'))return r.fulfill({json:{projects,suppliers:copied?[supplier,{...supplier,...copied,id:'copy',project_id:'p2',project_name:'Target project',reference:'PRJ-TWO'}]:[supplier]}});if(path.endsWith('/evaluations'))return r.fulfill({json:{projects:[evaluation,{...evaluation,...projects[1],workflow_status:'Draft',calculation:null,evaluation_current:false}]}});if(path.endsWith('/reports'))return r.fulfill({json:{projects,reports:[report,{...report,id:'old',version:1,latest_saved:false}]}});return r.fulfill({json:{projects,templates:[template]}});});
 await page.route('**/api/projects/p2/suppliers',r=>{copied=r.request().postDataJSON();return r.fulfill({status:201,json:{...copied,project_id:'p2',updated_at:stamp}});});
 await page.route('**/report.pdf',r=>{if(pdfFail){pdfFail=false;return r.fulfill({status:503,json:{detail:'PDF storage temporarily unavailable'}});}return r.fulfill({contentType:'application/pdf',body:'%PDF-1.4 synthetic fixture'});});
 await page.goto('/#/');const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Suppliers',exact:true}).click();await expect(page.getByRole('cell',{name:'Alpha Supplier',exact:false})).toBeVisible();await page.getByLabel('Search suppliers',{exact:true}).fill('missing');await expect(page.getByText('No supplier entries match these filters.')).toBeVisible();await page.getByLabel('Search suppliers',{exact:true}).fill('Alpha');
 await page.getByRole('button',{name:'Copy to Project',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Destination project',{exact:true}).selectOption('p2');await expect(dialog.getByLabel('Supplier description',{exact:true})).toHaveValue('Original details');await dialog.getByRole('button',{name:'Save Supplier Entry',exact:true}).click();await expect(dialog).not.toBeVisible();expect(copied.name).toBe('Alpha Supplier');expect(copied).not.toHaveProperty('checks');await expect(page.getByRole('status').filter({hasText:'Supplier entry saved.'})).toBeVisible();
 await nav.getByRole('button',{name:'Evaluations',exact:true}).click();await expect(page.getByRole('region',{name:'Workspace evaluations table'})).toContainText('Current calculation');await page.getByLabel('Filter evaluations by calculation',{exact:true}).selectOption('no');await expect(page.getByRole('region',{name:'Workspace evaluations table'}).getByRole('row')).toHaveCount(2);
 await nav.getByRole('button',{name:'Reports',exact:true}).click();await expect(page.getByRole('region',{name:'Workspace reports table'}).getByRole('row')).toHaveCount(2);await page.getByLabel('Latest saved version per project').uncheck();await expect(page.getByRole('region',{name:'Workspace reports table'}).getByRole('row')).toHaveCount(3);await page.getByLabel('Latest saved version per project').check();await page.getByRole('button',{name:'Download PDF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('temporarily unavailable');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();expect((await download).suggestedFilename()).toBe('SSDSS-decision-d1-v2.pdf');await page.getByRole('button',{name:'Open Saved Report',exact:true}).click();await expect(page).toHaveURL(/projects\/p1\/reports\/d1/);
});

test('criteria templates preserve capture retries, preview confirmation and application identity',async({page})=>{
 let templates:any[]=[],captureFail=true,applyFail=true,ids:string[]=[],appliedIds:string[]=[];
 await page.route('**/api/workspace/templates**',async r=>{
  const path=new URL(r.request().url()).pathname,method=r.request().method();
  if(path.endsWith('/preview'))return r.fulfill({json:{project_id:'p2',project_name:'Target project',project_updated_at:stamp,criteria_revision:0,weight_revision:0,template}});
  if(path.endsWith('/apply')){const body=r.request().postDataJSON();appliedIds.push(body.id);expect(body.confirmed).toBe(true);expect(body.expected_template_version).toBe(1);if(applyFail){applyFail=false;return r.fulfill({status:503,json:{detail:'Apply response uncertain'}});}return r.fulfill({json:{project_id:'p2',criteria_revision:1,weight_revision:1}});}
  if(method==='POST'){const body=r.request().postDataJSON();ids.push(body.id);expect(body.expected_source_updated_at).toBe(stamp);expect(body.include_weights).toBe(true);if(captureFail){captureFail=false;return r.fulfill({status:503,json:{detail:'Capture temporarily unavailable'}});}templates=[{...template,name:body.name,notes:body.notes}];return r.fulfill({status:201,json:templates[0]});}
  return r.fulfill({json:{projects,templates}});
 });
 await page.goto('/#/criteria');await page.getByLabel('Source project',{exact:true}).selectOption('p1');await page.getByLabel('New template name',{exact:true}).fill('Reusable criteria');await page.getByLabel('New template notes',{exact:true}).fill('Keep these notes');await page.getByLabel("Include the source project's currently approved weight values").check();await page.getByRole('button',{name:'Save Reusable Template',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Capture temporarily unavailable');await expect(page.getByLabel('New template notes',{exact:true})).toHaveValue('Keep these notes');await page.getByRole('button',{name:'Save Reusable Template',exact:true}).click();await expect(page.getByRole('heading',{name:'Reusable criteria',exact:true})).toBeVisible();expect(ids[0]).toBe(ids[1]);
 await page.getByRole('button',{name:'Preview and Apply',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Target project',{exact:true}).selectOption('p2');await dialog.getByRole('button',{name:'Load Application Preview',exact:true}).click();await expect(dialog.getByRole('button',{name:'Apply as Draft',exact:true})).toBeDisabled();await expect(dialog).toContainText('Saved decision reports remain unchanged.');await dialog.getByLabel("I reviewed this preview and want to replace this project's criteria and draft weights.").check();await dialog.getByRole('button',{name:'Apply as Draft',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Apply response uncertain');await dialog.getByRole('button',{name:'Apply as Draft',exact:true}).click();await expect(dialog).not.toBeVisible();expect(appliedIds[0]).toBe(appliedIds[1]);await expect(page.getByRole('button',{name:'Open draft weights',exact:true})).toBeVisible();
});

test('Approver can read all workspace pages without preparation controls at phone width',async({page})=>{
 await page.setViewportSize({width:375,height:850});await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{id:'a1',username:'approver',display_name:'Approver',role:'approver',active:true,must_change:false,updated_at:stamp},csrf_token:'a'.repeat(64),setup_required:false}}));
 await page.route('**/api/workspace/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({json:path.endsWith('/suppliers')?{projects,suppliers:[supplier]}:path.endsWith('/evaluations')?{projects:[evaluation]}:path.endsWith('/reports')?{projects,reports:[report]}:{projects,templates:[template]}});});
 await page.goto('/#/suppliers');const nav=page.getByRole('navigation',{name:'Main navigation'});for(const name of ['Suppliers','Criteria & Weighting','Evaluations','Reports']){await nav.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh this page',exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);}
 await nav.getByRole('button',{name:'Suppliers',exact:true}).click();await expect(page.getByRole('button',{name:'Add Supplier',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Copy to Project',exact:true})).toHaveCount(0);await nav.getByRole('button',{name:'Criteria & Weighting',exact:true}).click();await expect(page.getByRole('button',{name:'Save Reusable Template',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Preview and Apply',exact:true})).toHaveCount(0);await page.screenshot({path:'test-results/workspace-approver-phone.png',fullPage:true});
});

test('workspace load failure shows retry without invented records',async({page})=>{let fail=true;await page.route('**/api/workspace/suppliers',r=>r.fulfill(fail?{status:503,json:{detail:'Workspace storage unavailable'}}:{json:{projects:[],suppliers:[]}}));await page.goto('/#/suppliers');await expect(page.getByRole('alert')).toContainText('unavailable');await expect(page.getByText('No supplier entries match these filters.')).toHaveCount(0);fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByText('No supplier entries match these filters.')).toBeVisible();});

for(const width of [1440,768,320])test(`evaluations table and filters remain usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const longName=`Synthetic project ${'LongName'.repeat(12)}`,supplierName=`Supplier ${'LongName'.repeat(10)}`;
 const evaluations=Array.from({length:22},(_,i)=>({...evaluation,id:`p${i}`,name:i===0?longName:`Synthetic project ${i}`,reference:`PRJ-${i}`,workflow_status:i===1?'Needs review':'Approved',workflow_stage:i===0?'Review the current evaluation and next purchasing decision':'Decision',resume_path:`/projects/p${i}/decision`,evaluation_current:i!==1,calculation:i===21?null:{...evaluation.calculation,rows:[{id:'s1',name:supplierName,rank:1,score:'0.81234567'},{id:'s2',name:'Another supplier',rank:1,score:'0.81234567'},{id:'s3',name:'Not highest',rank:2,score:'0.2'}]}}));
 let writes=0;
 await page.route('**/api/workspace/**',route=>{if(route.request().method()!=='GET'){writes++;return route.abort();}return route.fulfill({json:{projects:evaluations}});});
 await page.route('**/api/projects**',route=>{if(route.request().method()!=='GET'){writes++;return route.abort();}return route.fulfill({json:{id:'p0',name:longName,reference:'PRJ-0',currency:'USD'}});});
 await page.route('**/api/auth/users',route=>route.fulfill({json:{users:[]}}));
 await page.goto('/#/evaluations');
 await expect(page.getByText('Scroll horizontally to see more evaluation details and actions.')).toBeVisible();
 const table=page.getByRole('region',{name:'Workspace evaluations table'}),row=table.getByRole('row').filter({hasText:longName}),project=row.locator('td').first();
 await expect(table.getByRole('row').nth(1)).toContainText(longName);
 await expect(table.getByRole('row').nth(2)).toContainText('Synthetic project 1');
 await expect(row.getByText('PRJ-0',{exact:true})).toBeAttached();
 await expect(row.getByText(`${supplierName} · 0.812346`,{exact:true})).toBeAttached();
 await expect(row.getByText('Another supplier · 0.812346',{exact:true})).toBeAttached();
 await expect(row.getByText('Not highest',{exact:false})).toHaveCount(0);
 const timestamp=await page.evaluate(value=>new Date(value).toLocaleString(),stamp);
 await expect(row.locator('td').nth(2)).toContainText(timestamp);
 await expect(row.getByText('Current calculation',{exact:true})).toBeAttached();
 await expect(table.getByText('Needs recalculation',{exact:true}).first()).toBeAttached();
 expect(await row.locator('td').nth(1).evaluate(el=>{const chip=el.querySelector('.chip')!.getBoundingClientRect(),stage=el.querySelector('p')!.getBoundingClientRect();return chip.bottom<=stage.top;})).toBe(true);
 expect(await project.evaluate(el=>{const name=el.querySelector('strong')!.getBoundingClientRect(),reference=el.querySelector('small')!.getBoundingClientRect();return name.bottom<=reference.top&&el.scrollWidth<=el.clientWidth;})).toBe(true);
 expect(await row.locator('td').evaluateAll(cells=>cells.every(cell=>cell.scrollWidth<=cell.clientWidth))).toBe(true);
 const before=await project.boundingBox();expect(before).not.toBeNull();
 await table.focus();expect(await table.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 if(await table.evaluate(el=>el.scrollWidth>el.clientWidth)){
  await page.keyboard.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await table.evaluate(el=>{el.scrollLeft=(el.scrollWidth-el.clientWidth)/2;});
 }
 const middle=await project.boundingBox();expect(middle).not.toBeNull();expect(Math.abs(middle!.x-before!.x)).toBeLessThanOrEqual(1);
 expect(await project.evaluate(el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor}))).toEqual({position:'sticky',background:'rgb(255, 255, 255)'});
 expect(await table.getByRole('columnheader',{name:'Project',exact:true}).evaluate(el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor,z:Number(getComputedStyle(el).zIndex)}))).toEqual({position:'sticky',background:'rgb(239, 244, 255)',z:3});
 await table.focus();await page.keyboard.press('Tab');
 for(const name of ['Continue Workflow','View Rankings','View Decision']){
  const button=row.getByRole('button',{name,exact:true});await expect(button).toBeFocused();
  const geometry=await button.evaluate(el=>{const table=el.closest('.table-scroll')!.getBoundingClientRect(),project=el.closest('tr')!.querySelector('td')!.getBoundingClientRect(),button=el.getBoundingClientRect();return {visible:button.left>=project.right-1&&button.right<=table.right+1,focus:getComputedStyle(el).outlineStyle,content:el.scrollWidth<=el.clientWidth,table:[table.left,table.right],project:[project.left,project.right],button:[button.left,button.right]};});
  expect(geometry.visible,`${name}: ${JSON.stringify(geometry)}`).toBe(true);expect(geometry.focus).not.toBe('none');expect(geometry.content).toBe(true);
  if(name!=='View Decision')await page.keyboard.press('Tab');
 }
 expect(await row.locator('.actions').evaluate(el=>{const buttons=Array.from(el.querySelectorAll('button'),b=>b.getBoundingClientRect());return buttons.every((a,i)=>buttons.slice(i+1).every(b=>a.bottom<=b.top));})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:`test-results/evaluations-layout-${width}.png`});
 await expect(page.getByText('22 results',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(table.getByText('Synthetic project 21',{exact:true})).toBeAttached();
 await expect(table.getByText('Not calculated',{exact:true})).toBeAttached();
 const uncalculated=table.getByRole('row').filter({hasText:'Synthetic project 21'});
 await expect(uncalculated.getByRole('button',{name:'Continue Workflow'})).toBeEnabled();
 await expect(uncalculated.getByRole('button',{name:'View Rankings'})).toHaveCount(0);
 await expect(uncalculated.getByRole('button',{name:'View Decision'})).toHaveCount(0);
 await page.getByLabel('Search evaluations').fill('PRJ-0');await expect(table.getByRole('row')).toHaveCount(2);
 await page.getByLabel('Search evaluations').fill('');await page.getByLabel('Filter evaluations by status').selectOption('Needs review');await expect(table.getByRole('row')).toHaveCount(2);
 await page.getByLabel('Filter evaluations by status').selectOption('');await page.getByLabel('Filter evaluations by calculation').selectOption('no');await expect(table.getByText('Synthetic project 21',{exact:true})).toBeAttached();
 await page.getByLabel('Filter evaluations by calculation').selectOption('');await row.getByRole('button',{name:'View Rankings',exact:true}).click();await expect(page).toHaveURL(/projects\/p0\/rankings$/);
 expect(writes).toBe(0);
});
