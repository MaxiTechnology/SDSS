import {test,expect} from './fixtures';

test('sign-out discards remembered rows before the next account signs in',async({page})=>{
 let reads=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/workspace/suppliers',async r=>{reads++;if(reads>1){await gate;return r.fulfill({json:{projects:[],suppliers:[]}});}return r.fulfill({json:{projects:[],suppliers:[{id:'s1',project_id:'p1',name:'Previous session supplier',location:'',description:'',updated_at:'2026-11-19T00:00:00Z',project_name:'Project',reference:'P1'}]}});});
 await page.route('**/api/auth/logout',r=>r.fulfill({status:204}));
 await page.route('**/api/auth/login',r=>r.fulfill({json:{user:{id:'next-user',username:'next-user',display_name:'Next user',role:'approver',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},csrf_token:'b'.repeat(64),setup_required:false}}));
 await page.goto('/#/suppliers');await expect(page.getByRole('cell',{name:'Previous session supplier',exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill('next-user');await page.getByLabel('Password',{exact:true}).fill('Synthetic private password');await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await expect(page.getByText('Loading workspace data…')).toBeVisible();await expect(page.getByRole('cell',{name:'Previous session supplier',exact:false})).toHaveCount(0);
 release();await expect(page.getByText('No supplier entries match these filters.')).toBeVisible();
});

test('workspace return navigation renders known rows immediately, shares reads and hides failed refresh data',async({page})=>{
 let reads=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/workspace/suppliers',async r=>{reads++;if(reads===2){await gate;return r.fulfill({status:503,json:{detail:'Synthetic refresh outage'}});}return r.fulfill({json:{projects:[],suppliers:[{id:'s1',project_id:'p1',name:'Remembered supplier',location:'Synthetic',description:'',updated_at:'2026-11-19T00:00:00Z',project_name:'Project',reference:'P1'}]}});});
 await page.route('**/api/workspace/evaluations',r=>r.fulfill({json:{projects:[]}}));
 await page.goto('/#/suppliers');await expect(page.getByRole('cell',{name:'Remembered supplier',exact:false})).toBeVisible();expect(reads).toBe(1);
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await nav.getByRole('button',{name:'Evaluations',exact:true}).click();await expect(page.getByText('No projects match these evaluation filters.')).toBeVisible();
 await nav.getByRole('button',{name:'Suppliers',exact:true}).click();await expect(page.getByRole('cell',{name:'Remembered supplier',exact:false})).toBeVisible();await expect(page.getByText('Refreshing workspace data…')).toBeVisible();expect(reads).toBe(2);
 release();await expect(page.getByRole('alert')).toContainText('Synthetic refresh outage');await expect(page.getByRole('cell',{name:'Remembered supplier',exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('cell',{name:'Remembered supplier',exact:false})).toBeVisible();expect(reads).toBe(3);
});

test('account return navigation shows known rows but waits for fresh permission-checked data before editing',async({page})=>{
 let reads=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const row={id:'u1',username:'remembered-account',display_name:'Remembered account',role:'officer',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'};
 await page.route('**/api/auth/users',async r=>{reads++;if(reads===2)await gate;return r.fulfill({json:{users:[{...row,display_name:reads===2?'Fresh account name':row.display_name}]}});});
 await page.route('**/api/workspace/reports',r=>r.fulfill({json:{projects:[],reports:[]}}));
 await page.goto('/#/accounts');await expect(page.getByRole('cell',{name:'Remembered account',exact:true})).toBeVisible();expect(reads).toBe(1);
 const nav=page.getByRole('navigation',{name:'Main navigation'});await nav.getByRole('button',{name:'Reports',exact:true}).click();await expect(page.getByText('No saved reports match these filters.')).toBeVisible();
 await nav.getByRole('button',{name:'User Accounts',exact:true}).click();await expect(page.getByRole('cell',{name:'Remembered account',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit remembered-account',exact:true})).toBeDisabled();
 release();await expect(page.getByRole('cell',{name:'Fresh account name',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit remembered-account',exact:true})).toBeEnabled();expect(reads).toBeGreaterThanOrEqual(2);
});

test('menu focus preloads once and successful writes invalidate remembered workspace data',async({page})=>{
 let reads=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);let releaseAfterWrite!:()=>void;const afterWrite=new Promise<void>(r=>releaseAfterWrite=r);
 await page.route('**/api/workspace/**',async r=>{if(r.request().url().endsWith('/templates')){reads++;if(reads===1)await gate;else await afterWrite;}return r.fulfill({json:{projects:[],templates:[],reports:[]}});});
 await page.route('**/api/projects',r=>r.fulfill({json:[]}));
 await page.goto('/#/reports');const nav=page.getByRole('navigation',{name:'Main navigation'});const button=nav.getByRole('button',{name:'Criteria & Weighting',exact:true});await button.focus();await expect.poll(()=>reads).toBe(1);await button.click();release();await expect(page.getByRole('heading',{name:'Project criteria and weighting',exact:true})).toBeVisible();expect(reads).toBe(1);
 await nav.getByRole('button',{name:'Reports',exact:true}).click();
 // Trigger the same API mutation path as a successful application save.
 await page.route('**/api/test-write',r=>r.fulfill({json:{saved:true}}));
 await page.evaluate(async()=>{const {api}=await import('/src/api.ts');await api('/api/test-write',{method:'POST'});});
 await button.click();await expect(page.getByText('Loading workspace data…')).toBeVisible();await expect(page.getByRole('heading',{name:'Project criteria and weighting',exact:true})).toHaveCount(0);releaseAfterWrite();await expect(page.getByRole('heading',{name:'Project criteria and weighting',exact:true})).toBeVisible();expect(reads).toBe(2);
});
