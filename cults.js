/* Cults sales dashboard. Credentials stay in Supabase Edge Function secrets. */
window.JG3DCults = { create(host) {
  'use strict';
  const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let user=null,records=[],syncState=null,busy=false,ready=false,page=0,eurUsd=0,arsPerUsd=0,rateLabel='Sin referencia EUR/USD',arsRateLabel='Sin referencia USD/ARS';
  const pageSize=50,currentYear=String(new Date().getFullYear()),currentMonth=String(new Date().getMonth()+1).padStart(2,'0');
  const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const money=(value,code='EUR')=>`${code} ${Number(value||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const arsMoney=value=>`ARS ${Number(value||0).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
  const sum=rows=>rows.reduce((s,r)=>{s.count++;s.gross+=Number(r.gross_excluding_tax||0);s.fee+=Number(r.commission||0);s.net+=Number(r.net_income||0);if(r.paid_out_at)s.paid+=Number(r.net_income||0);else s.pending+=Number(r.net_income||0);return s;},{count:0,gross:0,fee:0,net:0,paid:0,pending:0});
  const saleYear=r=>String(r.sold_at||'').slice(0,4);
  const rateKey='jg3d_cults_eur_usd_v1';

  const view=document.createElement('section');view.id='view-cults';view.className='view';
  view.innerHTML=`<div class="split-heading"><div><span class="eyebrow">MARKETPLACE</span><h2>Ventas de Cults</h2><p>Ventas importadas desde la API oficial. Los importes originales se conservan en EUR.</p></div><div class="row-actions"><button type="button" class="secondary-button" id="cultsRefresh">Actualizar vista</button><button type="button" class="primary-button" id="cultsSync">↻ Sincronizar Cults</button></div></div>
    <p id="cultsStatus" class="receipt-notice" role="status"></p>
    <div class="panel-card receipt-filters"><div class="form-grid three">
      <label>Año de la venta<select id="cfYear"><option value="">Todos los años</option></select></label>
      <label>Buscar<input type="search" id="cfSearch" placeholder="Producto o comprador"></label>
      <label>Transferencia<select id="cfPayout"><option value="">Todas</option><option value="pending">Pendiente</option><option value="paid">Transferida</option></select></label>
      <label>País<select id="cfCountry"><option value="">Todos los países</option></select></label>
    </div><button type="button" id="cfClear" class="row-button">Limpiar filtros</button></div>
    <div class="metrics-grid" id="cultsMetrics"></div>
    <p class="section-copy" id="cultsRateNote"></p>
    <div class="table-card"><div class="responsive-table"><table><thead><tr><th>Mes</th><th>Ventas</th><th>Bruto EUR</th><th>Comisión EUR</th><th>Neto EUR</th></tr></thead><tbody id="cultsMonths"></tbody></table></div></div>
    <div class="table-card receipt-subhead"><div class="responsive-table"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Comprador / país</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Transferencia</th></tr></thead><tbody id="cultsRows"></tbody></table></div><p id="cultsEmpty" class="empty-state">Todavía no hay ventas sincronizadas.</p><div class="cults-pagination" id="cultsPagination"></div></div>`;
  document.querySelector('.main-content').appendChild(view);

  const dash=document.createElement('article');dash.className='panel-card income-overview';dash.id='incomeOverview';
  dash.innerHTML=`<div class="panel-heading"><div><span class="eyebrow">BALANCE DE INGRESOS</span><h2>Cults + ventas directas</h2></div><div class="income-period"><label>Año<select id="incomeYear"></select></label><label>Mes<select id="incomeMonth"><option value="">Todo el año</option>${monthNames.map((name,index)=>`<option value="${String(index+1).padStart(2,'0')}">${name}</option>`).join('')}</select></label></div></div><div class="income-metrics" id="incomeMetrics"></div><p class="section-copy" id="incomeRateNote"></p><div class="table-card income-history"><div class="responsive-table"><table><thead><tr><th>Mes</th><th>Cults neto EUR</th><th>Cults ≈ USD</th><th>Ventas por fuera USD</th><th>Total USD</th><th>Variación</th></tr></thead><tbody id="incomeMonths"></tbody></table></div></div>`;
  const dashboardGrid=$('#view-dashboard .metrics-grid');dashboardGrid.insertAdjacentElement('afterend',dash);

  function years() {
    const incomeReady=$('#incomeYear').options.length>0;
    const selectedView=$('#cfYear').value,selectedDash=incomeReady?$('#incomeYear').value:currentYear,selectedMonth=incomeReady?$('#incomeMonth').value:currentMonth;
    const values=new Set([currentYear,...records.map(saleYear).filter(Boolean)]),list=[...values].sort((a,b)=>b.localeCompare(a));
    $('#cfYear').innerHTML='<option value="">Todos los años</option>'+list.map(y=>`<option value="${y}">${y}</option>`).join('');
    $('#incomeYear').innerHTML='<option value="">Todos</option>'+list.map(y=>`<option value="${y}">${y}</option>`).join('');
    $('#cfYear').value=values.has(selectedView)?selectedView:'';
    $('#incomeYear').value=selectedDash===''||values.has(selectedDash)?selectedDash:currentYear;
    $('#incomeMonth').value=selectedMonth;
    const country=$('#cfCountry').value, countries=new Map();records.forEach(r=>{if(r.country_code)countries.set(r.country_code,`${r.country_flag||''} ${r.country_name||r.country_code}`.trim());});
    $('#cfCountry').innerHTML='<option value="">Todos los países</option>'+[...countries].sort((a,b)=>a[1].localeCompare(b[1])).map(([code,label])=>`<option value="${esc(code)}">${esc(label)}</option>`).join('');
    if(countries.has(country))$('#cfCountry').value=country;
  }
  function filtered() {
    const year=$('#cfYear').value,q=$('#cfSearch').value.trim().toLowerCase(),payout=$('#cfPayout').value,country=$('#cfCountry').value;
    return records.filter(r=>r.is_active!==false&&(!year||saleYear(r)===year)&&(!country||r.country_code===country)&&(!payout||(payout==='paid'?!!r.paid_out_at:!r.paid_out_at))&&[r.product_name,r.buyer_nick,r.country_name].join(' ').toLowerCase().includes(q));
  }
  const periodRows=period=>records.filter(r=>r.is_active!==false&&(!period||String(r.sold_at||'').slice(0,period.length)===period));
  function previousPeriod(period) {
    if(/^\d{4}-\d{2}$/.test(period)){const [year,month]=period.split('-').map(Number),date=new Date(Date.UTC(year,month-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;}
    if(/^\d{4}$/.test(period))return String(Number(period)-1);
    return '';
  }
  function periodLabel(period) {
    if(/^\d{4}-\d{2}$/.test(period)){const [year,month]=period.split('-');return `${monthNames[Number(month)-1]} ${year}`;}
    return period||'todo el historial';
  }
  function variation(current,previous,short=false) {
    if(!(previous>0))return current>0?`Nuevo${short?'':' · sin ingresos en el período anterior'}`:'Sin cambios';
    const percent=(current-previous)/previous*100,arrow=percent>0.05?'↑':percent<-0.05?'↓':'→';
    return `${arrow} ${Math.abs(percent).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})}%${short?'':' vs. período anterior'}`;
  }
  function renderDashboard() {
    if(!$('#incomeMetrics'))return;
    const year=$('#incomeYear').value,month=$('#incomeMonth').value,monthSelect=$('#incomeMonth');monthSelect.disabled=!year;if(!year&&month){monthSelect.value='';}
    const period=year&&month?`${year}-${month}`:year,previous=previousPeriod(period),cults=sum(periodRows(period)),direct=host.directSummary(period),previousCults=sum(periodRows(previous)),previousDirect=host.directSummary(previous);
    const cultsUsd=eurUsd?cults.net*eurUsd:0,total=direct.net+cultsUsd,previousTotal=previousDirect.net+(eurUsd?previousCults.net*eurUsd:0),scope=periodLabel(period);
    const arsEquivalent=value=>arsPerUsd?`<b class="income-ars">≈ ${esc(arsMoney(value*arsPerUsd))}</b>`:'';
    $('#incomeMetrics').innerHTML=`<article class="metric-card income-total"><span>Ingresos totales · ${esc(scope)}</span><strong>${eurUsd?money(total,'USD'):'—'}</strong>${eurUsd?arsEquivalent(total):''}<small>Cults neto + ventas directas netas</small><em class="income-change">${esc(variation(total,previousTotal))}</em></article>
      <article class="metric-card"><span>Ventas Cults · ${esc(scope)}</span><strong>${money(cults.net,'EUR')}</strong><small>${eurUsd?`≈ ${money(cultsUsd,'USD')} · `:''}${cults.count} ventas</small>${eurUsd?arsEquivalent(cultsUsd):''}<em class="income-change">${esc(variation(cults.net,previousCults.net))}</em></article>
      <article class="metric-card"><span>Ventas por fuera · ${esc(scope)}</span><strong>${money(direct.net,'USD')}</strong>${arsEquivalent(direct.net)}<small>${direct.count} recibos válidos · incluye presupuestos entregados</small><em class="income-change">${esc(variation(direct.net,previousDirect.net))}</em></article>`;
    $('#incomeRateNote').textContent=eurUsd?`${rateLabel}. ${arsPerUsd?`${arsRateLabel}. `:''}Comparación contra ${periodLabel(previous)}; cada operación conserva su moneda original.`:'No se pudo obtener EUR/USD. Cults y ventas directas permanecen separados hasta recuperar la referencia.';
    const historyYear=year||currentYear;
    $('#incomeMonths').innerHTML=monthNames.map((name,index)=>{const key=`${historyYear}-${String(index+1).padStart(2,'0')}`,prior=previousPeriod(key),cs=sum(periodRows(key)),ds=host.directSummary(key),ps=sum(periodRows(prior)),pds=host.directSummary(prior),cultsValue=eurUsd?cs.net*eurUsd:0,totalValue=ds.net+cultsValue,priorTotal=pds.net+(eurUsd?ps.net*eurUsd:0);return `<tr class="${key===period?'income-month-selected':''}"><td><strong>${name} ${historyYear}</strong></td><td>${money(cs.net,'EUR')}</td><td>${eurUsd?money(cultsValue,'USD'):'—'}</td><td>${money(ds.net,'USD')}</td><td><strong>${eurUsd?money(totalValue,'USD'):'—'}</strong></td><td><span class="income-change compact">${esc(variation(totalValue,priorTotal,true))}</span></td></tr>`;}).join('');
  }
  function render() {
    years();const rows=filtered(),stats=sum(rows);page=Math.min(page,Math.max(0,Math.ceil(rows.length/pageSize)-1));
    $('#cultsMetrics').innerHTML=[['Ventas',stats.count,'Operaciones de la selección'],['Bruto',money(stats.gross),'Antes de comisión'],['Comisión Cults',money(stats.fee),'Descontada por la plataforma'],['Neto',money(stats.net),`${money(stats.pending)} pendiente de transferencia`]].map(([label,value,note],i)=>`<article class="metric-card ${i===3?'red-accent':''}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    $('#cultsRateNote').textContent=eurUsd?`${rateLabel} · Neto seleccionado ≈ ${money(stats.net*eurUsd,'USD')}.`:'Los totales de Cults se muestran en su moneda original.';
    const groups=new Map();rows.forEach(r=>{const key=String(r.sold_at).slice(0,7);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
    $('#cultsMonths').innerHTML=[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([month,items])=>{const s=sum(items);return `<tr><td><strong>${esc(month)}</strong></td><td>${s.count}</td><td>${money(s.gross)}</td><td>${money(s.fee)}</td><td><strong>${money(s.net)}</strong></td></tr>`;}).join('')||'<tr><td colspan="5">Sin ventas para esta selección.</td></tr>';
    const visible=rows.slice(page*pageSize,(page+1)*pageSize);
    $('#cultsRows').innerHTML=visible.map(r=>`<tr><td><strong>${new Date(r.sold_at).toLocaleDateString('es-AR')}</strong><small>${new Date(r.sold_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</small></td><td><strong>${r.product_url?`<a class="cults-link" href="${esc(r.product_url)}" target="_blank" rel="noopener noreferrer">${esc(r.product_name)} ↗</a>`:esc(r.product_name)}</strong></td><td>${esc(r.buyer_nick||'—')}<small>${esc(`${r.country_flag||''} ${r.country_name||'—'}`.trim())}</small></td><td>${money(r.gross_excluding_tax,r.currency)}</td><td>${money(r.commission,r.currency)}<small>${Number(r.commission_percent||0).toLocaleString('es-AR')}%</small></td><td><strong>${money(r.net_income,r.currency)}</strong></td><td><span class="status-badge ${r.paid_out_at?'delivered':'progress'}">${r.paid_out_at?'Transferida':'Pendiente'}</span></td></tr>`).join('');
    $('#cultsEmpty').hidden=rows.length>0;
    const pages=Math.ceil(rows.length/pageSize);$('#cultsPagination').innerHTML=pages>1?`<button class="row-button" type="button" data-page="prev" ${page===0?'disabled':''}>← Anterior</button><span>Página ${page+1} de ${pages} · ${rows.length} ventas</span><button class="row-button" type="button" data-page="next" ${page>=pages-1?'disabled':''}>Siguiente →</button>`:'';
    renderDashboard();
  }
  async function loadRate(force=false) {
    try {
      const cached=JSON.parse(localStorage.getItem(rateKey)||'null'),fresh=cached&&Date.now()-Date.parse(cached.updatedAt)<6*3600000;
      if(cached?.rate>0){eurUsd=Number(cached.rate);rateLabel=`Referencia EUR/USD ${eurUsd.toFixed(4)} · ${cached.source}`;}
      if(!force&&fresh)return render();
      const response=await fetch('https://open.er-api.com/v6/latest/EUR',{cache:'no-store'});if(!response.ok)throw Error('rate');const data=await response.json(),rate=Number(data.rates?.USD);if(!(rate>0))throw Error('rate');
      const value={rate,source:'ExchangeRate-API',updatedAt:new Date().toISOString()};localStorage.setItem(rateKey,JSON.stringify(value));eurUsd=rate;rateLabel=`Referencia EUR/USD ${rate.toFixed(4)} · ExchangeRate-API`;render();
    } catch { render(); }
  }
  async function loadArsRate(force=false) {
    try {
      const reference=await host.rate('ARS',force),rate=Number(reference?.rate);
      if(!(rate>0))throw Error('rate');
      arsPerUsd=rate;
      arsRateLabel=`${reference.source} · 1 USD = ${arsMoney(rate)}`;
    } catch {
      arsPerUsd=0;
      arsRateLabel='Sin referencia USD/ARS';
    }
    renderDashboard();
  }
  async function refresh() {
    if(!user)return;ready=false;$('#cultsStatus').textContent='Cargando ventas privadas…';
    try {
      const all=[];for(let offset=0;;offset+=1000){const {data,error}=await host.cloud.from('cults_sales').select('*').eq('user_id',user.id).eq('is_active',true).order('sold_at',{ascending:false}).order('external_id').range(offset,offset+999);if(error)throw error;all.push(...data);if(data.length<1000)break;}
      const stateResult=await host.cloud.from('cults_sync_state').select('*').eq('user_id',user.id).maybeSingle();if(stateResult.error)throw stateResult.error;
      records=all;syncState=stateResult.data;ready=true;page=0;years();render();
      const last=syncState?.last_completed_at?new Date(syncState.last_completed_at).toLocaleString('es-AR'):'nunca';$('#cultsStatus').textContent=`Conectado · ${records.length} ventas activas · última sincronización: ${last}.`;
    } catch(error){records=[];render();$('#cultsStatus').textContent=`No se pudieron cargar las ventas de Cults: ${error.message||'revisá la conexión.'}`;}
  }
  async function sync() {
    if(!user||busy)return;busy=true;$('#cultsSync').disabled=true;$('#cultsStatus').textContent='Sincronizando todas las ventas con Cults…';
    try {const {data,error}=await host.cloud.functions.invoke('sync-cults-sales',{body:{}});if(error)throw error;if(data?.error)throw Error(data.error);await refresh();host.toast(`Cults actualizado: ${data.active} ventas.`);}
    catch(error){let message=error?.context?.body?.error||error?.message||'No se pudo sincronizar.';try{if(error?.context instanceof Response){const payload=await error.context.clone().json();message=payload.error||message;}}catch{}$('#cultsStatus').textContent=`No se pudo sincronizar Cults: ${message}`;host.toast('Falló la sincronización con Cults.');}
    finally{busy=false;$('#cultsSync').disabled=false;}
  }
  $('#cultsRefresh').onclick=()=>refresh();$('#cultsSync').onclick=sync;
  ['#cfYear','#cfSearch','#cfPayout','#cfCountry'].forEach(selector=>{$(selector).addEventListener('input',()=>{page=0;render();});$(selector).addEventListener('change',()=>{page=0;render();});});
  $('#cfClear').onclick=()=>{$('#cfYear').value='';$('#cfSearch').value='';$('#cfPayout').value='';$('#cfCountry').value='';page=0;render();};
  $('#incomeYear').onchange=renderDashboard;$('#incomeMonth').onchange=renderDashboard;
  $('#cultsPagination').onclick=event=>{const target=event.target.closest('[data-page]');if(!target)return;if(target.dataset.page==='prev')page=Math.max(0,page-1);else page++;render();view.scrollIntoView({behavior:'smooth',block:'start'});};
  return {async start(account){user=account;await Promise.all([refresh(),loadRate(),loadArsRate()]);if(!records.length)await sync();},stop(){user=null;records=[];syncState=null;ready=false;render();},refresh,sync,render,renderDashboard};
} };
