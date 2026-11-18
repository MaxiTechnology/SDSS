import {test,expect} from '@playwright/test';
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
 await page.reload();await expect(page.getByRole('heading',{name:'Cost first',exact:true})).toBeVisible();
 await expect(page.getByLabel('Quality scenario weight')).toHaveValue('75');
 await page.getByRole('button',{name:'View scenario: Cost first'}).click();await expect(page.getByLabel('Quality scenario weight')).toHaveValue('25');
 await expect(page.getByText('Highest-ranked supplier set changed.',{exact:false})).toBeVisible();
 await page.screenshot({path:'test-results/saved-sensitivity.png',fullPage:true});
});
