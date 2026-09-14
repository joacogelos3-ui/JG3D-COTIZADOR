/* Shared receipt calculations and client documents. No credentials or storage. */
((root) => {
  'use strict';
  const labels = {
    es: { title:'Recibo de pago', client:'Cliente', country:'País', email:'Correo', date:'Fecha del pago', method:'Medio de pago', detail:'Archivos / conceptos', qty:'Cant.', unit:'Unitario USD', subtotal:'Subtotal USD', total:'Total recibido', usd:'Valor de la venta en USD', notes:'Detalle de entrega', download:'Enlace de entrega', paid:'PAGADO', sent:'PAGADO', void:'ANULADO', legal:'Comprobante comercial de pago. No válido como factura fiscal.', origin:'Argentina · Entrega digital mundial', contact:'Contacto directo', footer:'Diseño y archivos 3D automotrices', thanks:'Gracias por tu compra.', hello:'Hola', message:'Confirmamos tu pago', attached:'Te comparto el recibo en PDF y el detalle de tu compra.', reference:'Referencia', page:'Página', delivery:'Entrega', quote:'Presupuesto de origen', methods:{paypal:'PayPal',transfer:'Transferencia bancaria',mercadopago:'Mercado Pago',wise:'Wise',cash:'Efectivo',other:'Otro'} },
    en: { title:'Payment receipt', client:'Customer', country:'Country', email:'Email', date:'Payment date', method:'Payment method', detail:'Files / items', qty:'Qty.', unit:'Unit price USD', subtotal:'Subtotal USD', total:'Amount received', usd:'Sale value in USD', notes:'Delivery details', download:'Delivery link', paid:'PAID', sent:'PAID', void:'VOID', legal:'Commercial payment receipt. Not valid as a tax invoice.', origin:'Argentina · Worldwide digital delivery', contact:'Direct contact', footer:'Automotive 3D design and digital files', thanks:'Thank you for your purchase.', hello:'Hello', message:'We confirm your payment', attached:'Here is your PDF receipt with the details of your purchase.', reference:'Reference', page:'Page', delivery:'Delivery', quote:'Source quotation', methods:{paypal:'PayPal',transfer:'Bank transfer',mercadopago:'Mercado Pago',wise:'Wise',cash:'Cash',other:'Other'} },
    pt: { title:'Recibo de pagamento', client:'Cliente', country:'País', email:'E-mail', date:'Data do pagamento', method:'Forma de pagamento', detail:'Arquivos / itens', qty:'Qtd.', unit:'Unitário USD', subtotal:'Subtotal USD', total:'Total recebido', usd:'Valor da venda em USD', notes:'Detalhes da entrega', download:'Link de entrega', paid:'PAGO', sent:'PAGO', void:'ANULADO', legal:'Comprovante comercial de pagamento. Não válido como nota fiscal.', origin:'Argentina · Entrega digital mundial', contact:'Contato direto', footer:'Design e arquivos 3D automotivos', thanks:'Obrigado pela sua compra.', hello:'Olá', message:'Confirmamos seu pagamento', attached:'Segue o recibo em PDF com os detalhes da sua compra.', reference:'Referência', page:'Página', delivery:'Entrega', quote:'Orçamento de origem', methods:{paypal:'PayPal',transfer:'Transferência bancária',mercadopago:'Mercado Pago',wise:'Wise',cash:'Dinheiro',other:'Outro'} }
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const round = n => Math.round((Number(n) + Number.EPSILON)*100)/100;
  const currency = (n, code='USD', lang='es') => `${code} ${Number(n).toLocaleString({es:'es-AR',en:'en-US',pt:'pt-BR'}[lang] || 'en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const safeUrl = value => { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  function amounts(items, paid, fee, rate) {
    const grossUsd = items.reduce((s,i) => s + Math.round(Number(i.unitUsd)*100)*Number(i.quantity),0)/100;
    return {grossUsd:round(grossUsd),paid:round(paid),fee:round(fee),net:round(paid-fee),feeUsd:round(fee/rate),netUsd:round((paid-fee)/rate)};
  }
  function validate(r) {
    if (!r.client?.name?.trim()) throw Error('Ingresá el nombre del cliente.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.paid_date) || !Number.isFinite(Date.parse(r.paid_date))) throw Error('Ingresá una fecha válida.');
    if (!['es','en','pt'].includes(r.language) || !['USD','ARS','BRL'].includes(r.currency)) throw Error('Idioma o moneda inválidos.');
    if (!labels.es.methods[r.payment_method]) throw Error('Seleccioná el medio de pago.');
    if (!Array.isArray(r.items) || !r.items.length || r.items.length>30) throw Error('Agregá entre 1 y 30 conceptos.');
    for(const i of r.items) {
      if (!i.name?.trim() || !Number.isInteger(i.quantity) || i.quantity<1 || i.quantity>10000 || !Number.isFinite(i.unitUsd) || i.unitUsd<0 || i.unitUsd>1000000 || round(i.unitUsd)!==i.unitUsd) throw Error('Revisá nombres, cantidades y precios de los archivos.');
      if (i.url && !safeUrl(i.url)) throw Error('Usá enlaces de entrega que comiencen con https:// o http://.');
    }
    if (!Number.isFinite(r.exchange_rate) || r.exchange_rate<=0 || !Number.isFinite(r.paid_amount) || r.paid_amount<=0 || !Number.isFinite(r.fee_amount) || r.fee_amount<0 || r.fee_amount>r.paid_amount) throw Error('Revisá el tipo de cambio, el pago y la comisión.');
    const a=amounts(r.items,r.paid_amount,r.fee_amount,r.exchange_rate);
    if(a.grossUsd<=0 || Math.abs(round(a.grossUsd*r.exchange_rate)-r.paid_amount)>.011 || (r.currency==='USD' && r.exchange_rate!==1)) throw Error('El importe recibido no coincide con los precios y el tipo de cambio.');
    return a;
  }
  const country = (code,lang) => ({BR:lang==='en'?'Brazil':'Brasil',AR:'Argentina',US:lang==='en'?'United States':'Estados Unidos',OTHER:lang==='en'?'Other country':lang==='pt'?'Outro país':'Otro país'}[code] || code || '—');
  function documentHTML(r, footer, items=r.items, page=1, pages=1) {
    const lang=r.language || 'en', l=labels[lang], last=page===pages;
    const field=(name,value)=>`<div class="doc-field"><span>${name}</span><strong>${escape(value || '—')}</strong></div>`;
    return `<div class="doc-watermark" aria-hidden="true"><img src="https://raw.githubusercontent.com/joacogelos3-ui/jg3dworks/main/assets/jg3d-logo.png" alt=""></div>
      <header class="doc-header"><div class="doc-brand"><img class="doc-logo" src="https://raw.githubusercontent.com/joacogelos3-ui/jg3dworks/main/assets/jg3d-logo.png" alt="JG3D Works"></div><div class="doc-meta"><span>${l.title}</span><h2>${escape(r.number || 'BORRADOR')}</h2><p>${l.page} ${page} / ${pages}</p></div></header>
      <span class="doc-kicker">JG3D WORKS · ${l[r.status || 'paid']}</span><h1 class="doc-title">${l.title}</h1>
      <div class="doc-grid">${field(l.client,r.client.name)}${field(l.country,country(r.client.country,lang))}${field(l.email,r.client.email)}${field(l.date,r.paid_date.split('-').reverse().join('/'))}${field(l.method,l.methods[r.payment_method])}${field(l.reference,r.transaction_ref || r.number)}</div>
      <section class="doc-section"><h3>${l.detail}</h3><table class="receipt-doc-table"><thead><tr><th>${l.detail}</th><th>${l.qty}</th><th>${l.unit}</th><th>${l.subtotal}</th></tr></thead><tbody>${items.map(i=>`<tr><td><strong>${escape(i.name)}</strong><small>${escape([i.format,i.version,i.description].filter(Boolean).join(' · '))}</small>${safeUrl(i.url)?`<a href="${escape(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer">${l.download} ↗</a>`:''}</td><td>${i.quantity}</td><td>${currency(i.unitUsd,'USD',lang)}</td><td>${currency(round(i.unitUsd*i.quantity),'USD',lang)}</td></tr>`).join('')}</tbody></table></section>
      ${last ? `${r.notes?`<section class="doc-section"><h3>${l.notes}</h3><p>${escape(r.notes).replace(/\n/g,'<br>')}</p></section>`:''}<div class="doc-total"><div><span>${l.total}</span><strong>${currency(r.paid_amount,r.currency,lang)}</strong>${r.currency!=='USD'?`<small class="doc-price-reference">${l.usd}: ${currency(r.gross_usd,'USD',lang)}</small>`:''}</div><div class="doc-payment"><span>${l[r.status || 'paid']}</span><p>${l.methods[r.payment_method]}</p></div></div><p class="receipt-legal">${l.legal}</p>`:''}
      ${footer(l)}`;
  }
  function message(r) {
    if(r.status==='void') return '';
    const l=labels[r.language] || labels.en;
    return `${l.hello} ${r.client.name}, ${l.message.toLowerCase()}: ${currency(r.paid_amount,r.currency,r.language)} (${l.methods[r.payment_method]}).\n${l.title}: ${r.number}\n\n${r.items.map(i=>`• ${i.quantity} × ${i.name}${safeUrl(i.url)?'\n'+l.delivery+': '+safeUrl(i.url):''}`).join('\n')}\n\n${l.attached}\n${l.thanks}`;
  }
  function summarize(records) {
    const valid=records.filter(r=>r.status!=='void');
    return valid.reduce((s,r)=>{const a=amounts(r.items,Number(r.paid_amount),Number(r.fee_amount),Number(r.exchange_rate));s.count++;s.gross+=Number(r.gross_usd);s.fee+=a.feeUsd;s.net+=a.netUsd;return s;},{count:0,gross:0,fee:0,net:0});
  }
  root.JG3DReceiptCore={labels,escape,round,currency,safeUrl,amounts,validate,documentHTML,message,summarize,country};
})(typeof window==='undefined'?globalThis:window);
