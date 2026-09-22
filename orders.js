/* Catalog orders share the existing private workspace; receipts remain the income source. */
window.JG3DOrders={create(host){
  'use strict';
  const C=window.JG3DReceiptCore,O=window.JG3DOrderCore,e=C.escape,$=s=>document.querySelector(s);
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Cordoba'}).format(new Date());
  const opt=map=>Object.entries(map).map(([v,label])=>`<option value="${e(v)}">${e(label)}</option>`).join('');
  let draft=null,paymentOrder=null,busy=false,active=false,catalog=[],catalogLoaded=false,generation=0;
  const view=document.createElement('section');view.id='view-orders';view.className='view';
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">ARCHIVOS EXISTENTES</span><h2>Pedidos de archivos</h2><p>Armá el pedido, compartí el presupuesto y confirmá el cobro antes de entregar.</p></div><button class="primary-button" type="button" id="orderNew">＋ Nuevo pedido</button></div>
  <p id="orderNotice" class="receipt-notice" role="status">Los pedidos pendientes no suman ingresos al balance.</p>
  <form id="orderForm" class="panel-card form-section" hidden>
    <div class="split-heading"><h3 id="orderEditorTitle">Nuevo pedido</h3><button type="button" class="secondary-button" id="orderClose">Cerrar</button></div>
    <div class="form-grid two">
      <label>Cliente<select id="oClient"><option value="">Nuevo cliente</option></select></label>
      <label>Nombre / empresa<input id="oName" required maxlength="160"></label>
      <label>Correo<input id="oEmail" type="email" maxlength="180"></label><label>WhatsApp<input id="oPhone" maxlength="40"></label>
      <label>País<select id="oCountry">${opt({BR:'Brasil',AR:'Argentina',US:'Estados Unidos',OTHER:'Otro país'})}</select></label>
      <label>Idioma del presupuesto<select id="oLanguage">${opt({pt:'Português',en:'English',es:'Español'})}</select></label>
    </div>
    <section class="order-catalog"><div class="split-heading"><h3>Agregar archivos</h3><button type="button" class="row-button" id="oReloadCatalog">Actualizar catálogo</button></div>
      <label>Buscar en el catálogo<input id="oSearch" type="search" placeholder="Nombre, ECU o vehículo…"></label>
      <p id="oCatalogStatus" class="section-copy" role="status"></p><div id="oResults" class="order-results"></div>
      <button type="button" class="secondary-button" id="oManual">＋ Agregar producto manual</button>
    </section>
    <div id="oItems"></div><p class="section-copy">Precios en USD editables para este pedido. Cada fila corresponde a un archivo o pack.</p>
    <div class="form-grid two">
      <label>Personalización<select id="oPersonalized"><option value="0">Marca JG3D · sin adicional</option><option value="1">Marca del cliente · +20% a todos los archivos</option></select></label>
      <label>Descuento fijo USD<input id="oDiscount" type="number" min="0" step="0.01" value="0" required></label>
      <label>Permiso de uso<select id="oLicense">${opt({personal:'Uso personal',commercial:'Venta de piezas impresas'})}</select></label>
      <label>Forma de pago<select id="oMethod">${opt({paypal:'PayPal · cubrir comisión',other:'Transferencia / otro medio'})}</select></label>
      <label>Válido hasta<input id="oValid" type="date" required></label>
    </div>
    <div id="oTotals" class="receipt-totals" aria-live="polite"></div>
    <label>Observaciones para el cliente<textarea id="oNotes" rows="3" maxlength="500" placeholder="Marca del cliente, plazo de personalización…"></textarea></label>
    <p class="section-copy">100% antes de personalizar o entregar. El PDF incluye cada archivo, adicional por logo, descuento y total final.</p>
    <p id="oError" class="receipt-error" role="alert"></p><button type="submit" class="primary-button" id="oSave">Guardar pedido y ver presupuesto</button>
  </form>
  <form id="orderPayment" class="panel-card form-section" hidden>
    <div class="split-heading"><h3>Revisar pago completo</h3><button type="button" class="secondary-button" id="opClose">Cerrar</button></div>
    <p id="opSummary" class="receipt-notice"></p>
    <div class="form-grid two">
      <label>Fecha del pago<input type="date" id="opDate" required></label>
      <label>Medio de pago<select id="opMethod">${opt(C.labels.es.methods)}</select></label>
      <label>Moneda recibida<select id="opCurrency">${opt({USD:'USD',BRL:'BRL',ARS:'ARS'})}</select></label>
      <label>Tipo de cambio acordado · 1 USD<input id="opRate" type="number" min="0.0000000001" step="any" required value="1"><button type="button" class="row-button" id="opFetchRate">Consultar cambio actual</button></label>
      <label>Importe bruto recibido<input id="opPaid" type="number" min="0.01" step="0.01" required></label>
      <label>Comisión descontada · moneda del pago<input id="opFee" type="number" min="0" step="0.01" required value="0"></label>
      <label>Referencia del cobro (opcional)<input id="opRef" maxlength="140"></label>
    </div>
    <p id="opTotals" class="receipt-totals" aria-live="polite"></p>
    <label class="receipt-confirm"><input type="checkbox" id="opConfirmed" required> Revisé la fecha, el medio, el importe y la comisión. El pedido está pagado por completo.</label>
    <p class="section-copy">Se genera un único recibo y el ingreso neto se suma al balance. Cerrar esta pantalla no registra el pago.</p>
    <p id="opError" class="receipt-error" role="alert"></p><button class="primary-button" type="submit" id="opSave">Confirmar cobro y crear recibo</button>
  </form>
  <div class="panel-card receipt-filters"><div class="form-grid two"><label>Buscar pedido<input id="oHistorySearch" type="search" placeholder="Cliente, archivo o número…"></label><label>Estado<select id="oFilter">${opt({'':'Todos',pending:'Pendiente de pago',paid:'Pagado',delivered:'Entregado'})}</select></label></div></div>
  <div class="table-card"><div class="responsive-table"><table><thead><tr><th>Pedido / cliente</th><th>Archivos</th><th>Total USD</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="oRows"></tbody></table></div><p id="oEmpty" class="empty-state">Todavía no hay pedidos de archivos.</p></div>`;
  document.querySelector('.main-content').appendChild(view);
  const paidReceipt=order=>host.receipts().find(r=>r.source_quote_id===order.id&&r.status!=='void');
  const state=order=>!paidReceipt(order)?'pending':order.deliveredReceiptId===paidReceipt(order).id?'delivered':'paid';
  function clientOptions(){const value=$('#oClient').value;$('#oClient').innerHTML='<option value="">Nuevo cliente</option>'+host.clients().map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join('');$('#oClient').value=value;}
  function readDraft(){return {...draft,clientId:$('#oClient').value,client:{name:$('#oName').value.trim(),email:$('#oEmail').value.trim(),phone:$('#oPhone').value.trim(),country:$('#oCountry').value},language:$('#oLanguage').value,
    items:[...$('#oItems').children].map(row=>({id:row.dataset.productId || '',url:row.dataset.productUrl || '',name:row.querySelector('[data-o-name]').value.trim(),unitUsd:Number(row.querySelector('[data-o-price]').value)})),
    personalized:$('#oPersonalized').value==='1',discountUsd:Number($('#oDiscount').value),license:$('#oLicense').value,paymentMethod:$('#oMethod').value,validUntil:$('#oValid').value,notes:$('#oNotes').value.trim()};}
  function totals(){if(!draft)return;try{const a=O.calculate(readDraft());$('#oTotals').innerHTML=`Archivos: <strong>${C.currency(a.subtotalUsd)}</strong> · Logo: <strong>+ ${C.currency(a.logoUsd)}</strong> · Descuento: <strong>− ${C.currency(a.discountUsd)}</strong><br>Neto deseado: ${C.currency(a.netUsd)} · Total a pagar: <strong>${C.currency(a.grossUsd)}</strong>${$('#oMethod').value==='paypal'?`<br>Comisión estimada: ${draft.paypalPercent}% + ${C.currency(draft.paypalFixed)}. Incluida en el total.`:''}`;}catch(error){$('#oTotals').textContent=error.message;}}
  function addItem(item={}){
    if($('#oItems').children.length>=30)return host.toast('Máximo 30 archivos por pedido.');
    const row=document.createElement('div');row.className='order-item';row.dataset.productId=item.id || '';row.dataset.productUrl=item.url || '';
    row.innerHTML=`<label>Archivo / pack<input data-o-name required maxlength="200" value="${e(item.name || '')}"></label><label>Precio USD<input data-o-price required type="number" min="0" max="1000000" step="0.01" value="${e(item.unitUsd ?? item.price ?? '')}"></label><button type="button" class="row-button danger" data-o-remove>Quitar</button>`;
    $('#oItems').appendChild(row);totals();
  }
  function searchCatalog(){
    const q=$('#oSearch').value.trim().toLocaleLowerCase(),selected=new Set([...$('#oItems').children].map(r=>r.dataset.productId).filter(Boolean));
    const results=catalog.filter(p=>!q||[p.name,p.brand,p.vehicle].join(' ').toLocaleLowerCase().includes(q)).slice(0,12);
    $('#oResults').innerHTML=results.map(p=>`<button type="button" class="order-result" data-o-product="${e(p.id)}" ${selected.has(p.id)?'disabled':''}><span>${e(p.name)}</span><strong>${C.currency(p.price)}</strong><small>${selected.has(p.id)?'Agregado':'＋ Agregar'}</small></button>`).join('') || '<p class="section-copy">Sin coincidencias. Podés agregar el producto manualmente.</p>';
  }
  async function loadCatalog(force=false){
    if(catalogLoaded&&!force){searchCatalog();return;}
    $('#oReloadCatalog').disabled=true;$('#oCatalogStatus').textContent='Cargando catálogo…';
    try{
      const response=await fetch('https://raw.githubusercontent.com/joacogelos3-ui/jg3dworks/main/catalog/data.js',{cache:'no-cache',signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error('Catálogo no disponible');
      const text=await response.text(),match=text.match(/const\s+CATALOG\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);if(!match)throw Error('Formato de catálogo no compatible');
      const data=JSON.parse(match[1]);catalog=normalizeCatalog(data.map(p=>({id:p.s,name:p.n,price:p.p,url:p.u,brand:p.b,vehicle:p.v})));catalogLoaded=true;
      $('#oCatalogStatus').textContent=`${catalog.length} productos · catálogo actualizado. Revisá el precio de Cults al cotizar; podés editarlo.`;
    }catch(error){
      try{const response=await fetch('orders-catalog.json');if(!response.ok)throw Error();const data=await response.json();catalog=normalizeCatalog(data.products);catalogLoaded=true;$('#oCatalogStatus').textContent=`Copia del catálogo del ${data.updatedAt} · ${catalog.length} productos. No se pudo actualizar: verificá los precios antes de enviar.`;}
      catch{$('#oCatalogStatus').textContent='No se pudo cargar el catálogo. Podés agregar productos manualmente.';}
    }finally{$('#oReloadCatalog').disabled=false;searchCatalog();}
  }
  function normalizeCatalog(data){if(!Array.isArray(data))throw Error('Catálogo inválido');return data.filter(p=>typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.price)&&p.price>=0);}
  async function open(order=null){
    if(busy||!active)return;
    if(!$('#orderForm').hidden&&!confirm('¿Cerrar los cambios sin guardar del pedido actual?'))return;
    if(order&&paidReceipt(order))return host.toast('El pedido cobrado se conserva. Podés consultar su PDF y recibo.');
    const cfg=host.settings(),date=new Date();date.setDate(date.getDate()+Number(cfg.validDays||7));
    draft=structuredClone(order || {kind:'file_order',id:crypto.randomUUID(),number:'',createdAt:new Date().toISOString(),clientId:'',client:{country:'BR'},language:'pt',items:[],personalized:false,discountUsd:0,license:'personal',paymentMethod:'paypal',paypalPercent:Number(cfg.paypalPercent??6),paypalFixed:Number(cfg.paypalFixed??.3),validUntil:date.toISOString().slice(0,10),notes:''});
    $('#orderForm').reset();$('#orderPayment').hidden=true;$('#orderForm').hidden=false;$('#oError').textContent='';clientOptions();
    $('#orderEditorTitle').textContent=order?`Editar ${order.number}`:'Nuevo pedido';$('#oClient').value=draft.clientId;
    for(const [id,key] of [['oName','name'],['oEmail','email'],['oPhone','phone'],['oCountry','country']])$('#'+id).value=draft.client[key] || '';
    $('#oLanguage').value=draft.language;$('#oPersonalized').value=draft.personalized?'1':'0';$('#oDiscount').value=draft.discountUsd;$('#oLicense').value=draft.license;$('#oMethod').value=draft.paymentMethod;$('#oValid').value=draft.validUntil;$('#oNotes').value=draft.notes;
    $('#oItems').replaceChildren();draft.items.forEach(addItem);totals();loadCatalog();$('#orderForm').scrollIntoView({behavior:'smooth'});
  }
  async function save(event){
    event.preventDefault();if(busy||!draft||!active)return;busy=true;$('#oSave').disabled=true;$('#oError').textContent='';const epoch=generation;
    try{
      const order=readDraft();O.validate(order);
      await host.refreshReceipts();if(epoch!==generation)return;
      if(paidReceipt(order))throw Error('Este pedido ya tiene un recibo pagado. Actualizá el listado.');
      order.number=order.number || `JG3D-A-${new Date().getFullYear()}-${order.id.slice(0,8).toUpperCase()}`;order.updatedAt=new Date().toISOString();
      const saved=await host.saveOrder(order);if(epoch!==generation)return;draft=null;$('#orderForm').hidden=true;render();host.preview({kind:'file_order',order:saved});host.toast('Pedido guardado. Todavía no se registró ningún ingreso.');
    }catch(error){if(epoch===generation)$('#oError').textContent=`No se guardó el pedido: ${error.message}`;}
    finally{busy=false;$('#oSave').disabled=false;}
  }
  function render(){
    if(!active)return;
    clientOptions();const q=$('#oHistorySearch').value.toLowerCase(),filter=$('#oFilter').value;
    const records=host.orders().filter(o=>(!filter||state(o)===filter)&&[o.number,o.client.name,...o.items.map(i=>i.name)].join(' ').toLowerCase().includes(q));
    $('#oRows').innerHTML=records.map(o=>{const s=state(o),r=paidReceipt(o),a=O.calculate(o);return `<tr><td><strong>${e(o.number)}</strong><small>${e(o.client.name)}</small></td><td>${o.items.length}</td><td>${C.currency(a.grossUsd)}</td><td><span class="status-badge ${s==='pending'?'draft':'delivered'}">${({pending:'Pendiente de pago',paid:'Pagado',delivered:'Entregado'})[s]}</span></td><td><div class="row-actions"><button class="row-button" type="button" data-o-pdf="${o.id}">PDF / WhatsApp</button>${!r?`<button class="row-button" type="button" data-o-edit="${o.id}">Editar</button><button class="row-button" type="button" data-o-pay="${o.id}">Revisar cobro</button>`:`<button class="row-button" type="button" data-o-receipt="${o.id}">Recibo</button>${s!=='delivered'?`<button class="row-button" type="button" data-o-deliver="${o.id}">Marcar entregado</button>`:''}`}</div></td></tr>`;}).join('');$('#oEmpty').hidden=records.length>0;
  }
  async function reviewPayment(order){
    if(busy||!active)return;busy=true;const epoch=generation;
    try{
      await host.refreshReceipts();if(epoch!==generation)return;
      if(paidReceipt(order)){render();return host.preview({kind:'receipt',receipt:paidReceipt(order)});}
      paymentOrder=structuredClone(order);$('#orderPayment').reset();$('#orderForm').hidden=true;$('#orderPayment').hidden=false;$('#opError').textContent='';
      $('#opDate').value=today();$('#opDate').max=today();$('#opMethod').value=order.paymentMethod==='paypal'?'paypal':'transfer';$('#opCurrency').value='USD';$('#opRate').value=1;
      const a=O.calculate(order);$('#opPaid').value=a.grossUsd;$('#opFee').value=a.feeUsd;
      $('#opSummary').textContent=`${order.number} · ${order.client.name} · Total acordado: ${C.currency(a.grossUsd)}`;
      paymentTotals();$('#orderPayment').scrollIntoView({behavior:'smooth'});
    }catch(error){host.toast(error.message);}finally{busy=false;}
  }
  function paymentTotals(reset=false){
    if(!paymentOrder)return;
    const paypal=$('#opMethod').value==='paypal';if(paypal)$('#opCurrency').value='USD';
    const usd=$('#opCurrency').value==='USD';$('#opCurrency').disabled=paypal;$('#opRate').readOnly=usd;$('#opFetchRate').disabled=usd||busy;if(usd)$('#opRate').value=1;
    const a=O.calculate(paymentOrder),rate=Number($('#opRate').value);if(reset)$('#opPaid').value=rate>0?C.round(a.grossUsd*rate):'';
    const paid=Number($('#opPaid').value),fee=Number($('#opFee').value),expected=C.round(a.grossUsd*rate);
    $('#opTotals').textContent=rate>0?`Total esperado: ${C.currency(expected,$('#opCurrency').value)} · Neto recibido: ${C.currency(paid-fee,$('#opCurrency').value)} · ${Math.abs(paid-expected)<.011?'Importe completo':'El importe debe coincidir con el pago completo del pedido.'}`:'Ingresá el tipo de cambio acordado para este pago.';
  }
  async function confirmPayment(event){
    event.preventDefault();if(busy||!paymentOrder||!active)return;busy=true;$('#opSave').disabled=true;$('#opError').textContent='';const epoch=generation;
    try{
      if(!$('#opConfirmed').checked)throw Error('Confirmá la revisión del pago completo.');
      if($('#opDate').value>today())throw Error('La fecha del pago no puede ser futura.');
      const order=paymentOrder,a=O.validate(order),lang=order.language;
      const r={paid_date:$('#opDate').value,client_id:order.clientId,source_quote_id:order.id,client:structuredClone(order.client),language:lang,
        items:[{name:`${O.labels[lang].order} ${order.number}`,description:O.labels[lang].title,quantity:1,unitUsd:a.grossUsd,format:'STL'}],currency:$('#opCurrency').value,exchange_rate:Number($('#opRate').value),
        exchange_info:{mode:'file_order',fileOrder:structuredClone(order)},paid_amount:Number($('#opPaid').value),fee_amount:Number($('#opFee').value),payment_method:$('#opMethod').value,transaction_ref:$('#opRef').value.trim(),notes:''};
      C.validate(r);
      const saved=await host.savePayment(r);if(epoch!==generation)return;$('#orderPayment').hidden=true;paymentOrder=null;render();host.preview({kind:'receipt',receipt:saved});host.toast('Pago confirmado. Recibo e ingreso registrados una sola vez.');
    }catch(error){if(epoch===generation)$('#opError').textContent=`No se confirmó el pago: ${error.message}`;}finally{busy=false;$('#opSave').disabled=false;}
  }
  async function deliver(order){
    if(busy||!active)return;busy=true;
    try{await host.refreshReceipts();const r=paidReceipt(order);if(!r)throw Error('Primero confirmá el pago completo.');await host.saveOrder({...order,deliveredReceiptId:r.id,deliveredAt:new Date().toISOString()},true);render();host.toast('Entrega registrada. El ingreso ya estaba contabilizado.');}catch(error){host.toast(error.message);}finally{busy=false;}
  }
  $('#orderForm').onsubmit=save;$('#orderPayment').onsubmit=confirmPayment;
  $('#orderNew').onclick=()=>open();$('#orderClose').onclick=()=>{if(!busy){$('#orderForm').hidden=true;draft=null;}};$('#opClose').onclick=()=>{if(!busy){$('#orderPayment').hidden=true;paymentOrder=null;}};
  $('#oManual').onclick=()=>addItem();$('#oReloadCatalog').onclick=()=>loadCatalog(true);$('#oSearch').oninput=searchCatalog;
  $('#oResults').onclick=ev=>{const button=ev.target.closest('[data-o-product]');if(!button)return;const p=catalog.find(p=>p.id===button.dataset.oProduct);if(p){addItem(p);searchCatalog();}};
  $('#oItems').onclick=ev=>{const button=ev.target.closest('[data-o-remove]');if(button){button.closest('.order-item').remove();totals();searchCatalog();}};
  $('#orderForm').addEventListener('input',totals);$('#orderForm').addEventListener('change',totals);
  $('#oClient').onchange=()=>{const c=host.clients().find(c=>c.id===$('#oClient').value);for(const [id,key]of[['oName','name'],['oEmail','email'],['oPhone','phone']])$('#'+id).value=c?.[key] || '';if(c){$('#oCountry').value=c.country;$('#oLanguage').value=c.language || 'en';}};
  $('#oCountry').onchange=()=>{$('#oLanguage').value=({BR:'pt',AR:'es'})[$('#oCountry').value]||'en';};
  $('#oHistorySearch').oninput=render;$('#oFilter').onchange=render;
  $('#orderPayment').addEventListener('input',ev=>{if(ev.target.id!=='opConfirmed')$('#opConfirmed').checked=false;paymentTotals();});
  $('#opMethod').onchange=()=>{$('#opConfirmed').checked=false;paymentTotals(true);$('#opFee').value=$('#opMethod').value==='paypal'?C.round(Number($('#opPaid').value)*paymentOrder.paypalPercent/100+paymentOrder.paypalFixed):0;paymentTotals();};
  $('#opCurrency').onchange=()=>{$('#opRate').value=$('#opCurrency').value==='USD'?1:'';$('#opFee').value=0;$('#opConfirmed').checked=false;paymentTotals(true);};
  $('#opRate').oninput=()=>paymentTotals(true);
  $('#opFetchRate').onclick=async()=>{if(busy||!paymentOrder)return;if($('#opDate').value!==today())return host.toast('Para pagos anteriores, ingresá el cambio acordado en esa fecha.');const code=$('#opCurrency').value;busy=true;$('#opSave').disabled=true;$('#opFetchRate').disabled=true;try{const r=await host.rate(code,true);if(paymentOrder&&$('#opCurrency').value===code){$('#opRate').value=r.rate;paymentTotals(true);$('#opConfirmed').checked=false;}}catch{host.toast('No se pudo consultar el cambio. Ingresalo manualmente.');}finally{busy=false;$('#opSave').disabled=false;paymentTotals();}};
  view.addEventListener('click',ev=>{const d=ev.target.closest('button')?.dataset;if(!d)return;const id=d.oPdf||d.oEdit||d.oPay||d.oReceipt||d.oDeliver;if(!id)return;const order=host.orders().find(o=>o.id===id);if(!order)return;if(d.oPdf)host.preview({kind:'file_order',order});if(d.oEdit)open(order);if(d.oPay)reviewPayment(order);if(d.oReceipt)host.preview({kind:'receipt',receipt:paidReceipt(order)});if(d.oDeliver)deliver(order);});
  return {start(){active=true;generation++;render();},stop(){active=false;generation++;draft=null;paymentOrder=null;$('#orderForm').reset();$('#orderPayment').reset();$('#orderForm').hidden=true;$('#orderPayment').hidden=true;$('#oRows').replaceChildren();$('#oItems').replaceChildren();},render,
    document:order=>O.documentHTML(order,host.footer),message:O.message,preparePrint:order=>O.preparePrint(order,host.footer)};
}};
