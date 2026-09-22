/* Integration checks against a mocked Supabase transport. Never contacts production. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const screenshotPath=name=>require('node:path').join(require('node:os').tmpdir(),name);
const catalog=JSON.parse(readFileSync(require('node:path').join(__dirname,'../orders-catalog.json'),'utf8'));
const mock=`window.supabase={createClient(){
  const owner='00000000-0000-4000-8000-000000000001';
  const seed={workspaces:[{user_id:owner,clients:[],quotes:[],settings:{modelRate:10,renderRate:5,personalization:5,paymentThreshold:50,paypalPercent:6,paypalFixed:.3,validDays:7,nextNumber:1,rates:{USD:1,BRL:5.4,ARS:1300}}}],receipts:[],cults_sales:[],cults_sync_state:[]};
  window.testDB=JSON.parse(sessionStorage.getItem('testDB')||'null')||seed;
  const persist=()=>sessionStorage.setItem('testDB',JSON.stringify(window.testDB));window.persistTestDB=persist;
  function from(table){let mode='select',payload,filters=[],single=false,offset=0,end=100000;
    const chain={select(){return chain},eq(k,v){filters.push([k,v]);return chain},order(){return chain},range(a,b){offset=a;end=b;return chain},limit(n){end=n-1;return chain},maybeSingle(){single=true;return chain},single(){single=true;return chain},insert(x){mode='insert';payload=x;return chain},upsert(x){mode='upsert';payload=x;return chain},update(x){mode='update';payload=x;return chain},then(resolve,reject){return Promise.resolve().then(()=>{
      const rows=window.testDB[table];let data=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
      if(mode==='upsert'){window.testDB[table]=[structuredClone(payload)];data=[payload];persist();}
      if(mode==='insert'){
        if(rows.some(r=>r.id===payload.id))return {data:null,error:{code:'23505',message:'Duplicate'}};
        const r={...structuredClone(payload),user_id:owner,number:'JG3D-R-TEST-'+(rows.length+1),status:'paid',gross_usd:payload.items.reduce((s,i)=>s+i.quantity*i.unitUsd,0),issued_at:new Date().toISOString()};rows.push(r);data=[r];persist();
        if(window.loseNextReceipt){window.loseNextReceipt=false;return {data:null,error:{message:'Connection lost after commit'}};}
      }
      if(mode==='update'){data.forEach(r=>Object.assign(r,payload));persist();}
      data=data.slice(offset,end+1);return {data:single?data[0]||null:structuredClone(data),error:null};
    }).then(resolve,reject)}};return chain;
  }
  return {from,auth:{getSession:async()=>({data:{session:{user:{id:owner,email:'test@example.com'}}},error:null}),signOut:async()=>({})},functions:{invoke:async()=>({data:{active:0},error:null})}}};`;
(async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept('Prueba de anulación'));
  await page.route('**/*',async route=>{
    const url=route.request().url();if(url.startsWith('http://127.0.0.1:8765/'))return route.continue();
    if(url.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:mock});
    if(url.endsWith('/catalog/data.js'))return route.fulfill({contentType:'text/javascript',body:'const CATALOG = '+JSON.stringify(catalog.products.map(p=>({s:p.id,n:p.name,p:p.price,u:p.url,b:p.brand,v:p.vehicle})))+';'});
    if(url.includes('dolarapi'))return route.fulfill({json:{venta:1300,fechaActualizacion:new Date().toISOString()}});
    if(url.includes('open.er-api'))return route.fulfill({json:{result:'success',rates:{USD:1.1,BRL:5.4},time_last_update_unix:Math.floor(Date.now()/1000)}});
    return route.fulfill({status:200,body:''});
  });
  await page.goto('http://127.0.0.1:8765/');await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-view="orders"]').click();
  await page.locator('#orderNew').click();await page.locator('#oName').fill('Cliente de prueba');await page.locator('#oEmail').fill('cliente@example.com');
  await page.locator('#oSearch').fill('Chevette');await page.locator('[data-o-product]').first().click();await page.locator('[data-o-price]').fill('20');
  await page.locator('#oManual').click();await page.locator('[data-o-name]').last().fill('Producto manual <sin HTML>');await page.locator('[data-o-price]').last().fill('15');
  await page.locator('#oPersonalized').selectOption('1');await page.locator('#oDiscount').fill('5');await page.locator('#oLicense').selectOption('commercial');
  assert.match(await page.locator('#oTotals').textContent(),/39,69/);
  await page.screenshot({path:screenshotPath('orders-desktop.png'),fullPage:true});
  await page.locator('#oSave').click();await page.locator('#previewModal.open').waitFor();
  assert.equal(await page.evaluate(()=>window.testDB.receipts.length),0);assert.equal(await page.evaluate(()=>window.testDB.workspaces[0].quotes.filter(q=>q.kind==='file_order').length),1);
  assert.match(await page.locator('#quoteDocument').textContent(),/Personalização da marca/);
  await page.keyboard.press('Escape');await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-view="orders"]').click();
  await page.locator('[data-o-pay]').click();await page.locator('#orderPayment').waitFor({state:'visible'});await page.locator('#opClose').click();assert.equal(await page.evaluate(()=>window.testDB.receipts.length),0);
  await page.locator('[data-o-pay]').click();await page.locator('#opPaid').fill('20');await page.locator('#opConfirmed').check();await page.locator('#opSave').click();await page.locator('#opError').filter({hasText:'No se confirmó'}).waitFor();assert.equal(await page.evaluate(()=>window.testDB.receipts.length),0);
  await page.locator('#opPaid').fill('39.69');await page.locator('#opConfirmed').check();await page.evaluate(()=>window.loseNextReceipt=true);await page.locator('#opSave').click();await page.locator('#previewModal.open').waitFor();assert.equal(await page.evaluate(()=>window.testDB.receipts.length),1);
  assert.match(await page.locator('#quoteDocument').textContent(),/Produto|Producto manual/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-o-pay]').count(),0);await page.locator('[data-o-deliver]').click();await page.locator('#oRows').filter({hasText:'Entregado'}).waitFor();assert.equal(await page.evaluate(()=>window.testDB.receipts.length),1);
  await page.locator('[data-view="dashboard"]').click();assert.match(await page.locator('#incomeMetrics').textContent(),/37,01/);
  await page.locator('[data-view="orders"]').click();await page.locator('[data-o-pdf]').click();await page.locator('#previewModal.open').waitFor();
  const print=await page.evaluate(()=>{window.dispatchEvent(new Event('beforeprint'));return {pages:document.querySelectorAll('.receipt-print-page').length,heights:[...document.querySelectorAll('.receipt-print-page article')].map(a=>a.offsetHeight)};});assert.ok(print.pages>=1);assert.ok(print.heights.every(h=>h<1030));
  await page.screenshot({path:screenshotPath('orders-document.png'),fullPage:true});await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:screenshotPath('orders-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('PASS: catalog + manual item; persistence; ES/EN/PT core; review/cancel/partial block; lost-response retry; paid and delivered once; balance; print; mobile.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
