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


