import {test,expect} from './fixtures';
test('matrix saves drafts, validates ranges and reopens',async({page})=>{
 const project={id:'p1',reference:'PRJ-T',name:'Test',currency:'USD',status:'Draft',updated_at:'2026-11-16T10:00:00Z'};
 let matrix:any={entries:{a:{quality:null},b:{quality:null}},suppliers:[{id:'a',name:'Supplier A'},{id:'b',name:'Supplier B'}],criteria:[{id:'quality',name:'Quality',unit:'points / 100',direction:'benefit',minimum:'0',maximum:'100'}],context:'x'.repeat(64),revision:0,needs_review:false,ready:false};let fail=true;
 await page.route('**/api/projects**',async route=>{
 if(!route.request().url().endsWith('/matrix'))return route.fulfill({json:project});
 if(route.request().method()==='PUT'){
 if(fail){fail=false;return route.fulfill({status:503,json:{detail:'Storage unavailable'}});}
 matrix={...matrix,entries:route.request().postDataJSON().entries,revision:matrix.revision+1,ready:true};
 }
 return route.fulfill({json:matrix});
 });
 await page.goto('/#/projects/p1/matrix');
 const a=page.getByLabel('Supplier A: Quality');const b=page.getByLabel('Supplier B: Quality');
 await a.fill('101');await expect(page.getByRole('button',{name:'Save Matrix Draft'})).toBeDisabled();
 await a.fill('90');await b.fill('80');
 await page.getByRole('button',{name:'Save Matrix Draft'}).click();await expect(page.getByRole('alert')).toContainText('Storage unavailable');await expect(a).toHaveValue('90');
 await page.getByRole('button',{name:'Save Matrix Draft'}).click();await expect(page.getByRole('status')).toContainText('Matrix saved');
 await page.reload();await expect(a).toHaveValue('90');await expect(b).toHaveValue('80');
 await page.screenshot({path:'test-results/matrix.png',fullPage:true});
});

