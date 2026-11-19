import {test,expect} from './fixtures';
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
