/* Private receipts module; uses the existing authenticated Supabase client. */
window.JG3DReceipts = { create(host) {
  'use strict';
  const C=window.JG3DReceiptCore, e=C.escape, $=s=>document.querySelector(s);
  let user=null, records=[], busy=false, fxPending=false, ready=false, generation=0, draftId=null, sourceQuote=null, fxInfo={mode:'manual'}, messageRecord=null;
  const methods=C.labels.es.methods;
  const options=(map,selected='')=>Object.entries(map).map(([v,t])=>`<option value="${e(v)}" ${v===selected?'selected':''}>${e(t)}</option>`).join('');
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Cordoba'}).format(new Date());
  const view=document.createElement('section'); view.id='view-receipts'; view.className='view';
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">VENTAS DIRECTAS</span><h2>Recibos e ingresos</h2><p>Pagos fuera de Cults. Archivos existentes y trabajos vinculados a presupuestos.</p></div><div class="row-actions"><button type="button" class="secondary-button" id="receiptRefresh">Actualizar</button><button type="button" class="primary-button" id="receiptNew">＋ Nuevo recibo</button></div></div>
    <p id="receiptStatus" class="receipt-notice" role="status"></p>
    <div id="receiptEditor" hidden><form id="receiptForm" class="panel-card form-section">
      <div class="split-heading"><div><span class="eyebrow">PAGO CONFIRMADO</span><h2>Registrar una venta</h2></div><button class="secondary-button" type="button" id="receiptCancel">Cerrar</button></div>
      <p class="section-copy" id="receiptSource">Venta de archivos ya diseñados. No se calculan horas de modelado.</p>
      <div class="form-grid two">
        <label>Cliente<select id="rClient"><option value="">Nuevo cliente</option></select></label>
        <label>Copiar presupuesto (opcional)<select id="rQuote"><option value="">Venta directa</option></select></label>
        <label>Nombre / empresa<input id="rName" required maxlength="160"></label>
        <label>Correo<input id="rEmail" type="email" maxlength="180"></label>
        <label>País<select id="rCountry">${options({BR:'Brasil',AR:'Argentina',US:'Estados Unidos',OTHER:'Otro país'})}</select></label>
        <label>Idioma del PDF y mensaje<select id="rLanguage">${options({pt:'Português',es:'Español',en:'English'})}</select></label>
        <label>WhatsApp (opcional)<input id="rPhone" type="tel" maxlength="40"></label>
        <label>Fecha del pago<input id="rDate" type="date" required></label>
      </div>
      <div class="split-heading receipt-subhead"><h3>Archivos / conceptos vendidos</h3><button type="button" id="rAdd" class="secondary-button">＋ Agregar concepto</button></div>
      <p class="section-copy">Precios unitarios en USD. Guardamos referencias y enlaces, sin subir archivos STL.</p><div id="rItems"></div>
      <div class="form-grid two receipt-subhead">
        <label>Medio de pago<select id="rMethod">${options(methods)}</select></label>
        <label>Moneda en que recibiste el pago<select id="rCurrency">${options({USD:'USD · Dólar',BRL:'BRL · Real',ARS:'ARS · Peso argentino'})}</select></label>
        <label>Tipo de cambio de este pago · 1 USD<input id="rRate" type="number" min="0.0000000001" step="any" required value="1"><button type="button" class="row-button" id="rFetchRate">Consultar cambio actual</button></label>
        <label>Importe bruto pagado por el cliente<input id="rPaid" type="number" min="0.01" step="0.01" required></label>
        <label>Comisión descontada · moneda del pago<input id="rFee" type="number" min="0" step="0.01" required value="0"><small id="rFeeHelp">Para transferencias y otros medios podés ingresar la comisión real.</small></label>
        <label>ID / referencia de la operación (opcional)<input id="rRef" maxlength="140"></label>
      </div>
      <p class="section-copy" id="rFxNote">En USD el tipo de cambio es 1. Para pagos anteriores, ingresá el cambio utilizado en esa operación.</p>
      <div id="rTotals" class="receipt-totals" aria-live="polite"></div>
      <label>Detalle de entrega / notas para el cliente<textarea id="rNotes" rows="3" maxlength="500" placeholder="Archivos enviados, versión o instrucciones de entrega…"></textarea></label>
      <label class="receipt-confirm"><input id="rConfirmed" type="checkbox" required> Confirmé el pago recibido, la moneda y la comisión real (0 si no hubo comisión).</label>
      <p class="section-copy">El recibo se emite al guardar. Luego podés marcarlo enviado o anularlo; los importes emitidos se conservan.</p>
      <p id="rError" class="receipt-error" role="alert"></p><button class="primary-button" type="submit" id="rSave">Guardar pago y crear recibo</button>
    </form></div>
    <div class="panel-card receipt-filters"><div class="form-grid three">
      <label>Año del pago<select id="rfYear"><option value="">Todos los años</option></select></label>
      <label>Buscar<input type="search" id="rfSearch" placeholder="Recibo, cliente o archivo"></label>
      <label>Cliente<select id="rfClient"><option value="">Todos</option></select></label>
      <label>Medio de pago<select id="rfMethod"><option value="">Todos</option>${options(methods)}</select></label>
      <label>Moneda cobrada<select id="rfCurrency"><option value="">Todas</option>${options({USD:'USD',BRL:'BRL',ARS:'ARS'})}</select></label>
      <label>Estado<select id="rfState">${options({'':'Todos',paid:'Pagado',sent:'Enviado',void:'Anulado'})}</select></label>
      <label>Origen<select id="rfOrigin">${options({'':'Todos',direct:'Archivos existentes',quote:'Desde presupuesto',order:'Pedido de archivos'})}</select></label>
      <label>Agrupar resumen<select id="rfGroup">${options({year:'Año del pago',month:'Mes del pago',country:'País',client:'Cliente',method:'Medio de pago',currency:'Moneda'},'year')}</select></label>
    </div><button type="button" id="rfClear" class="row-button">Limpiar filtros</button></div>
    <div class="metrics-grid" id="receiptMetrics"></div>
    <p class="section-copy">Totales en USD usando el cambio guardado en cada pago. Los anulados no suman; enviar un recibo no vuelve a contabilizarlo.</p>
    <div class="table-card"><div class="responsive-table"><table><thead><tr><th>Grupo</th><th>Pagos</th><th>Bruto USD</th><th>Comisiones USD</th><th>Neto USD</th></tr></thead><tbody id="receiptGroups"></tbody></table></div></div>
    <div class="table-card receipt-subhead"><div class="responsive-table"><table><thead><tr><th>Recibo / pago</th><th>Cliente</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="receiptRows"></tbody></table></div><p id="receiptEmpty" class="empty-state">Todavía no hay recibos.</p></div>
    <section id="receiptMessage" class="panel-card receipt-subhead" hidden><h3>Mensaje para WhatsApp</h3><textarea id="receiptMessageText" rows="8" aria-label="Mensaje de WhatsApp editable"></textarea><p class="section-copy">Copiá el mensaje y adjuntá el PDF en WhatsApp. El sistema no envía mensajes automáticamente.</p><button type="button" class="primary-button" id="receiptCopy">Copiar mensaje</button><button type="button" class="secondary-button" id="receiptMessageClose">Cerrar</button></section>`;
  document.querySelector('.main-content').appendChild(view);
  function selects() {
    const prev=$('#rClient').value, filter=$('#rfClient').value;
    $('#rClient').innerHTML='<option value="">Nuevo cliente</option>'+host.clients().map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join('');
    $('#rClient').value=prev;
    const all=new Map(host.clients().map(c=>[c.id,c.name])); records.forEach(r=>{if(!all.has(r.client_id))all.set(r.client_id,r.client.name);});
    $('#rfClient').innerHTML='<option value="">Todos</option>'+[...all].map(([id,name])=>`<option value="${e(id)}">${e(name)}</option>`).join(''); $('#rfClient').value=filter;
    const selectedYear=$('#rfYear')?.value || '';
    const years=new Set([String(new Date().getFullYear()),...records.map(r=>String(r.paid_date||'').slice(0,4)).filter(Boolean)]);
    if($('#rfYear')) $('#rfYear').innerHTML='<option value="">Todos los años</option>'+[...years].sort((a,b)=>b.localeCompare(a)).map(y=>`<option value="${e(y)}">${e(y)}</option>`).join('');
    if($('#rfYear') && years.has(selectedYear)) $('#rfYear').value=selectedYear;
    $('#rQuote').innerHTML='<option value="">Venta directa</option>'+host.quotes().map(q=>`<option value="${e(q.id)}">${e(q.number)} · ${e(q.data.clientName)}</option>`).join('');
    $('#rQuote').value=sourceQuote?.id || '';
  }
  function addItem(item={}) {
    if($('#rItems').children.length>=30) return host.toast('Máximo 30 conceptos por recibo.');
    const row=document.createElement('div'); row.className='receipt-item';
    row.innerHTML=`<div class="form-grid two"><label>Archivo / concepto<input data-item="name" maxlength="160" required value="${e(item.name || '')}"></label><label>Descripción breve<input data-item="description" maxlength="240" value="${e(item.description || '')}"></label><label>Formato<input data-item="format" maxlength="40" placeholder="STL / STEP / ZIP" value="${e(item.format || 'STL')}"></label><label>Versión<input data-item="version" maxlength="40" value="${e(item.version || '')}"></label><label>Cantidad<input data-item="quantity" type="number" min="1" max="10000" step="1" required value="${e(item.quantity || 1)}"></label><label>Precio unitario USD<input data-item="unitUsd" type="number" min="0" max="1000000" step="0.01" required value="${e(item.unitUsd ?? '')}"></label><label class="span-two">Enlace de entrega (opcional)<input data-item="url" type="url" maxlength="2048" placeholder="https://…" value="${e(item.url || '')}"></label></div><button type="button" class="row-button danger" data-remove-item>Quitar concepto</button>`;
    $('#rItems').appendChild(row);
  }
  function items() { return [...$('#rItems').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-item]')].map(n=>[n.dataset.item,['quantity','unitUsd'].includes(n.dataset.item)?Number(n.value):n.value.trim()]))); }
  function calculation(recalcPaid=false) {
    const gross=C.amounts(items(),0,0,1).grossUsd, paypal=$('#rMethod').value==='paypal';
    let code=$('#rCurrency').value;
    if(paypal) { $('#rCurrency').value='USD'; $('#rRate').value='1'; $('#rCurrency').disabled=true; $('#rRate').readOnly=true; $('#rPaid').readOnly=false; $('#rFetchRate').disabled=true; $('#rFee').readOnly=true; }
    else if(code==='USD') {$('#rCurrency').disabled=false;$('#rRate').value='1'; $('#rRate').readOnly=true; $('#rPaid').readOnly=true; $('#rFetchRate').disabled=true; $('#rFee').readOnly=false;}
    else {$('#rCurrency').disabled=false;$('#rRate').readOnly=false;$('#rPaid').readOnly=false;$('#rFetchRate').disabled=false;$('#rFee').readOnly=false;}
    code=$('#rCurrency').value;
    if(recalcPaid || (!paypal && code==='USD')) $('#rPaid').value=Number($('#rRate').value)>0?C.round(gross*Number($('#rRate').value)):'';
    if(paypal) {
      const grossPaid=Number($('#rPaid').value)||0,cfg=host.settings?.()||{},percent=Math.min(99,Math.max(0,Number(cfg.paypalPercent??6))),fixed=Math.max(0,Number(cfg.paypalFixed??.30));
      $('#rFee').value=grossPaid>0?C.round(Math.min(grossPaid,grossPaid*percent/100+fixed)):0;
      $('#rFeeHelp').textContent=`Calculada automáticamente: ${percent}% + USD ${fixed.toFixed(2)}. El pago PayPal se registra en USD.`;
    } else $('#rFeeHelp').textContent='Para transferencias y otros medios podés ingresar la comisión real.';
    const rate=Number($('#rRate').value);
    if (!(rate>0)) { $('#rTotals').textContent=`Venta: ${C.currency(gross)} · Ingresá el tipo de cambio real del pago para calcular el importe y el neto.`;return; }
    const a=C.amounts(items(),Number($('#rPaid').value),Number($('#rFee').value),rate);
    $('#rTotals').textContent=`Venta: ${C.currency(gross)} · Comisión: ${C.currency(a.fee,code)} · Neto: ${C.currency(a.net,code)} (≈ ${C.currency(a.netUsd)})`;
  }
  function useClient(id) {
    const c=host.clients().find(c=>c.id===id); if(!c)return;
    $('#rClient').value=c.id; $('#rName').value=c.name;$('#rEmail').value=c.email || '';$('#rPhone').value=c.phone || '';$('#rCountry').value=c.country;$('#rLanguage').value=c.language || 'en';
  }
  function openNew(clientId='',quoteId='') {
    host.navigate('receipts'); if(!ready)return;
    if(!$('#receiptEditor').hidden && $('#rName').value && !confirm('¿Descartar el recibo sin guardar y comenzar otro?'))return;
    $('#receiptForm').reset(); $('#rItems').replaceChildren();$('#rError').textContent=''; $('#receiptEditor').hidden=false;
    draftId=crypto.randomUUID();sourceQuote=null;fxInfo={mode:'manual'};selects();$('#rDate').value=today();$('#rDate').max=today();$('#rRate').value=1;
    $('#rCurrency').value='USD';$('#receiptSource').textContent='Venta de archivos ya diseñados. No se calculan horas de modelado.';
    if(clientId)useClient(clientId); if(quoteId)copyQuote(quoteId);else addItem(); calculation(true);
    $('#receiptEditor').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function copyQuote(id) {
    const q=host.quotes().find(q=>q.id===id); if(!q){sourceQuote=null;return;}
    sourceQuote=q; const d=q.data;useClient(d.clientId);
    $('#rName').value=d.clientName;$('#rEmail').value=d.clientEmail || '';$('#rPhone').value=d.clientPhone || '';$('#rCountry').value=d.country;$('#rLanguage').value=d.language;
    $('#rCurrency').value=d.paymentMethod==='paypal'?'USD':d.currency; $('#rMethod').value=d.paymentMethod==='paypal'?'paypal':'other';
    $('#rRate').value=$('#rCurrency').value==='USD'?1:d.exchangeRate;fxInfo={mode:'quote',source:q.number,rateDate:d.exchangeRateInfo?.date || null};
    $('#rItems').replaceChildren();addItem({name:d.projectTitle,description:(d.scope || '').slice(0,240),format:(d.deliverables || []).join(' / ').toUpperCase(),unitUsd:C.round(d.calculation.grossUsd)});
    $('#rQuote').value=id;$('#rNotes').value='';$('#rFee').value=0;$('#rConfirmed').checked=false;
    $('#receiptSource').textContent=`Copiado de ${q.number}. Revisá el importe efectivamente pagado: si es una seña o saldo, modificá el concepto y su precio. No se marca el presupuesto como cobrado automáticamente.`;
    const prior=records.filter(r=>r.source_quote_id===id && r.status!=='void');if(prior.length)$('#receiptSource').textContent+=` Ya hay ${prior.length} recibo(s) de este presupuesto. Evitá registrar el mismo pago dos veces.`;
    calculation(true);
  }
  async function createFromQuote(q) {
    if(!user || !ready) throw Error('El módulo de recibos todavía no terminó de cargar.');
    if(!q || !q.id || !q.data) throw Error('El presupuesto no tiene datos suficientes para crear el ingreso.');
    const d=q.data, transactionRef=`quote:${q.id}:delivered`;
    const localExisting=records.find(r=>r.transaction_ref===transactionRef && r.status!=='void');
    if(localExisting) return {record:localExisting,created:false};
    const existing=await host.cloud.from('receipts').select('*').eq('user_id',user.id).eq('source_quote_id',q.id).order('issued_at',{ascending:false});
    if(existing.error) throw existing.error;
    const quoteReceipts=existing.data || [];
    const existingAuto=quoteReceipts.find(r=>r.transaction_ref===transactionRef && r.status!=='void');
    if(existingAuto) { records=[existingAuto,...records.filter(r=>r.id!==existingAuto.id)]; selects(); render(); return {record:existingAuto,created:false}; }
    const grossUsd=C.round(Number(d.calculation?.grossUsd || 0));
    if(!(grossUsd>0)) throw Error('El presupuesto no tiene un total positivo.');
    const previousUsd=C.round(quoteReceipts.filter(r=>r.status!=='void').reduce((sum,r)=>sum+Number(r.gross_usd || 0),0));
    const outstandingUsd=C.round(Math.max(0,grossUsd-previousUsd));
    if(outstandingUsd<=0.01) {
      const latest=quoteReceipts.find(r=>r.status!=='void') || quoteReceipts[0] || null;
      if(latest) { records=[latest,...records.filter(r=>r.id!==latest.id)]; selects(); render(); return {record:latest,created:false}; }
      throw Error('El presupuesto ya está completamente registrado en recibos.');
    }
    const currency=d.paymentMethod==='paypal'?'USD':(d.currency || 'USD');
    const rate=currency==='USD'?1:Number(d.exchangeRate || 1);
    if(!(rate>0)) throw Error('El presupuesto no tiene un tipo de cambio válido.');
    const feeUsd=d.paymentMethod==='paypal'?C.round(Number(d.calculation?.paymentFee || 0) * outstandingUsd / grossUsd):0;
    const r={id:crypto.randomUUID(),paid_date:today(),client_id:d.clientId || '',source_quote_id:q.id,
      client:{name:d.clientName || 'Cliente',email:d.clientEmail || '',phone:d.clientPhone || '',country:d.country || 'OTHER'},
      language:d.language || 'en',items:[{name:`${d.projectTitle || 'Trabajo de modelado 3D'}${previousUsd>0?' · Saldo final':''}`,description:(d.scope || '').slice(0,240),format:(d.deliverables || []).join(' / ').toUpperCase() || 'DIGITAL',version:'',quantity:1,unitUsd:outstandingUsd}],
      currency,exchange_rate:rate,exchange_info:{mode:'quote_delivered',sourceQuote:q.number,quoteExchangeRateInfo:d.exchangeRateInfo || {},capturedAt:new Date().toISOString()},
      paid_amount:C.round(grossUsd*rate),fee_amount:C.round(feeUsd*rate),payment_method:d.paymentMethod==='paypal'?'paypal':'other',transaction_ref:transactionRef,
      notes:`Ingreso automático al marcar ${q.number} como Entregado.${previousUsd>0?' Se descontaron los recibos previos vinculados.':''}`};
    r.client_id=await host.ensureClient(r);
    const result=await host.cloud.from('receipts').insert(r).select().single();
    if(result.error) {
      if(result.error.code==='23505') {
        const retry=await host.cloud.from('receipts').select('*').eq('user_id',user.id).eq('transaction_ref',transactionRef).order('issued_at',{ascending:false}).limit(1);
        if(!retry.error && retry.data?.[0]) { records=[retry.data[0],...records.filter(x=>x.id!==retry.data[0].id)]; selects(); render(); return {record:retry.data[0],created:false}; }
      }
      throw result.error;
    }
    records=[result.data,...records.filter(x=>x.id!==result.data.id)];selects();render();
    return {record:result.data,created:true};
  }
  function payload() {
    return {id:draftId,paid_date:$('#rDate').value,client_id:$('#rClient').value,source_quote_id:sourceQuote?.id || null,
      client:{name:$('#rName').value.trim(),email:$('#rEmail').value.trim(),phone:$('#rPhone').value.trim(),country:$('#rCountry').value},
      language:$('#rLanguage').value,items:items(),currency:$('#rCurrency').value,exchange_rate:Number($('#rRate').value),exchange_info:{...fxInfo,capturedAt:new Date().toISOString()},
      paid_amount:Number($('#rPaid').value),fee_amount:Number($('#rFee').value),payment_method:$('#rMethod').value,transaction_ref:$('#rRef').value.trim(),notes:$('#rNotes').value.trim()};
  }
  async function save(event) {
    event.preventDefault();if(busy || fxPending || !ready || !user)return;
    const opUser=user.id,epoch=generation;busy=true;$('#rSave').disabled=true;$('#rError').textContent='';
    try {
      const r=payload();C.validate(r);if(r.paid_date>today())throw Error('La fecha del pago no puede ser futura.');
      if(!$('#rConfirmed').checked)throw Error('Confirmá el pago y la comisión real.');
      // Same UUID is retained on retries, including a response lost after a successful insert.
      const found=await host.cloud.from('receipts').select('*').eq('user_id',opUser).eq('id',r.id).maybeSingle();if(found.error)throw found.error;
      let saved=found.data;
      if(!saved){
        r.client_id=await host.ensureClient(r);if(epoch!==generation || user?.id!==opUser) return;
        const result=await host.cloud.from('receipts').insert(r).select().single();if(result.error)throw result.error;saved=result.data;
      }
      if(epoch!==generation || user?.id!==opUser)return;
      records=[saved,...records.filter(x=>x.id!==saved.id)];$('#receiptEditor').hidden=true;draftId=null;selects();render();host.preview(saved);host.toast(`Recibo ${saved.number} guardado en Supabase.`);
    }catch(error){$('#rError').textContent=error.code==='23505'?'Ya existe un recibo para esa operación. Revisá el historial antes de volver a guardarlo.':`No se guardó el recibo: ${error.message || 'revisá tu conexión e intentá nuevamente.'}`;}
    finally{busy=false;$('#rSave').disabled=!ready;}
  }
  async function refresh(strict=false) {
    if(!user)return; const epoch=++generation,opUser=user.id;ready=false;$('#receiptNew').disabled=true;$('#rSave').disabled=true;$('#receiptStatus').textContent='Cargando recibos privados…';
    try {
      const all=[];
      for(let offset=0;;offset+=1000){const {data,error}=await host.cloud.from('receipts').select('*').eq('user_id',opUser).order('issued_at',{ascending:false}).order('id').range(offset,offset+999);if(error)throw error;all.push(...data);if(data.length<1000)break;}
      if(epoch!==generation || user?.id!==opUser)return;
      records=all;ready=true;$('#receiptStatus').textContent='Conectado · los recibos se guardan en tu cuenta privada.';selects();render();
    }catch(error){if(epoch!==generation)return;records=[];render();$('#receiptStatus').textContent='No se pudieron cargar los recibos. Revisá tu conexión y presioná Actualizar. Los presupuestos siguen disponibles.';if(strict)throw Error('No se pudieron verificar los pagos. Actualizá los recibos antes de continuar.');}
    finally{if(epoch===generation){$('#receiptNew').disabled=!ready;$('#rSave').disabled=!ready;}}
  }
  function filtered() {
    const q=$('#rfSearch').value.trim().toLowerCase(),year=$('#rfYear').value;return records.filter(r=>(!year || String(r.paid_date||'').slice(0,4)===year) && (!$('#rfClient').value || r.client_id===$('#rfClient').value) && (!$('#rfMethod').value || r.payment_method===$('#rfMethod').value) && (!$('#rfCurrency').value || r.currency===$('#rfCurrency').value) && (!$('#rfState').value || r.status===$('#rfState').value) && (!$('#rfOrigin').value || (r.exchange_info?.fileOrder?'order':r.source_quote_id?'quote':'direct')===$('#rfOrigin').value) && [r.number,r.client.name,...r.items.map(i=>i.name),...(r.exchange_info?.fileOrder?.items || []).map(i=>i.name)].join(' ').toLowerCase().includes(q));
  }
  function render() {
    const rows=filtered(),s=C.summarize(rows);
    $('#receiptMetrics').innerHTML=[['Pagos registrados',s.count],['Bruto',C.currency(s.gross)],['Comisiones',C.currency(s.fee)],['Neto',C.currency(s.net)]].map(([label,val])=>`<article class="metric-card"><span>${label}</span><strong>${val}</strong><small>Selección actual · sin anulados</small></article>`).join('');
    const group=$('#rfGroup').value,groups=new Map();
    rows.filter(r=>r.status!=='void').forEach(r=>{const key=({year:r.paid_date.slice(0,4),month:r.paid_date.slice(0,7),country:r.client.country,client:r.client_id,method:r.payment_method,currency:r.currency})[group];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
    $('#receiptGroups').innerHTML=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,rs])=>{const x=C.summarize(rs),label=group==='country'?C.country(key,'es'):group==='client'?rs[0].client.name:group==='method'?methods[key]:key;return `<tr><td>${e(label)}</td><td>${x.count}</td><td>${C.currency(x.gross)}</td><td>${C.currency(x.fee)}</td><td>${C.currency(x.net)}</td></tr>`;}).join('') || '<tr><td colspan="5">Sin pagos para esta selección.</td></tr>';
    $('#receiptRows').innerHTML=rows.map(r=>`<tr><td><strong>${e(r.number)}</strong><small>${e(r.paid_date)} · ${e(methods[r.payment_method])}</small></td><td>${e(r.client.name)}<small>${r.exchange_info?.fileOrder?'Pedido de archivos':r.source_quote_id?'Desde presupuesto':'Archivos existentes'}</small></td><td>${C.currency(r.paid_amount,r.currency)}</td><td>${C.currency(r.fee_amount,r.currency)}</td><td>${C.currency(r.paid_amount-r.fee_amount,r.currency)}</td><td><span class="status-badge ${r.status==='void'?'draft':'delivered'}">${({paid:'Pagado',sent:'Enviado',void:'Anulado'})[r.status]}</span>${r.status==='void'?`<small>${e(r.void_reason)}</small>`:''}</td><td><div class="row-actions"><button class="row-button" type="button" data-r-pdf="${r.id}">PDF</button>${r.status!=='void'?`<button class="row-button" type="button" data-r-message="${r.id}">WhatsApp</button>${r.status==='paid'?`<button class="row-button" type="button" data-r-sent="${r.id}">Marcar enviado</button>`:''}<button class="row-button danger" type="button" data-r-void="${r.id}">Anular</button>`:''}</div></td></tr>`).join('');
    $('#receiptEmpty').hidden=rows.length>0;
    host.incomeChanged?.();
  }
  async function changeStatus(id,status) {
    if(busy || !user)return;const r=records.find(x=>x.id===id);if(!r || r.status==='void')return;
    let reason=null;if(status==='void'){reason=prompt(`Motivo de anulación de ${r.number}. Se conservará el documento y dejará de sumar ingresos.`);if(!reason)return;if(reason.trim().length<3)return host.toast('Ingresá un motivo de al menos 3 caracteres.');}
    const epoch=generation;busy=true;
    try{const {data,error}=await host.cloud.from('receipts').update({status,...(reason?{void_reason:reason.trim()}: {})}).eq('user_id',user.id).eq('id',id).select().single();if(error)throw error;if(epoch!==generation)return;records=records.map(x=>x.id===id?data:x);render();host.closePreview();$('#receiptMessage').hidden=true;host.toast(status==='void'?'Recibo anulado.':'Recibo marcado como enviado.');}catch(error){host.toast('No se pudo cambiar el estado. Actualizá el listado e intentá nuevamente.');}finally{busy=false;}
  }
  function showMessage(r) {if(r.status==='void')return;messageRecord=r;$('#receiptMessageText').value=C.message(r);$('#receiptMessage').hidden=false;$('#receiptMessage').scrollIntoView({behavior:'smooth'});}
  async function saveOrderPayment(receipt) {
    if(!user || !ready || busy) throw Error('Esperá a que terminen de cargar los recibos.');
    const owner=user.id,epoch=generation;busy=true;
    try {
      const saved=await window.JG3DOrderPayments.save(host.cloud,owner,receipt,()=>user?.id===owner && epoch===generation);
      records=[saved,...records.filter(r=>r.id!==saved.id)];selects();render();return saved;
    } finally {busy=false;}
  }
  async function fetchRate() {
    const code=$('#rCurrency').value;if(code==='USD')return;
    if($('#rDate').value!==today())return host.toast('Para un pago anterior, ingresá el cambio real de esa fecha.');
    fxPending=true;$('#rFetchRate').disabled=true;$('#rSave').disabled=true;
    try{const rec=await host.rate(code,true);if($('#rCurrency').value!==code || $('#rDate').value!==today())return;$('#rRate').value=rec.rate;fxInfo={...rec,mode:'reference'};$('#rFxNote').textContent=`${rec.source}. Referencia consultada hoy; ajustala si tu cobro usó otro cambio.`;calculation(true);}catch(error){$('#rFxNote').textContent='No se pudo consultar el cambio. Ingresá el valor real de la operación.';}finally{fxPending=false;$('#rFetchRate').disabled=false;$('#rSave').disabled=!ready;}
  }
  $('#receiptForm').addEventListener('submit',save);
  $('#receiptForm').addEventListener('input',ev=>{if(ev.target.id!=='rConfirmed')$('#rConfirmed').checked=false;});
  $('#receiptNew').onclick=()=>openNew();$('#receiptCancel').onclick=()=>{$('#receiptEditor').hidden=true;};$('#receiptRefresh').onclick=()=>{if(!busy)refresh();};
  $('#rAdd').onclick=()=>addItem();$('#rItems').addEventListener('click',ev=>{if(ev.target.closest('[data-remove-item]')){ev.target.closest('.receipt-item').remove();calculation(true);}});
  $('#rItems').addEventListener('input',()=>{calculation(true);$('#rConfirmed').checked=false;});
  $('#rClient').onchange=()=>{const id=$('#rClient').value;if(id)useClient(id);else{$('#rName').value='';$('#rEmail').value='';$('#rPhone').value='';}};
  $('#rCountry').onchange=()=>{$('#rLanguage').value=({BR:'pt',AR:'es'})[$('#rCountry').value] || 'en';};
  $('#rQuote').onchange=()=>{copyQuote($('#rQuote').value);};
  $('#rMethod').onchange=()=>{fxInfo={mode:'manual'};$('#rConfirmed').checked=false;calculation(false);};
  $('#rCurrency').onchange=()=>{$('#rRate').value=$('#rCurrency').value==='USD'?1:'';$('#rPaid').value='';fxInfo={mode:'manual'};$('#rFee').value=0;$('#rConfirmed').checked=false;calculation(true);};
  $('#rRate').oninput=()=>{fxInfo={mode:'manual'};calculation(true);$('#rConfirmed').checked=false;};
  $('#rPaid').oninput=()=>{const gross=C.amounts(items(),0,0,1).grossUsd;if(gross>0 && $('#rCurrency').value!=='USD')$('#rRate').value=(Number($('#rPaid').value)/gross).toFixed(10);fxInfo={mode:'actual_payment'};calculation();$('#rConfirmed').checked=false;};
  $('#rFee').oninput=()=>calculation();$('#rFetchRate').onclick=fetchRate;
  document.querySelectorAll('[id^="rf"]').forEach(n=>{if(n.tagName!=='BUTTON'){n.addEventListener('input',render);n.addEventListener('change',render);}});
  $('#rfClear').onclick=()=>{document.querySelectorAll('.receipt-filters input,.receipt-filters select').forEach(n=>{n.value=n.id==='rfGroup'?'year':'';});render();};
  view.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;const d=b.dataset,id=d.rPdf || d.rMessage || d.rSent || d.rVoid;if(!id)return;const r=records.find(x=>x.id===id);if(!r)return;if(d.rPdf)host.preview(r);if(d.rMessage)showMessage(r);if(d.rSent)changeStatus(id,'sent');if(d.rVoid)changeStatus(id,'void');});
  $('#receiptCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#receiptMessageText').value);host.toast('Mensaje copiado. Adjuntá el PDF al enviarlo.');}catch{$('#receiptMessageText').select();host.toast('Seleccioná y copiá el mensaje manualmente.');}};
  $('#receiptMessageClose').onclick=()=>{$('#receiptMessage').hidden=true;messageRecord=null;};
  return { async start(u){user=u;await refresh();},stop(){generation++;user=null;ready=false;records=[];messageRecord=null;$('#receiptEditor').hidden=true;$('#receiptMessage').hidden=true;$('#receiptForm').reset();$('#rItems').replaceChildren();$('#receiptMessageText').value='';render();},refresh,openNew,createFromQuote,saveOrderPayment,refreshStrict:()=>refresh(true),records:()=>structuredClone(records),
    summary(period=''){const value=String(period||'');return C.summarize(records.filter(r=>!value||String(r.paid_date||'').slice(0,value.length)===value));},
    history(id){host.navigate('receipts');selects();$('#rfClear').click();$('#rfClient').value=id;render();},render(){selects();render();},
    document:r=>r.exchange_info?.fileOrder ? window.JG3DOrderCore.documentHTML(r.exchange_info.fileOrder,host.footer,r.exchange_info.fileOrder.items,1,1,r) : C.documentHTML(r,host.footer),message:C.message,
    preparePrint(r){
      if(r.exchange_info?.fileOrder)return window.JG3DOrderCore.preparePrint(r.exchange_info.fileOrder,host.footer,r);
      if ($('#quotePrintSheet')) return $('#quotePrintSheet');
      const sheet=document.createElement('div');sheet.id='quotePrintSheet';sheet.className='receipt-print-root';document.body.appendChild(sheet);
      // Split long receipts across A4 sheets instead of shrinking every item to illegibility.
      let size=6; const build=()=>{const chunks=[];for(let i=0;i<r.items.length;i+=size)chunks.push(r.items.slice(i,i+size));sheet.innerHTML=chunks.map((chunk,i)=>`<section class="receipt-print-page"><article class="quote-document receipt-document" lang="${r.language}">${C.documentHTML(r,host.footer,chunk,i+1,chunks.length)}</article></section>`).join('');};
      build();while(size>1 && [...sheet.querySelectorAll('article')].some(a=>a.offsetHeight>1000)){size--;build();}
      return sheet;
    }
  };
} };
