/* Idempotent persistence for reviewed, fully paid file orders. */
((root)=>{
  'use strict';
  async function save(cloud,owner,receipt,isCurrent=()=>true){
    root.JG3DReceiptCore.validate(receipt);
    const check=()=>{if(!isCurrent())throw Error('La sesión cambió. Volvé a abrir el pedido.');};
    check();
    const existing=await cloud.from('receipts').select('*').eq('user_id',owner).eq('source_quote_id',receipt.source_quote_id).order('issued_at',{ascending:false});
    if(existing.error)throw existing.error;check();
    const active=existing.data.find(r=>r.status!=='void');if(active)return active;
    // One UUID per owner, order and void history, even across concurrent attempts.
    const seed=`${owner}:${receipt.source_quote_id}:${existing.data.map(r=>r.id).sort().join(',')}`;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed));
    const bytes=new Uint8Array(digest).slice(0,16);bytes[6]=(bytes[6]&15)|0x80;bytes[8]=(bytes[8]&63)|0x80;
    const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    check();const result=await cloud.from('receipts').insert({...receipt,id}).select().single();
    if(!result.error){check();return result.data;}
    // An insert may have committed even when its response was lost.
    const retry=await cloud.from('receipts').select('*').eq('user_id',owner).eq('id',id).maybeSingle();
    check();if(retry.error||!retry.data||retry.data.status==='void')throw result.error;
    return retry.data;
  }
  root.JG3DOrderPayments={save};
})(typeof window==='undefined'?globalThis:window);
