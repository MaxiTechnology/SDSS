import {test,expect} from './fixtures';
import report from './report-fixture.json' with { type: 'json' };
test('saved version report, PDF retry and decision navigation',async({page})=>{
 let fail=true;
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/report.pdf')){if(fail){fail=false;return route.fulfill({status:503,json:{detail:'PDF unavailable; retry download.'}});}return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4\n%%EOF')});}
 if(url.endsWith('/report'))return route.fulfill({json:report});
 if(url.endsWith('/rankings'))return route.fulfill({json:{id:report.ranking_id,stale:false,snapshot:{result:{rows:report.rankings}}}});
 if(url.endsWith('/decisions'))return route.fulfill({json:{decisions:[{id:report.id,version:1,stale:false,actor:report.actor,created_at:report.created_at,snapshot:{action:'approve',supplier:{name:report.selected_supplier},reason:'',revision_reason:''}}]}});
 return route.fulfill({json:{id:'p1',name:'Edited live draft name',reference:'P1',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/decision');await page.getByRole('button',{name:'View Decision Report',exact:true}).click();
 await expect(page.getByRole('heading',{name:report.project.name})).toBeVisible();
 await expect(page.getByText('Currency: RUB',{exact:false})).toBeVisible();
 await expect(page.getByText('Detailed eligibility rules',{exact:false})).toBeVisible();
 await expect(page.getByText('No sensitivity findings',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Download PDF'}).click();await expect(page.getByRole('alert')).toContainText('retry download');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF'}).click();expect((await download).suggestedFilename()).toContain('-v1.pdf');
 await page.screenshot({path:'test-results/report.png',fullPage:true});
 await page.getByRole('button',{name:'Back to Decision',exact:false}).click();await expect(page.getByRole('button',{name:'View Decision Report',exact:true})).toBeVisible();
});

for(const width of [1440,320])test(`saved report summary retains its fields and wraps at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const long=`Synthetic${'LongValue'.repeat(16)}`,saved={...report,title:`Report ${long}`,outcome:`Outcome ${long}`,project:{...report.project,name:`Project ${long}`},reference:`Reference${long}`,recommendation:`Recommendation ${long}`,selected_supplier:`Supplier ${long}`,reason:`Reason ${long}`,revision_reason:`Revision ${long}`,actor:`Approver ${long}`,confirmed_at:'2026-11-18 00:00:00 UTC',id:`Decision${long}`,ranking_id:`Calculation${long}`};
 let selected=true,writes=0;
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(new URL(route.request().url()).pathname.endsWith('/report'))return route.fulfill({json:{...saved,selected_supplier:selected?saved.selected_supplier:null}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/reports/d1');
 const summary=page.locator('.report-summary');
 await expect(summary.getByRole('heading',{name:`${saved.title} — version ${saved.version}`,exact:true})).toBeVisible();
 await expect(summary.getByRole('heading',{name:saved.project.name,exact:true})).toBeVisible();
 await expect(summary.locator(':scope > p')).toHaveText([saved.outcome,`Reference: ${saved.reference}`,`Highest-ranked: ${saved.recommendation}`,`Selected supplier: ${saved.selected_supplier}`,`Notes / justification: ${saved.reason}`,`Revision reason: ${saved.revision_reason}`,`Confirmed by ${saved.actor} on ${saved.confirmed_at}.`,`Decision ID: ${saved.id}`,`Calculation ID: ${saved.ranking_id}`]);
 expect(await summary.evaluate(el=>{const r=el.getBoundingClientRect();return getComputedStyle(el).borderTopStyle==='solid'&&el.scrollWidth<=el.clientWidth&&r.left>=0&&r.right<=innerWidth&&el.nextElementSibling?.querySelector('h3')?.textContent==='Project and commercial basis';})).toBe(true);
 expect(await summary.locator('.report-summary-row').evaluateAll(rows=>rows.every(row=>{
  const bounds=row.getBoundingClientRect(),children=Array.from(row.children).map(child=>child.getBoundingClientRect());
  return row.scrollWidth<=row.clientWidth&&children.every(child=>child.left>=bounds.left&&child.right<=bounds.right)&&children.every((child,i)=>children.slice(i+1).every(other=>child.right<=other.left||other.right<=child.left||child.bottom<=other.top||other.bottom<=child.top));
 }))).toBe(true);
 const back=page.getByRole('button',{name:'Back to Decision'}),pdf=page.getByRole('button',{name:'Download PDF'});
 await back.focus();expect(await back.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Tab');await expect(pdf).toBeFocused();expect(await pdf.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 expect(await page.locator('.report-actions').evaluate(el=>{const buttons=el.querySelectorAll('button'),a=buttons[0].getBoundingClientRect(),b=buttons[1].getBoundingClientRect();return (a.right<=b.left||a.bottom<=b.top)&&a.left>=0&&b.right<=innerWidth;})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:`test-results/report-summary-${width}.png`,fullPage:true});
 selected=false;await page.reload();await expect(summary.getByText('No supplier awarded.',{exact:true})).toBeVisible();
 await expect(summary.getByText('Selected supplier:',{exact:false})).toHaveCount(0);
 expect(writes).toBe(0);
});

test('report errors remain visible outside the summary and disable PDF download',async({page})=>{
 await page.route('**/api/projects**',route=>{
  if(new URL(route.request().url()).pathname.endsWith('/report'))return route.fulfill({status:503,json:{detail:'Report unavailable.'}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/reports/d1');
 await expect(page.getByRole('alert')).toHaveText('Report unavailable.');
 await expect(page.locator('.report-summary')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Download PDF'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Back to Decision'})).toBeEnabled();
});

for(const width of [1440,320])test(`saved evidence and eligibility remain readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const long=`Synthetic${'LongFilename'.repeat(7)}`,hash='abcdef0123456789'.repeat(4);
 const files=[
  {id:'f1',supplier_id:'s1',supplier_name:'Supplier A',filename:`${long}.pdf`,check_name:'Certificate',size_bytes:12345,sha256:hash,created_at:'2026-11-18T12:34:56Z',uploaded_by:'Historical Reviewer'},
  {id:'f2',supplier_id:'s2',supplier_name:'Supplier B',filename:'evidence.txt',check_name:null,size_bytes:18,sha256:'a'.repeat(64),created_at:'2026-11-17T00:00:00Z',uploaded_by:'Another Reviewer'}
 ];
 const notes=['Mandatory maximum price: 1000.00','Supplier A: eligible. Reviewer: Historical Reviewer. Reviewed: 2026-11-18T12:34:56Z.','Certificate: passed. Checked certificate.','Supplier B: pending. Reviewer: No evidence review required. Reviewed: Not recorded.','Insurance: pending. Awaiting review.'];
 let note:string|undefined='File metadata below was recorded at confirmation; later file changes do not alter this saved record.',currentFiles=files,currentNotes=notes,writes=0;
 const downloads:string[]=[];
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(path.endsWith('/content')){downloads.push(path);return route.fulfill({contentType:'text/plain',body:'Synthetic evidence'});}
  if(path.endsWith('/report'))return route.fulfill({json:{...report,evidence_note:note,evidence_files:currentFiles,eligibility_notes:currentNotes}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/reports/d1');
 const evidence=page.locator('.report-evidence'),eligibility=page.locator('.report-eligibility'),cards=evidence.locator('article');
 await expect(evidence.getByRole('heading',{name:'Evidence files recorded with this decision'})).toBeVisible();
 await expect(evidence.locator('.report-evidence-note')).toHaveText(note);
 await expect(cards.locator('h4')).toHaveText(files.map(file=>file.filename));
 await expect(cards.first().locator('dt')).toHaveText(['Supplier:','Requirement:','Size:','SHA-256:','Uploaded']);
 await expect(cards.first().locator('dd')).toHaveText(['Supplier A','Certificate','12345 bytes',hash,'2026-11-18T12:34:56Z by Historical Reviewer']);
 await expect(cards.nth(1).locator('dd')).toHaveText(['Supplier B','General supplier evidence','18 bytes','a'.repeat(64),'2026-11-17T00:00:00Z by Another Reviewer']);
 await expect(eligibility.getByRole('heading',{name:'Eligibility at confirmation'})).toBeVisible();
 await expect(eligibility.locator('li')).toHaveText(notes);
 expect(await evidence.evaluate(el=>[el,...el.querySelectorAll('article,h4,dt,dd,button')].every(item=>item.scrollWidth<=item.clientWidth))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.locator('.report-values .table-scroll').focus();await page.keyboard.press('Tab');
 const first=cards.first().getByRole('button',{name:`Download saved evidence: ${files[0].filename}`,exact:true});
 await expect(first).toBeFocused();expect(await first.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
 await evidence.screenshot({path:`test-results/report-evidence-${width}.png`});
 await eligibility.screenshot({path:`test-results/report-eligibility-${width}.png`});
 const download=page.waitForEvent('download');await page.keyboard.press('Enter');expect((await download).suggestedFilename()).toBe(files[0].filename);
 await page.keyboard.press('Tab');await expect(cards.nth(1).getByRole('button',{name:'Download saved evidence: evidence.txt'})).toBeFocused();
 expect(downloads).toEqual(['/api/projects/p1/suppliers/s1/evidence/f1/content']);expect(writes).toBe(0);
 note=undefined;currentFiles=[];currentNotes=report.eligibility_notes;await page.reload();
 await expect(evidence.locator('.report-evidence-note')).toHaveText('Evidence attachment metadata was not recorded.');
 await expect(cards).toHaveCount(0);await expect(eligibility.locator('li')).toHaveText(report.eligibility_notes);
});

for(const width of [1440,320])test(`saved AI assistance remains readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const long=`Synthetic${'LongIdentifier'.repeat(12)}`;
 const assistance={provider:'Synthetic provider',model:long,priorities:`Priorities ${long}`,summary:`Summary ${long}`,review_notes:`Review ${long}`,weights:{price:'60.1250',quality:'39.8750'},rationales:{price:`Price explanation ${long}`,quality:'Quality explanation'}};
 let current:typeof assistance|null=assistance,writes=0,aiRequests=0;
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(path.includes('/ai')){aiRequests++;return route.abort();}
  if(path.endsWith('/report'))return route.fulfill({json:{...report,ai_assistance:current}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/reports/d1');
 const section=page.locator('.report-ai');
 await expect(section.getByRole('heading',{name:'AI assistance — reviewed by a human'})).toBeVisible();
 await expect(section.locator('.report-ai-block h4')).toHaveText(['Provider and model','Purchasing priorities sent:','Saved explanation','Review notes:']);
 await expect(section.locator('.report-ai-block p')).toHaveText([`${assistance.provider} · ${assistance.model}`,assistance.priorities,assistance.summary,assistance.review_notes]);
 await expect(section.locator('.report-ai-guidance')).toHaveText('These explanations describe the original suggestions; the approved weights may have been adjusted.');
 await expect(section.locator('article h4')).toHaveText(['Total price','Quality']);
 await expect(section.locator('article').nth(0).locator('p')).toHaveText(['Original AI weight: 60.1250% · Approved weight: 50%',assistance.rationales.price]);
 await expect(section.locator('article').nth(1).locator('p')).toHaveText(['Original AI weight: 39.8750% · Approved weight: 50%',assistance.rationales.quality]);
 expect(await section.evaluate(el=>[el,...el.querySelectorAll('p,h3,h4,article')].every(item=>item.scrollWidth<=item.clientWidth))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await section.screenshot({path:`test-results/report-ai-${width}.png`});
 current={...assistance,review_notes:''};await page.reload();
 await expect(section.getByText('No additional review notes.',{exact:true})).toBeVisible();
 current=null;await page.reload();await expect(section).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Evidence files recorded with this decision'})).toBeVisible();
 expect(writes).toBe(0);expect(aiRequests).toBe(0);
});

for(const width of [1440,320])test(`saved sensitivity text remains unchanged and readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const long=`Synthetic${'LongScenario'.repeat(12)}`;
 const lines=[
  'Saved weight scenarios for this decision baseline. These are selected tests, not proof of stability across all possible weights. Approved weights and the purchasing decision are unchanged by simulation.',
  `Scenario: ${long} | Saved: 2026-11-18T12:34:56Z | By: Historical Reviewer | By: name`,
  'Weights: Cost; special: 90.1250%; Quality: 9.8750%',
  'Highest-ranked supplier set changed.',
  'Results: Beta; Division: baseline rank 2, scenario rank 1, score 0.900000; Alpha: baseline rank 1, scenario rank 2, score 0.100000',
  `Notes: ${long}; Results: text is not structured`,
  '',
  'Scenario: Second | Saved: 2026-11-17T00:00:00Z | By: Second Reviewer',
  'Weights: Cost: 10%; Quality: 90%',
  'Highest-ranked supplier set unchanged.',
  'Results: Alpha: baseline rank 1, scenario rank 1, score 0.800000',
  'Notes: No additional notes.'
 ];
 let sensitivity=lines.join('\n'),writes=0;
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(new URL(route.request().url()).pathname.endsWith('/report'))return route.fulfill({json:{...report,sensitivity}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/reports/d1');
 const section=page.locator('.report-sensitivity');
 await expect(section.getByRole('heading',{name:'Sensitivity analysis'})).toBeVisible();
 const text=section.locator('p');
 await expect(text).toHaveCount(1);
 await expect.poll(()=>text.textContent()).toBe(sensitivity);
 expect(await text.evaluate(el=>{
  if(getComputedStyle(el).whiteSpace!=='pre-wrap'||!el.firstChild)return false;
  const content=el.textContent||'',start=content.indexOf('Highest-ranked supplier set changed.'),next=content.indexOf('Results: Beta; Division:');
  if(start<0||next<0)return false;
  const range=document.createRange();range.setStart(el.firstChild,start);range.setEnd(el.firstChild,start+1);const first=range.getBoundingClientRect();
  range.setStart(el.firstChild,next);range.setEnd(el.firstChild,next+1);return range.getBoundingClientRect().top>first.top;
 })).toBe(true);
 await expect(section.locator('xpath=following-sibling::*[1]')).toHaveText(report.notice);
 expect(await section.evaluate(el=>[el,...el.querySelectorAll('h3,p')].every(item=>item.scrollWidth<=item.clientWidth))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await section.screenshot({path:`test-results/report-sensitivity-${width}.png`});
 sensitivity=report.sensitivity;await page.reload();
 await expect.poll(()=>text.textContent()).toBe(report.sensitivity);
 expect(writes).toBe(0);
});

for(const width of [1440,320])test(`saved report detail sections remain readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 const longSupplier=`Supplier ${'LongName'.repeat(12)}`,longCriterion=`Criterion ${'LongName'.repeat(12)}`;
 const saved={...report,project:{...report.project,category:'',estimated_budget:null,target_date:null,description:''},rankings:[{id:'a',name:longSupplier,rank:1,score:'0.98765449'},{id:'b',name:'Supplier B',rank:1,score:'0.98765449'}],criteria:[{id:'x',name:longCriterion,unit:'USD per item',direction:'cost',weight:'25.25'},{id:'y',name:'Quality',unit:'points',direction:'benefit',weight:'74.75'}],values:[{supplier:longSupplier,criterion:longCriterion,value:'100000000000.123456789',unit:'USD per item'},{supplier:longSupplier,criterion:'Quality',value:'99.125',unit:'points'},{supplier:'Supplier B',criterion:longCriterion,value:'100.20',unit:'USD per item'}],weight_diagnostics:{cr:'0.01234567',ci:'0.01234567',ri:'1.234',lambda_max:'3.01234567'}};
 let writes=0;
 await page.route('**/api/workspace/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(new URL(route.request().url()).pathname.endsWith('/report'))return route.fulfill({json:saved});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/reports/d1');
 const sections=page.locator('.report-detail');
 await expect(sections.locator('h3')).toHaveText(['Project and commercial basis','Saved supplier rankings','Criteria and approved weights','Saved supplier input values']);
 await expect(page.locator('.report-project dt')).toHaveText(['Category:','Currency:','Planning budget:','Target date:','Description:']);
 await expect(page.locator('.report-project dd')).toHaveText(['Not specified','RUB','Not specified','Not specified','No project description recorded.']);
 await expect(page.getByText('Scores range from 0 to 1; higher is better. Scores display six decimal places; saved ranks use unrounded scores.')).toBeVisible();
 await expect(page.getByText('AHP consistency: CR 0.012346 · CI 0.012346 · RI 1.23 · Lambda max 3.012346')).toBeVisible();
 const rankings=page.getByRole('region',{name:'Saved supplier rankings table'}),criteria=page.getByRole('region',{name:'Criteria and approved weights table'}),values=page.getByRole('region',{name:'Saved supplier input values table'});
 await expect(rankings.locator('tbody tr')).toHaveCount(2);
 await expect(rankings.locator('tbody tr').nth(0).locator('td')).toHaveText(['1',longSupplier,'0.987654']);
 await expect(rankings.locator('tbody tr').nth(1).locator('td')).toHaveText(['1','Supplier B','0.987654']);
 await expect(criteria.locator('tbody tr').nth(0).locator('td')).toHaveText([longCriterion,'USD per item','Lower is better','25.25']);
 await expect(criteria.locator('tbody tr').nth(1).locator('td')).toHaveText(['Quality','points','Higher is better','74.75']);
 await expect(values.locator('tbody tr')).toHaveCount(3);
 await expect(values.locator('tbody tr').nth(0).locator('td')).toHaveText([longSupplier,longCriterion,'100000000000.123456789','USD per item']);
 await expect(values.locator('tbody tr').nth(1).locator('td')).toHaveText([longSupplier,'Quality','99.125','points']);
 await expect(values.locator('tbody tr').nth(2).locator('td')).toHaveText(['Supplier B',longCriterion,'100.20','USD per item']);
 for(const [cell,word] of [[criteria.locator('th').nth(2),'Preference'],[criteria.locator('tbody tr').nth(0).locator('td').nth(1),'USD'],[criteria.locator('tbody tr').nth(1).locator('td').nth(1),'points'],[values.locator('tbody tr').nth(0).locator('td').nth(3),'USD'],[values.locator('tbody tr').nth(1).locator('td').nth(3),'points']] as const){
  expect(await cell.evaluate((el,text)=>{
   const node=el.firstChild;
   if(!node||node.nodeType!==Node.TEXT_NODE)return false;
   const start=(node.textContent||'').indexOf(text);
   if(start<0)return false;
   const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+text.length);
   return range.getClientRects().length===1;
  },word)).toBe(true);
 }
 expect(await sections.evaluateAll(items=>items.every((item,i)=>{const rect=item.getBoundingClientRect();return getComputedStyle(item).borderTopStyle==='solid'&&(i===0||items[i-1].getBoundingClientRect().bottom<=rect.top);}))).toBe(true);
 for(const [region,numeric] of [[rankings,[0,2]],[criteria,[3]],[values,[2]]] as const){
  expect(await region.locator('tbody tr').first().locator('td').evaluateAll((cells,indices)=>cells.every((cell,i)=>indices.includes(i)?getComputedStyle(cell).textAlign==='right':getComputedStyle(cell).whiteSpace==='normal'),numeric)).toBe(true);
  expect(await region.locator('tbody tr').first().locator('td').first().evaluate(cell=>getComputedStyle(cell).borderBottomStyle)).toBe('solid');
  await region.focus();expect(await region.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  if(width===320){
   for(let i=0;i<60;i++)await page.keyboard.press('ArrowRight',{delay:20});
   await expect.poll(()=>region.evaluate(el=>el.scrollWidth-el.clientWidth-el.scrollLeft),{timeout:5000}).toBeLessThanOrEqual(1);
  }
 }
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:`test-results/report-details-${width}.png`,fullPage:true});
 expect(writes).toBe(0);
});
