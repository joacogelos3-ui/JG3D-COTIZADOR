const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../receipts-core.js');require('../orders-core.js');
const O=global.JG3DOrderCore,C=global.JG3DReceiptCore;
const order=()=>({id:'example',number:'JG3D-A-TEST',createdAt:'2026-09-22T00:00:00Z',validUntil:'2026-09-29',client:{name:'Cliente',country:'BR'},language:'pt',license:'commercial',personalized:true,items:[{name:'Archivo A',unitUsd:20},{name:'Archivo B',unitUsd:15}],discountUsd:5,paymentMethod:'paypal',paypalPercent:6,paypalFixed:.3});
test('logo precedes discount, and PayPal covers the net target after cent rounding',()=>{
  assert.deepEqual(O.validate(order()),{subtotalUsd:35,logoUsd:7,discountUsd:5,netUsd:37,grossUsd:39.69,feeUsd:2.68});
  const a=O.calculate(order());assert.ok(C.round(a.grossUsd-a.feeUsd)>=37);
});
test('rounding never underfunds the desired net across small and large orders',()=>{
  for(const price of [.01,.1,1,8,13,15,20,33.33,99.99,777.77])for(const rate of [0,3.49,6,10]){
    const o={...order(),items:[{name:'Archivo',unitUsd:price}],discountUsd:0,paypalPercent:rate};const a=O.calculate(o);
    assert.ok(C.round(a.grossUsd-a.feeUsd)>=a.netUsd,JSON.stringify({price,rate,a}));
  }
});
test('non-personalized transfer charges only files minus fixed discount',()=>{
  const a=O.calculate({...order(),personalized:false,paymentMethod:'other'});assert.equal(a.grossUsd,30);assert.equal(a.logoUsd,0);assert.equal(a.feeUsd,0);
});
test('rejects invalid amounts, empty orders and discounts consuming the total',()=>{
  for(const change of [{items:[]},{discountUsd:42},{discountUsd:43},{paypalPercent:100},{items:[{name:'A',unitUsd:NaN}]},{items:[{name:'A',unitUsd:-1}]},{items:[{name:'',unitUsd:1}]},{items:[{name:'A',unitUsd:1.005}]}])assert.throws(()=>O.validate({...order(),...change}));
});
test('documents and messages show breakdown and license in all three languages',()=>{
  for(const language of ['es','en','pt']){const o={...order(),language};const html=O.documentHTML(o,()=>''),text=O.message(o);for(const label of ['logo','discount','commercial']){assert.ok(html.includes(O.labels[language][label]));assert.ok(text.includes(O.labels[language][label]));}assert.ok(html.includes('39,69')||html.includes('39.69'));}
});
test('escapes names and notes instead of executing embedded HTML',()=>{
  const o=order();o.client.name='<img src=x onerror=alert(1)>';o.items[0].name='<script>alert(1)</script>';o.notes='<iframe src=x>';
  const html=O.documentHTML(o,()=> '');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe'));assert.ok(html.includes('&lt;script&gt;'));
});
test('payment receipt validates full gross, rejects partial payment, and balance excludes voids',()=>{
  const o=order(),a=O.calculate(o),r={client:o.client,paid_date:'2026-09-22',language:'pt',currency:'USD',payment_method:'paypal',items:[{name:o.number,quantity:1,unitUsd:a.grossUsd}],exchange_rate:1,paid_amount:a.grossUsd,fee_amount:a.feeUsd,gross_usd:a.grossUsd,status:'paid'};
  C.validate(r);assert.throws(()=>C.validate({...r,paid_amount:20}));assert.equal(C.summarize([r,{...r,status:'void'}]).count,1);assert.equal(C.summarize([r]).net,37.01);
});
