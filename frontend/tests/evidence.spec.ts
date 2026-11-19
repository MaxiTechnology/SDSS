import {test,expect} from './fixtures';
test('evidence upload retry, review revision, cloud download and removal',async({page})=>{
 const updated='2026-11-18T00:00:00Z';let evidenceRevision=0,files:any[]=[],fail=true;const uploads:string[]=[];
 let row:any={id:'s1',name:'Supplier A',updated_at:updated,evidence_revision:0,checks:{cert:{status:'pending',notes:''}},total_price:null,price_status:null,eligibility:'pending',revision:0,needs_review:false,reviewer:null,reviewed_at:null};
 await page.route('**/api/projects**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
 if(path.endsWith('/content'))return route.fulfill({contentType:'text/plain',body:'SYNTHETIC evidence'});
 if(path.includes('/evidence/')&&method==='PUT'){
 uploads.push(path);if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Upload temporarily unavailable'}});}
 expect(route.request().postDataBuffer()?.toString()).toBe('SYNTHETIC evidence');expect(url.searchParams.get('check_id')).toBe('cert');
 evidenceRevision++;row={...row,evidence_revision:evidenceRevision,eligibility:'pending',needs_review:true};files=[{id:path.split('/').pop(),filename:'sample.txt',size_bytes:18,sha256:'a'.repeat(64),check_id:'cert',check_name:'Certificate',created_at:updated,uploaded_by:'Demo User'}];
 return route.fulfill({json:{file:files[0],evidence_revision:evidenceRevision}});}
 if(path.includes('/evidence/')&&method==='DELETE'){files=[];evidenceRevision++;row={...row,evidence_revision:evidenceRevision,eligibility:'pending',needs_review:true};return route.fulfill({json:{evidence_revision:evidenceRevision}});}
 if(path.endsWith('/evidence'))return route.fulfill({json:{files,evidence_revision:evidenceRevision,limits:{used_bytes:files.length?18:18,max_bytes:20971520,file_max_bytes:2097152,active_limit:10,stored_files:1,stored_file_limit:100}}});
 if(path.endsWith('/eligibility/s1')){const p=route.request().postDataJSON();expect(p.evidence_revision).toBe(1);row={...row,...p,revision:1,needs_review:false,eligibility:'eligible',reviewer:'Demo User',reviewed_at:updated};return route.fulfill({json:row});}
 if(path.endsWith('/eligibility'))return route.fulfill({json:{suppliers:[row],mandatory_checks:[{id:'cert',name:'Certificate',requirement:'Synthetic evidence check'}],maximum_price:null,currency:'USD',criteria_revision:1,eligible_count:row.eligibility==='eligible'?1:0,ready:false}});
 return route.fulfill({json:{id:'p1',name:'Evidence test',reference:'P1',currency:'USD'}});
 });
 await page.goto('/#/projects/p1/eligibility');await page.getByRole('button',{name:'Review Supplier A',exact:true}).click();
 await page.getByLabel('Link upload to requirement').selectOption('cert');await page.getByLabel('Choose evidence document').setInputFiles({name:'sample.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC evidence')});
 expect(uploads).toHaveLength(0);await page.getByRole('button',{name:'Upload Document',exact:true}).click();await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
 await page.getByRole('button',{name:'Upload Document',exact:true}).click();expect(uploads[0]).toBe(uploads[1]);await expect(page.getByRole('button',{name:'Download sample.txt',exact:true})).toBeVisible();
 await page.getByLabel('Determination for Certificate').selectOption('passed');await page.getByLabel('Review notes for Certificate').fill('Reviewed the synthetic document.');await page.getByRole('button',{name:'Save Review',exact:true}).click();
 await page.getByRole('button',{name:'Review Supplier A',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download sample.txt',exact:true}).click();expect((await download).suggestedFilename()).toBe('sample.txt');
 await page.getByRole('heading',{name:'Evidence documents',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/evidence.png',fullPage:true});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove sample.txt',exact:true}).click();await expect(page.getByText('No active documents uploaded for this supplier.',{exact:true})).toBeVisible();
});
