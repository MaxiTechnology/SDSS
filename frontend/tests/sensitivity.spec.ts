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

test('weight inputs align within each responsive row when labels wrap',async({page})=>{
 const criteria=Array.from({length:8},(_,i)=>({id:`c${i}`,name:i%4===0?`Long criterion ${i} requiring several lines to describe purchasing requirements`:`Criterion ${i}`}));
 const weights=Object.fromEntries(criteria.map(c=>[c.id,'12.50']));
 let writes=0;
 await page.route('**/api/projects**',route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  const url=route.request().url();
  if(url.includes('/sensitivity/scenarios'))return route.fulfill({json:{scenarios:[]}});
  if(url.endsWith('/rankings'))return route.fulfill({json:{id:'run',stale:false,snapshot:{criteria,weights,result:{rows:[]}}}});
  return route.fulfill({json:{id:'p1',reference:'P1',name:'Test',currency:'USD'}});
 });
 await page.setViewportSize({width:1440,height:800});
 await page.goto('/#/projects/p1/sensitivity');
 await expect(page.getByLabel(`${criteria[0].name} scenario weight`)).toHaveValue('12.50');
 for(const enlarged of [false,true]){
  if(enlarged)await page.addStyleTag({content:'.sensitivity-page .sensitivity-weights label{font-size:26px}.sensitivity-page .sensitivity-weights small{font-size:22px}'});
  const boxes=await page.locator('.sensitivity-weights label').evaluateAll(labels=>labels.map(label=>{
   const labelRect=label.getBoundingClientRect(),text=label.firstElementChild!.getBoundingClientRect(),input=label.querySelector('input')!.getBoundingClientRect(),suffix=label.querySelector('.sensitivity-weight-input > span')!.getBoundingClientRect();
   return {row:labelRect.top,textHeight:text.height,textBottom:text.bottom,baselineWrapped:label.querySelector('small')!.getBoundingClientRect().top>text.top+2,inputTop:input.top,inputBottom:input.bottom,suffixTop:suffix.top,contained:label.scrollWidth<=label.clientWidth};
  }));
  expect(boxes[0].textHeight).toBeGreaterThan(boxes[1].textHeight);
  expect(boxes.some(box=>box.baselineWrapped)).toBe(true);
  const rows=Array.from(new Set(boxes.map(box=>box.row)));
  expect(rows.length).toBeGreaterThanOrEqual(2);
  for(const row of rows){
   const cells=boxes.filter(box=>box.row===row);
   expect(cells.length).toBeGreaterThan(1);
   for(const cell of cells){
    expect(cell.contained).toBe(true);
    expect(cell.textBottom).toBeLessThanOrEqual(cell.inputTop);
    expect(Math.abs(cell.inputTop-cells[0].inputTop)).toBeLessThan(1);
    expect(Math.abs(cell.inputBottom-cells[0].inputBottom)).toBeLessThan(1);
    expect(Math.abs(cell.suffixTop-cells[0].suffixTop)).toBeLessThan(1);
   }
  }
 }
 await page.setViewportSize({width:320,height:800});
 const narrowRows=await page.locator('.sensitivity-weights label').evaluateAll(labels=>labels.map(label=>{
  const rect=label.getBoundingClientRect(),text=label.firstElementChild!.getBoundingClientRect(),input=label.querySelector('input')!.getBoundingClientRect();
  return {top:rect.top,bottom:rect.bottom,textBottom:text.bottom,inputTop:input.top,inputBottom:input.bottom,contained:label.scrollWidth<=label.clientWidth};
 }));
 expect(new Set(narrowRows.map(row=>row.top)).size).toBe(criteria.length);
 for(const [i,row] of narrowRows.entries()){
  expect(row.contained).toBe(true);expect(row.textBottom).toBeLessThanOrEqual(row.inputTop);
  expect(row.inputBottom).toBeLessThanOrEqual(row.bottom);
  if(i)expect(narrowRows[i-1].bottom).toBeLessThanOrEqual(row.top);
 }
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await expect(page.getByLabel('Criterion 1 scenario weight')).toHaveValue('12.50');
 expect(writes).toBe(0);
});
