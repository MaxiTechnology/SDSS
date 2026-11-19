import {test,expect} from './fixtures';
test('scenario total, retry, comparison, reset and stale baseline',async({page})=>{
 let stale=false,fail=true;
 const rows=[{id:'a',name:'Alpha',rank:1,score:'0.75'},{id:'b',name:'Beta',rank:2,score:'0.25'}];
 await page.route('**/api/projects**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/sensitivity')){if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Retry simulation'}});}return route.fulfill({json:{baseline_id:'run',weights:{x:'25',y:'75'},result:{rows:[{...rows[1],rank:1,score:'0.75'},{...rows[0],rank:2,score:'0.25'}]}}});}
 if(url.endsWith('/rankings'))return route.fulfill({json:{id:'run',created_at:'2026-11-17T00:00:00Z',stale,snapshot:{criteria:[{id:'x',name:'Quality'},{id:'y',name:'Price'}],weights:{x:'75',y:'25'},result:{rows}}}});
 return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/sensitivity');
 await page.getByLabel('Quality scenario weight').fill('25');await expect(page.getByRole('button',{name:'Run Simulation'})).toBeDisabled();
 await page.getByLabel('Price scenario weight').fill('75');await page.getByRole('button',{name:'Run Simulation'}).click();await expect(page.getByRole('alert')).toContainText('Retry simulation');
 await page.getByRole('button',{name:'Run Simulation'}).click();await expect(page.getByText('Highest-ranked supplier set changed.',{exact:false})).toBeVisible();
 await page.screenshot({path:'test-results/sensitivity.png',fullPage:true});
 await page.getByRole('button',{name:'Reset to Baseline'}).click();await expect(page.getByLabel('Quality scenario weight')).toHaveValue('75');await expect(page.getByRole('table')).toHaveCount(0);
 stale=true;await page.reload();await expect(page.getByRole('alert')).toContainText('out of date');await expect(page.getByRole('button',{name:'Run Simulation'})).toHaveCount(0);
});
