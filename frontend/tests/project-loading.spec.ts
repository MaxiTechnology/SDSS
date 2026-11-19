import {test,expect} from './fixtures';
const project={id:'p1',reference:'PRJ-T',name:'Shared project',currency:'USD',category:'IT',estimated_budget:null,target_date:null,description:'',status:'Draft',workflow_status:'Approved',workflow_stage:'Decision',supplier_count:2,updated_at:'2026-11-19T00:00:00Z'};
test('list navigation renders known data while refreshing, shares pending reads and hides failed totals',async({page})=>{
 let requests=0,firstRelease=()=>{},nextRelease=()=>{};
 const first=new Promise<void>(resolve=>firstRelease=resolve),next=new Promise<void>(resolve=>nextRelease=resolve);
 await page.route('**/api/projects',async route=>{
  requests++;if(requests===1){await first;return route.fulfill({json:[project]});}
  if(requests===2){await next;return route.fulfill({status:503,json:{detail:'Temporary project storage outage'}});}
  return route.fulfill({json:[{...project,workflow_status:'Needs review'}]});
 });
 try{
  await page.goto('/#/dashboard');await expect.poll(()=>requests).toBe(1);firstRelease();await expect(page.getByRole('button',{name:'Approved 1',exact:true})).toBeVisible();
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await nav.getByRole('button',{name:'Purchasing Projects',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Refreshing saved projects…');await expect(page.getByRole('cell',{name:'Shared project PRJ-T',exact:false})).toBeVisible();await expect.poll(()=>requests).toBe(2);
  await nav.getByRole('button',{name:'Dashboard',exact:true}).click();await expect(page.getByRole('button',{name:'Approved 1',exact:true})).toBeVisible();expect(requests).toBe(2);
  nextRelease();await expect(page.getByRole('alert')).toContainText('outage');await expect(page.getByRole('button',{name:'Approved 1',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('button',{name:'Needs review 1',exact:true})).toBeVisible();expect(requests).toBe(3);
 }finally{firstRelease();nextRelease();}
});
test('a late list failure cannot overwrite the new-project form',async({page})=>{
 let release=()=>{};const pending=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/projects',async route=>{await pending;await route.fulfill({status:503,json:{detail:'Late old-page failure'}});});
 try{
  await page.goto('/#/dashboard');await page.getByRole('button',{name:'Create Project',exact:true}).click();await page.getByLabel('Project Name').fill('Keep these unsaved details');
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/projects');release();await response;await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.getByLabel('Project Name')).toHaveValue('Keep these unsaved details');await expect(page.getByRole('alert')).toHaveCount(0);
 }finally{release();}
});