for(const width of [1440,320])test(`matrix supplier column and controls remain usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:800});
  const name=`Synthetic supplier ${'LongName'.repeat(12)}`;
  const criteria=Array.from({length:6},(_,i)=>({id:`c${i}`,name:`Criterion ${i+1} with descriptive name`,unit:i===0?'USD':'points / 100',direction:i===0?'cost':'benefit',minimum:'0',maximum:'100'}));
  const entries=Object.fromEntries(criteria.map((c,i)=>[c.id,i===0?'12.3456':'50']));
  let writes=0;
  await page.route('**/api/projects**',route=>{
   if(route.request().method()!=='GET'){writes++;return route.abort();}
   if(route.request().url().endsWith('/matrix'))return route.fulfill({json:{entries:{a:entries,b:entries},suppliers:[{id:'a',name},{id:'b',name:'Supplier B'}],criteria,context:'synthetic',revision:2,needs_review:false,ready:true}});
   return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
  });
  await page.goto('/#/projects/p1/matrix');
  await expect(page.getByRole('heading',{name:'Supplier Evaluation Matrix',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Supplier values',exact:true})).toBeVisible();
  await expect(page.getByText('Scroll horizontally to see additional criteria.')).toBeVisible();
  const region=page.getByRole('region',{name:'Evaluation matrix table'}),row=region.getByRole('row').filter({hasText:name});
  const pinned=row.locator('td').first(),header=region.getByRole('columnheader',{name:'Supplier',exact:true});
  await expect(region.getByRole('columnheader',{name:'Criterion 1 with descriptive name USD · Lower is better'})).toHaveCount(1);
  await expect(region.getByRole('columnheader',{name:'Criterion 2 with descriptive name points / 100 · Higher is better'})).toHaveCount(1);
  await expect(region.getByLabel(`${name}: ${criteria[0].name}`,{exact:true})).toHaveValue('12.3456');
  const before=await pinned.boundingBox();expect(before).not.toBeNull();
  await region.focus();expect(await region.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  for(const c of criteria){
   const input=region.getByLabel(`${name}: ${c.name}`,{exact:true});
   await expect(input).toBeFocused();
   const geometry=await input.evaluate(el=>{
    const region=el.closest('.matrix-table')!,cell=el.closest('tr')!.querySelector('td')!;
    const r=region.getBoundingClientRect(),p=cell.getBoundingClientRect(),i=el.getBoundingClientRect();
    return {visible:i.left>=p.right-1&&i.right<=r.right+1,outline:getComputedStyle(el).outlineStyle,region:[r.left,r.right],pinned:[p.left,p.right],input:[i.left,i.right]};
   });
   expect(geometry.visible,`${c.name}: ${JSON.stringify(geometry)}`).toBe(true);expect(geometry.outline).not.toBe('none');
   if(width===320){
    const heading=region.getByRole('columnheader',{name:`${c.name} ${c.unit} · ${c.direction==='cost'?'Lower':'Higher'} is better`});
    expect(await heading.evaluate(el=>{const r=el.closest('.matrix-table')!.getBoundingClientRect(),p=el.parentElement!.querySelector('th')!.getBoundingClientRect(),h=el.getBoundingClientRect();return h.left>=p.right-1&&h.right<=r.right+1;}),c.name).toBe(true);
   }
   await input.fill('10.12345');
   await expect(input).toHaveAttribute('aria-invalid','true');
   const error=input.locator('..').getByText('Use a number with at most four decimal places.');
   await expect(error).toBeVisible();
   expect(await error.evaluate(el=>{
    const r=el.closest('.matrix-table')!.getBoundingClientRect(),p=el.closest('tr')!.querySelector('td')!.getBoundingClientRect(),e=el.getBoundingClientRect();
    return e.left>=p.right-1&&e.right<=r.right+1&&el.scrollWidth<=el.clientWidth;
   }),`Validation message for ${c.name}`).toBe(true);
   expect(await pinned.evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return hit===el||el.contains(hit);
   }),`Sticky supplier column for ${c.name}`).toBe(true);
   await input.fill(entries[c.id]);
   if(c!==criteria[criteria.length-1])await page.keyboard.press('Tab');
  }
  expect(await region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  const after=await pinned.boundingBox();expect(after).not.toBeNull();expect(Math.abs(after!.x-before!.x)).toBeLessThanOrEqual(1);
  expect(await pinned.evaluate(el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor,wrap:getComputedStyle(el).whiteSpace,wrapped:el.scrollHeight>50,contained:el.scrollWidth<=el.clientWidth}))).toEqual({position:'sticky',background:'rgb(255, 255, 255)',wrap:'normal',wrapped:true,contained:true});
  expect(await header.evaluate(el=>({position:getComputedStyle(el).position,background:getComputedStyle(el).backgroundColor,z:Number(getComputedStyle(el).zIndex)}))).toEqual({position:'sticky',background:'rgb(239, 244, 255)',z:3});
  await page.keyboard.press('Shift+Tab');const previous=region.getByLabel(`${name}: ${criteria[4].name}`,{exact:true});await expect(previous).toBeFocused();
  expect(await previous.evaluate(el=>{const r=el.closest('.matrix-table')!.getBoundingClientRect(),p=el.closest('tr')!.querySelector('td')!.getBoundingClientRect(),i=el.getBoundingClientRect();return i.left>=p.right-1&&i.right<=r.right+1;})).toBe(true);
  const save=page.getByRole('button',{name:'Save Matrix Draft'}),calculate=page.getByRole('button',{name:'Calculate Rankings'}),reset=page.getByRole('button',{name:'Reset to Saved'});
  await expect(calculate).toBeEnabled();
  const input=region.getByLabel(`${name}: ${criteria[0].name}`,{exact:true});
  await input.fill('101');await expect(save).toBeDisabled();await expect(calculate).toBeDisabled();
  await expect(input.locator('..').getByText('Maximum: 100')).toBeVisible();
  await input.fill('10.1234');await expect(save).toBeEnabled();await expect(calculate).toBeDisabled();
  page.once('dialog',d=>d.dismiss());await reset.click();await expect(input).toHaveValue('10.1234');
  page.once('dialog',d=>d.accept());await reset.click();await expect(input).toHaveValue('12.3456');await expect(calculate).toBeEnabled();
  const layout=await page.locator('.matrix-page').evaluate(el=>{
   const nav=el.querySelector('.matrix-navigation')!.getBoundingClientRect(),save=el.querySelector('.matrix-save')!.getBoundingClientRect(),calculation=el.querySelector('.matrix-calculation')!.getBoundingClientRect();
   const buttons=Array.from(el.querySelectorAll('.matrix-navigation button,.matrix-save button,.matrix-calculation button'),button=>button.getBoundingClientRect());
   return nav.bottom<save.top&&save.bottom<calculation.top&&buttons.every((a,i)=>buttons.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
  });
  expect(layout).toBe(true);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/matrix-layout-${width}.png`,fullPage:true});
  expect(writes).toBe(0);
});

test('approver matrix controls remain read-only',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{user:{id:'u1',username:'reviewer',display_name:'Reviewer',role:'approver',active:true,must_change:false,updated_at:'2026-11-19T00:00:00Z'},csrf_token:'a'.repeat(64),setup_required:false}}));
  await page.route('**/api/projects**',route=>{
   if(route.request().method()!=='GET')return route.abort();
   if(route.request().url().endsWith('/matrix'))return route.fulfill({json:{entries:{a:{quality:'90'}},suppliers:[{id:'a',name:'Supplier A'}],criteria:[{id:'quality',name:'Quality',unit:'points',direction:'benefit',minimum:'0',maximum:'100'}],context:'synthetic',revision:1,needs_review:false,ready:true}});
   return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
  });
  await page.goto('/#/projects/p1/matrix');
  await expect(page.getByLabel('Supplier A: Quality')).toBeDisabled();
  for(const name of ['Back to Eligibility','Reset to Saved','Save Matrix Draft','Calculate Rankings'])await expect(page.getByRole('button',{name})).toBeDisabled();
});
