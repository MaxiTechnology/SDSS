import {test,expect} from './fixtures';
const project={id:'p1',reference:'PRJ-ONE',name:'Project One',currency:'USD',category:'IT',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-19T00:00:00Z'};
const criteria=[{id:'price',name:'Price',unit:'USD',direction:'cost',selected:true,minimum:'0',maximum:null},{id:'quality',name:'Quality',unit:'points',direction:'benefit',selected:true,minimum:'0',maximum:'100'}];
test('nested pages load before metadata, share pending metadata and refresh editable project details',async({page})=>{
 let release=()=>{},reads=0,currentName='Project One';const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/projects/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/criteria'))return route.fulfill({json:{revision:1,currency:'USD',configuration:{criteria,mandatory_checks:[],maximum_price:null}}});
  if(path.endsWith('/weights/manual'))return route.fulfill({json:{criteria,criteria_revision:1,weights:{price:'50',quality:'50'},revision:1,approved:true,needs_review:false}});
  reads++;if(reads===1)await pending;return route.fulfill({json:{...project,name:currentName}});
 });
 try{
  await page.goto('/#/projects/p1/criteria');await expect(page.getByLabel('Criterion Name',{exact:true})).toHaveValue('Price');expect(reads).toBe(1);
  await page.getByRole('button',{name:'Continue to Manual Weighting',exact:false}).click();await expect(page.getByLabel('Weight for Price',{exact:true})).toHaveValue('50');expect(reads).toBe(1);
  release();await expect(page.getByRole('button',{name:'Purchasing Projects / PRJ-ONE',exact:false})).toBeVisible();
  currentName='Current server project name';await page.evaluate(()=>location.hash='/projects/p1');await expect(page.getByLabel('Project Name')).toHaveValue(currentName);expect(reads).toBe(2);
 }finally{release();}
});
test('late metadata for another project cannot change the current sub-page',async({page})=>{
 let release=()=>{};const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/projects/**',async route=>{
  const path=new URL(route.request().url()).pathname,second=path.includes('/p2');
  if(path.endsWith('/criteria'))return route.fulfill({json:{revision:1,currency:'USD',configuration:{criteria:criteria.map(c=>({...c,name:c.name+(second?' Two':' One')})),mandatory_checks:[],maximum_price:null}}});
  if(!second)await pending;return route.fulfill({json:{...project,id:second?'p2':'p1',reference:second?'PRJ-TWO':'PRJ-ONE'}});
 });
 try{
  await page.goto('/#/projects/p1/criteria');await expect(page.getByLabel('Criterion Name',{exact:true})).toHaveValue('Price One');
  await page.evaluate(()=>location.hash='/projects/p2/criteria');await expect(page.getByLabel('Criterion Name',{exact:true})).toHaveValue('Price Two');
  await expect(page.getByRole('button',{name:'Purchasing Projects / PRJ-TWO',exact:false})).toBeVisible();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/projects/p1');release();await response;await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.getByLabel('Criterion Name',{exact:true})).toHaveValue('Price Two');await expect(page.getByRole('button',{name:'Purchasing Projects / PRJ-ONE',exact:false})).toHaveCount(0);
 }finally{release();}
});
