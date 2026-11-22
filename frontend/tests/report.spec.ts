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
 expect(await summary.evaluate(el=>{const r=el.getBoundingClientRect();return getComputedStyle(el).borderTopStyle==='solid'&&el.scrollWidth<=el.clientWidth&&r.left>=0&&r.right<=innerWidth&&el.nextElementSibling?.textContent==='Project and commercial basis';})).toBe(true);
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

