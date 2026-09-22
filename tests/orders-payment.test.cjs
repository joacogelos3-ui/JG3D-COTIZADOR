const {test}=require('node:test'),assert=require('node:assert/strict');
require('../receipts-core.js');require('../orders-payment.js');
const save=global.JG3DOrderPayments.save;
const receipt=()=>({source_quote_id:'order-a',client:{name:'Prueba'},paid_date:'2026-09-22',language:'es',currency:'USD',exchange_rate:1,payment_method:'paypal',items:[{name:'Pedido',quantity:1,unitUsd:39.69}],paid_amount:39.69,fee_amount:2.68});
function database({lost=false,failRead=false,failWrite=false}={}){
  const rows=[];let inserts=0;
  return {rows,get inserts(){return inserts},from(){let input=null,filters=[],single=false;
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},insert(r){input=r;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){return Promise.resolve().then(()=>{
      if(failRead&&!input)return {error:Error('Read unavailable')};
      if(input){inserts++;if(failWrite)return {error:Error('Write unavailable')};if(rows.some(r=>r.id===input.id))return {error:{code:'23505'}};rows.push({...input,user_id:'owner',status:'paid'});if(lost){lost=false;return {error:Error('Response lost')}}return {data:rows.at(-1)};}
      const data=rows.filter(r=>filters.every(([k,v])=>r[k]===v));return {data:single?data[0]||null:data};
    }).then(resolve,reject)}};return q;}};
}
test('a retry after losing the commit response returns the same receipt',async()=>{const db=database({lost:true});const a=await save(db,'owner',receipt());const b=await save(db,'owner',{...receipt(),payment_method:'transfer'});assert.equal(a.id,b.id);assert.equal(db.rows.length,1);assert.equal(db.inserts,1);});
test('concurrent attempts cannot create two receipts, even with different methods',async()=>{const db=database();const [a,b]=await Promise.all([save(db,'owner',receipt()),save(db,'owner',{...receipt(),payment_method:'transfer'})]);assert.equal(a.id,b.id);assert.equal(db.rows.length,1);});
test('voiding a receipt permits one replacement with a different id',async()=>{const db=database();const a=await save(db,'owner',receipt());a.status='void';const b=await save(db,'owner',receipt());assert.notEqual(a.id,b.id);assert.equal(db.rows.filter(r=>r.status!=='void').length,1);});
test('partial payments and unavailable verification do not insert',async()=>{const db=database();await assert.rejects(save(db,'owner',{...receipt(),paid_amount:20}));assert.equal(db.inserts,0);const unavailable=database({failRead:true});await assert.rejects(save(unavailable,'owner',receipt()));assert.equal(unavailable.inserts,0);});
test('failed inserts remain failures and session changes prevent writes',async()=>{const db=database({failWrite:true});await assert.rejects(save(db,'owner',receipt()));assert.equal(db.rows.length,0);const other=database();await assert.rejects(save(other,'owner',receipt(),()=>false));assert.equal(other.inserts,0);});
