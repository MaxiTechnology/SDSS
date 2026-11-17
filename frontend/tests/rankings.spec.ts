import {test,expect} from '@playwright/test';
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
