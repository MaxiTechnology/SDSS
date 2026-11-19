import {test,expect} from '@playwright/test';
const user={id:'00000000-0000-4000-8000-000000000001',username:'officer',display_name:'Officer Test',role:'officer',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'};
test('sign-in outage retry, identity, csrf, session expiry and no browser token storage',async({page})=>{
 let signed=false,attempts=0;
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:signed?user:null,csrf_token:signed?'b'.repeat(64):null,setup_required:false}}));
 await page.route('**/api/auth/login',async r=>{attempts++;if(attempts===1)return r.fulfill({status:503,json:{detail:'The server is temporarily unavailable.'}});signed=true;await r.fulfill({json:{user,csrf_token:'b'.repeat(64),setup_required:false}});});
 await page.route('**/api/projects',r=>r.fulfill({json:[]}));
 await page.goto('/#/');await page.getByLabel('Username',{exact:true}).fill('officer');await page.getByLabel('Password',{exact:true}).fill('A private example password');await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('temporarily unavailable');await expect(page.getByLabel('Password',{exact:true})).toHaveValue('A private example password');
 await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByRole('button',{name:'Sign Out',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'User Accounts',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);
 await page.route('**/api/projects',r=>r.fulfill({status:401,json:{detail:'Sign in to continue.'}}));await page.getByRole('button',{name:'Refresh projects',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in to SDSS',exact:true})).toBeVisible();await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
});
test('sign out sends csrf and clears visible workspace after confirmation',async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user,csrf_token:'c'.repeat(64),setup_required:false}}));await page.route('**/api/projects',r=>r.fulfill({json:[]}));
 await page.route('**/api/auth/logout',r=>{expect(r.request().headers()['x-csrf-token']).toBe('c'.repeat(64));return r.fulfill({status:204});});await page.goto('/#/');await page.getByRole('button',{name:'Sign Out',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in to SDSS',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Purchasing Projects',exact:true})).toHaveCount(0);
});
test('first account setup offers local administrator tool without public registration',async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:null,csrf_token:null,setup_required:true}}));await page.goto('/#/');await expect(page.getByRole('heading',{name:'Create the first administrator'})).toBeVisible();await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Check Account Setup',exact:true})).toBeVisible();await page.screenshot({path:'test-results/auth-setup.png',fullPage:true});
});

test('Approver reads review notes and downloads evidence without editing at phone width',async({page})=>{
 await page.setViewportSize({width:375,height:850});
 await page.route('**/api/auth/session',r=>r.fulfill({json:{user:{...user,role:'approver'},csrf_token:'d'.repeat(64),setup_required:false}}));
 const project={id:'p1',reference:'PRJ-T',name:'Review test',currency:'USD',category:'',estimated_budget:null,target_date:null,description:'',status:'Draft',updated_at:'2026-11-19T00:00:00Z'};
 await page.route('**/api/projects**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(path.endsWith('/eligibility'))return r.fulfill({json:{suppliers:[{id:'s1',name:'Supplier A',updated_at:project.updated_at,evidence_revision:1,checks:{cert:{status:'passed',notes:'Accepted the synthetic certificate.'}},total_price:'100',price_status:'passed',eligibility:'eligible',revision:1,needs_review:false,reviewer:'Officer Test',reviewed_at:project.updated_at}],mandatory_checks:[{id:'cert',name:'Certificate',requirement:'Synthetic review'}],maximum_price:'110',currency:'USD',criteria_revision:1,eligible_count:1,ready:false}});
  if(path.endsWith('/evidence'))return r.fulfill({json:{files:[{id:'f1',filename:'synthetic.txt',size_bytes:10,sha256:'x',check_id:'cert',check_name:'Certificate',created_at:project.updated_at,uploaded_by:'Officer Test'}],evidence_revision:1,limits:{used_bytes:10,max_bytes:20971520,file_max_bytes:2097152,active_limit:10,stored_files:1,stored_file_limit:100}}});
  if(path.endsWith('/content'))return r.fulfill({body:'Synthetic evidence'});
  return r.fulfill({json:project});
 });
 await page.goto('/#/projects/p1/eligibility');await page.getByRole('button',{name:'Review Supplier A',exact:true}).click();
 await expect(page.getByLabel('Review notes for Certificate')).toHaveValue('Accepted the synthetic certificate.');await expect(page.getByLabel('Review notes for Certificate')).toBeDisabled();await expect(page.getByRole('button',{name:'Save Review',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Upload Document',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Remove synthetic.txt',exact:true})).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download synthetic.txt',exact:true}).click();expect((await download).suggestedFilename()).toBe('synthetic.txt');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Sign Out',exact:true})).toBeVisible();await page.screenshot({path:'test-results/auth-approver-phone.png',fullPage:true});
});
