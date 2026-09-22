/* File-order amounts and documents. Prices are snapshotted per order in USD. */
((root) => {
  'use strict';
  const C = root.JG3DReceiptCore;
  const labels = {
    es: { title:'Pedido de archivos STL', item:'Archivo', price:'Precio USD', subtotal:'Subtotal de archivos', logo:'Personalización de marca (+20%)', discount:'Descuento', adjusted:'Subtotal con ajustes', total:'Total a pagar', paypal:'Total a pagar por PayPal', license:'Permiso de uso', personal:'Uso personal', commercial:'Venta de piezas impresas', terms:'100% del pago antes de personalizar o entregar. Archivos digitales; no incluye piezas físicas. No se permite compartir ni revender los archivos digitales.', page:'Página', date:'Fecha', valid:'Válido hasta', notes:'Observaciones', hello:'Hola', receipt:'Recibo de pago', order:'Pedido', paid:'PAGADO', void:'ANULADO', pending:'PRESUPUESTO', payDate:'Fecha del pago', method:'Medio de pago', received:'Total recibido' },
    en: { title:'STL file order', item:'File', price:'Price USD', subtotal:'Files subtotal', logo:'Brand customization (+20%)', discount:'Discount', adjusted:'Adjusted subtotal', total:'Total payable', paypal:'Total payable via PayPal', license:'Usage permission', personal:'Personal use', commercial:'Sale of printed parts', terms:'100% payment before customization or delivery. Digital files; physical parts are not included. Sharing or reselling the digital files is not permitted.', page:'Page', date:'Date', valid:'Valid until', notes:'Notes', hello:'Hello', receipt:'Payment receipt', order:'Order', paid:'PAID', void:'VOID', pending:'QUOTATION', payDate:'Payment date', method:'Payment method', received:'Amount received' },
    pt: { title:'Pedido de arquivos STL', item:'Arquivo', price:'Preço USD', subtotal:'Subtotal dos arquivos', logo:'Personalização da marca (+20%)', discount:'Desconto', adjusted:'Subtotal com ajustes', total:'Total a pagar', paypal:'Total a pagar via PayPal', license:'Permissão de uso', personal:'Uso pessoal', commercial:'Venda de peças impressas', terms:'100% do pagamento antes da personalização ou entrega. Arquivos digitais; não inclui peças físicas. Não é permitido compartilhar nem revender os arquivos digitais.', page:'Página', date:'Data', valid:'Válido até', notes:'Observações', hello:'Olá', receipt:'Recibo de pagamento', order:'Pedido', paid:'PAGO', void:'ANULADO', pending:'ORÇAMENTO', payDate:'Data do pagamento', method:'Forma de pagamento', received:'Total recebido' }
  };
  function cents(value) {
    const n=Number(value);
    if (!Number.isFinite(n) || n<0 || n>1000000) throw Error('Revisá los importes: deben ser números positivos o cero.');
    return Math.round((n+Number.EPSILON)*100);
  }
  function calculate(order) {
    if (!Array.isArray(order.items) || !order.items.length || order.items.length>30) throw Error('Agregá entre 1 y 30 archivos.');
    const subtotal=order.items.reduce((sum,i)=>sum+cents(i.unitUsd),0);
    const logo=order.personalized ? Math.round(subtotal*.2) : 0;
    const discount=cents(order.discountUsd || 0), net=subtotal+logo-discount;
    if (net<=0) throw Error('El total después del descuento debe ser mayor que cero.');
    const percent=Number(order.paypalPercent), fixed=cents(order.paypalFixed);
    if (!Number.isFinite(percent) || percent<0 || percent>=100) throw Error('La comisión PayPal debe estar entre 0 y menos de 100%.');
    const gross=order.paymentMethod==='paypal' ? Math.ceil((net+fixed)/(1-percent/100)-1e-8) : net;
    if(gross>100000000) throw Error('El total del pedido supera el máximo permitido.');
    const fee=order.paymentMethod==='paypal' ? Math.round(gross*percent/100+fixed) : 0;
    return {subtotalUsd:subtotal/100,logoUsd:logo/100,discountUsd:discount/100,netUsd:net/100,grossUsd:gross/100,feeUsd:fee/100};
  }
  function validate(order) {
    if (!order.client?.name?.trim()) throw Error('Ingresá el nombre del cliente.');
    if (!labels[order.language] || !['personal','commercial'].includes(order.license)) throw Error('Elegí idioma y permiso de uso.');
    if (!['paypal','other'].includes(order.paymentMethod)) throw Error('Elegí un medio de pago válido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(order.validUntil) || !Number.isFinite(Date.parse(order.validUntil))) throw Error('Revisá la fecha de validez.');
    for (const item of order.items || []) {
      if (!item.name?.trim() || item.name.length>200) throw Error('Cada archivo necesita un nombre de hasta 200 caracteres.');
      if (item.unitUsd!==cents(item.unitUsd)/100) throw Error('Usá precios con hasta dos decimales.');
    }
    return calculate(order);
  }
  function documentHTML(order,footer,items=order.items,page=1,pages=1,receipt=null) {
    const lang=order.language, l=labels[lang], common=C.labels[lang], e=C.escape, money=n=>C.currency(n,'USD',lang), a=calculate(order), last=page===pages;
    const field=(name,value)=>`<div class="doc-field"><span>${e(name)}</span><strong>${e(value)}</strong></div>`;
    const rows=items.map(i=>`<tr><td><strong>${e(i.name)}</strong></td><td>${money(i.unitUsd)}</td></tr>`).join('');
    return `<header class="doc-header"><div class="doc-brand"><img class="doc-logo" src="https://raw.githubusercontent.com/joacogelos3-ui/jg3dworks/main/assets/jg3d-logo.png" alt="JG3D Works"></div><div class="doc-meta"><span>${receipt?l.receipt:l.title}</span><h2>${e(receipt?.number || order.number)}</h2><p>${l.page} ${page} / ${pages}</p></div></header>
      <span class="doc-kicker">JG3D WORKS · ${receipt?(receipt.status==='void'?l.void:l.paid):l.pending}</span><h1 class="doc-title">${l.title}</h1>
      <div class="doc-grid">${field(common.client,order.client.name)}${field(common.country,C.country(order.client.country,lang))}${field(common.email,order.client.email || '—')}${field(l.order,order.number)}${field(receipt?l.payDate:l.date,receipt?.paid_date || order.createdAt.slice(0,10))}${field(receipt?l.method:l.valid,receipt?common.methods[receipt.payment_method]:order.validUntil)}</div>
      <section class="doc-section"><table class="receipt-doc-table order-doc-table"><thead><tr><th>${l.item}</th><th>${l.price}</th></tr></thead><tbody>${rows}</tbody></table></section>
      ${last?`<section class="order-doc-totals"><p><span>${l.subtotal}</span><strong>${money(a.subtotalUsd)}</strong></p>${order.personalized?`<p><span>${l.logo}</span><strong>+ ${money(a.logoUsd)}</strong></p>`:''}${a.discountUsd>0?`<p><span>${l.discount}</span><strong>− ${money(a.discountUsd)}</strong></p>`:''}${order.paymentMethod==='paypal'?`<p><span>${l.adjusted}</span><strong>${money(a.netUsd)}</strong></p>`:''}</section>
      <section class="doc-section"><h3>${l.license}: ${order.license==='commercial'?l.commercial:l.personal}</h3><p>${l.terms}</p>${order.notes?`<p><strong>${l.notes}:</strong> ${e(order.notes).replace(/\n/g,'<br>')}</p>`:''}</section>
      <div class="doc-total"><div><span>${receipt?l.received:order.paymentMethod==='paypal'?l.paypal:l.total}</span><strong>${receipt?C.currency(receipt.paid_amount,receipt.currency,lang):money(a.grossUsd)}</strong>${receipt&&receipt.currency!=='USD'?`<small>${money(a.grossUsd)}</small>`:''}</div></div>${receipt?`<p class="receipt-legal">${common.legal}</p>`:''}`:''}${footer(common)}`;
  }
  function message(order) {
    const l=labels[order.language],a=calculate(order),m=n=>C.currency(n,'USD',order.language);
    return `${l.hello} ${order.client.name},\n${l.title}: ${order.number}\n\n${order.items.map(i=>`• ${i.name}: ${m(i.unitUsd)}`).join('\n')}\n\n${l.subtotal}: ${m(a.subtotalUsd)}${order.personalized?'\n'+l.logo+': + '+m(a.logoUsd):''}\n${l.discount}: − ${m(a.discountUsd)}\n${order.paymentMethod==='paypal'?l.paypal:l.total}: ${m(a.grossUsd)}\n\n${l.license}: ${order.license==='commercial'?l.commercial:l.personal}\n${l.valid}: ${order.validUntil}\n${l.terms}${order.notes?'\n\n'+order.notes:''}`;
  }
  function preparePrint(order,footer,receipt=null) {
    if(document.querySelector('#quotePrintSheet')) return document.querySelector('#quotePrintSheet');
    const sheet=document.createElement('div');sheet.id='quotePrintSheet';sheet.className='receipt-print-root';document.body.appendChild(sheet);
    let size=6;
    const build=()=>{const chunks=[];for(let i=0;i<order.items.length;i+=size)chunks.push(order.items.slice(i,i+size));sheet.innerHTML=chunks.map((chunk,i)=>`<section class="receipt-print-page"><article class="quote-document receipt-document" lang="${order.language}">${documentHTML(order,footer,chunk,i+1,chunks.length,receipt)}</article></section>`).join('');};
    build();while(size>1&&[...sheet.querySelectorAll('article')].some(a=>a.offsetHeight>1000)){size--;build();}return sheet;
  }
  root.JG3DOrderCore={calculate,validate,documentHTML,message,preparePrint,labels};
})(typeof window==='undefined'?globalThis:window);
