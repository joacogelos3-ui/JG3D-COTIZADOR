(() => {
  "use strict";

  const STORAGE = {
    clients: "jg3d_quote_clients_v1",
    quotes: "jg3d_quotes_v1",
    settings: "jg3d_quote_settings_v1"
  };

  const defaults = {
    modelRate: 10,
    renderRate: 5,
    personalization: 5,
    paymentThreshold: 50,
    paypalPercent: 5.4,
    paypalFixed: 0.30,
    validDays: 7,
    nextNumber: 1,
    rates: { USD: 1, BRL: 5.4, ARS: 1300 }
  };

  const statusLabels = {
    draft: "Borrador",
    sent: "Enviado",
    accepted: "Aceptado",
    progress: "En proceso",
    finished: "Terminado",
    delivered: "Entregado"
  };

  const countries = { BR: "Brasil", US: "Estados Unidos", AR: "Argentina", OTHER: "Otro país" };
  const languageLabels = { es: "Español", en: "English", pt: "Português" };
  const logoUrl = "https://raw.githubusercontent.com/joacogelos3-ui/jg3dworks/main/assets/jg3d-logo.png";

  let settings = load(STORAGE.settings, defaults);
  let clients = load(STORAGE.clients, []);
  let quotes = load(STORAGE.quotes, []);
  let currentPreview = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function load(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (!parsed) return structuredClone(fallback);
      if (key === STORAGE.settings) {
        return { ...structuredClone(defaults), ...parsed, rates: { ...defaults.rates, ...(parsed.rates || {}) } };
      }
      return parsed;
    } catch {
      return structuredClone(fallback);
    }
  }

  function persist() {
    localStorage.setItem(STORAGE.clients, JSON.stringify(clients));
    localStorage.setItem(STORAGE.quotes, JSON.stringify(quotes));
    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  }

  function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function money(value, currency = "USD") {
    return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : currency === "BRL" ? "pt-BR" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "ARS" ? 0 : 2,
      maximumFractionDigits: currency === "ARS" ? 0 : 2
    }).format(numeric(value));
  }

  function dateLabel(iso) {
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
  }

  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
  }

  function navigate(viewName) {
    const headings = {
      dashboard: ["RESUMEN", "Panel de trabajo"],
      quote: ["COTIZACIÓN", "Nuevo presupuesto"],
      clients: ["RELACIONES", "Clientes"],
      history: ["SEGUIMIENTO", "Presupuestos"],
      settings: ["SISTEMA", "Configuración"]
    };
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${viewName}`));
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === viewName));
    $("#pageEyebrow").textContent = headings[viewName][0];
    $("#pageTitle").textContent = headings[viewName][1];
    $("#sidebar").classList.remove("open");
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "clients") renderClients();
    if (viewName === "history") renderQuotes();
    if (viewName === "settings") populateSettings();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getQuoteData() {
    const currency = $("#currency").value;
    const modelHours = numeric($("#modelHours").value);
    const renderHours = numeric($("#renderHours").value);
    const difficultyPercent = numeric($("#difficulty").value);
    const urgencyPercent = numeric($("#urgency").value);
    const personalizationEnabled = $("#personalization").value === "1";
    const licenseFee = numeric($("#licenseFee").value);
    const exchangeRate = Math.max(.0001, numeric($("#exchangeRate").value, 1));
    const paymentMethod = $("#paymentMethod").value;

    const modelCost = modelHours * settings.modelRate;
    const renderCost = renderHours * settings.renderRate;
    const base = modelCost + renderCost;
    const difficultyAmount = base * difficultyPercent / 100;
    const personalizationAmount = personalizationEnabled ? settings.personalization : 0;
    const technicalSubtotal = base + difficultyAmount + personalizationAmount;
    const urgencyAmount = technicalSubtotal * urgencyPercent / 100;
    const desiredNet = technicalSubtotal + urgencyAmount + licenseFee;
    const installments = desiredNet >= settings.paymentThreshold ? 2 : 1;

    let grossUsd = desiredNet;
    if (paymentMethod === "paypal" && desiredNet > 0) {
      const rate = Math.min(.99, settings.paypalPercent / 100);
      const netInstallment = desiredNet / installments;
      grossUsd = installments * ((netInstallment + settings.paypalFixed) / (1 - rate));
    }

    const paymentFee = Math.max(0, grossUsd - desiredNet);
    const finalConverted = grossUsd * exchangeRate;
    const deliverables = $$('input[name="deliverable"]:checked').map(input => input.value);
    const today = new Date();
    const validDays = Math.max(1, numeric($("#validDays").value, settings.validDays));
    const validUntil = new Date(today);
    validUntil.setDate(validUntil.getDate() + validDays);

    return {
      clientId: $("#quoteClient").value,
      clientType: $("#clientType").value,
      clientName: $("#clientName").value.trim() || "Cliente",
      country: $("#country").value,
      language: $("#language").value,
      currency,
      projectTitle: $("#projectTitle").value.trim() || "Proyecto de modelado 3D",
      vehicle: $("#vehicle").value.trim(),
      niche: $("#niche").value,
      scope: $("#scope").value.trim(),
      modelHours,
      renderHours,
      difficultyPercent,
      urgencyPercent,
      personalizationEnabled,
      licenseFee,
      deliverables,
      revisions: Math.max(0, numeric($("#revisions").value)),
      paymentMethod,
      exchangeRate,
      validDays,
      validUntil: validUntil.toISOString(),
      notes: $("#notes").value.trim(),
      risks: {
        reverse: $("#riskReverse").checked,
        geometry: $("#riskGeometry").checked,
        variants: $("#riskVariants").checked
      },
      calculation: {
        modelCost,
        renderCost,
        base,
        difficultyAmount,
        personalizationAmount,
        technicalSubtotal,
        urgencyAmount,
        licenseFee,
        desiredNet,
        installments,
        paymentFee,
        grossUsd,
        finalConverted
      }
    };
  }

  function updateCalculation() {
    const data = getQuoteData();
    const c = data.calculation;
    $("#sumModel").textContent = money(c.modelCost);
    $("#sumRender").textContent = money(c.renderCost);
    $("#sumDifficulty").textContent = money(c.difficultyAmount);
    $("#sumPersonalization").textContent = money(c.personalizationAmount);
    $("#sumUrgency").textContent = money(c.urgencyAmount);
    $("#sumLicense").textContent = money(c.licenseFee);
    $("#sumPaymentFee").textContent = money(c.paymentFee);
    $("#sumNet").textContent = money(c.desiredNet);
    $("#displayCurrency").textContent = data.currency;
    $("#finalPrice").textContent = new Intl.NumberFormat(data.currency === "ARS" ? "es-AR" : "en-US", { minimumFractionDigits: data.currency === "ARS" ? 0 : 2, maximumFractionDigits: data.currency === "ARS" ? 0 : 2 }).format(c.finalConverted);
    $("#priceSubtitle").textContent = data.paymentMethod === "paypal" ? "Importe final con costos de cobro incluidos" : "Importe final para el cliente";
    $("#paymentPlan").innerHTML = c.installments === 2
      ? `<span>Forma de pago</span><strong>50% para comenzar: ${money(c.finalConverted / 2, data.currency)}<br>50% antes de entregar: ${money(c.finalConverted / 2, data.currency)}</strong>`
      : `<span>Forma de pago</span><strong>100% antes de comenzar: ${money(c.finalConverted, data.currency)}</strong>`;
  }

  function quoteNumber(number = settings.nextNumber) {
    return `JG3D-${new Date().getFullYear()}-${String(number).padStart(3, "0")}`;
  }

  function buildDocument(record) {
    const data = record.data || record;
    const number = record.number || quoteNumber();
    const createdAt = record.createdAt || new Date().toISOString();
    const labels = {
      es: {
        quote: "Presupuesto", client: "Cliente", country: "País", application: "Aplicación", delivery: "Plazo", validity: "Válido hasta", scope: "Alcance del trabajo", deliverables: "Entregables", conditions: "Condiciones", total: "Precio final", payment: "Forma de pago", revisions: "correcciones menores incluidas", normal: "Normal · 7-10 días", priority: "Prioridad · 4-6 días", urgent: "Urgente · 1-3 días", origin: "Argentina · Entrega digital mundial", contact: "Contacto directo", footer: "Diseño y modelado 3D automotriz"
      },
      en: {
        quote: "Quotation", client: "Client", country: "Country", application: "Application", delivery: "Delivery time", validity: "Valid until", scope: "Scope of work", deliverables: "Deliverables", conditions: "Terms", total: "Final price", payment: "Payment terms", revisions: "minor revision rounds included", normal: "Standard · 7-10 days", priority: "Priority · 4-6 days", urgent: "Urgent · 1-3 days", origin: "Argentina · Worldwide digital delivery", contact: "Direct contact", footer: "Automotive 3D design and modeling"
      },
      pt: {
        quote: "Orçamento", client: "Cliente", country: "País", application: "Aplicação", delivery: "Prazo", validity: "Válido até", scope: "Escopo do trabalho", deliverables: "Entregáveis", conditions: "Condições", total: "Preço final", payment: "Forma de pagamento", revisions: "rodadas de ajustes menores incluídas", normal: "Normal · 7-10 dias", priority: "Prioridade · 4-6 dias", urgent: "Urgente · 1-3 dias", origin: "Argentina · Entrega digital mundial", contact: "Contato direto", footer: "Design e modelagem 3D automotiva"
      }
    }[data.language] || null;
    const urgencyText = data.urgencyPercent === 40 ? labels.urgent : data.urgencyPercent === 20 ? labels.priority : labels.normal;
    const paymentText = data.calculation.installments === 2
      ? `50% (${money(data.calculation.finalConverted / 2, data.currency)}) + 50% (${money(data.calculation.finalConverted / 2, data.currency)})`
      : `100% ${money(data.calculation.finalConverted, data.currency)}`;
    const scope = data.scope || (data.language === "pt" ? "Modelagem 3D conforme as referências e medidas fornecidas pelo cliente." : data.language === "en" ? "3D modeling according to the references and measurements supplied by the client." : "Modelado 3D según las referencias y medidas suministradas por el cliente.");
    const defaultCondition = data.language === "pt" ? "Alterações fora do escopo e revisões adicionais serão orçadas separadamente." : data.language === "en" ? "Changes outside the agreed scope and additional revisions will be quoted separately." : "Los cambios fuera del alcance y las revisiones adicionales se cotizarán por separado.";

    return `
      <div class="doc-watermark" aria-hidden="true"><img src="${logoUrl}" alt=""></div>
      <header class="doc-header">
        <div class="doc-brand">
          <img class="doc-logo" src="${logoUrl}" alt="JG3D Works">
        </div>
        <div class="doc-meta"><span>${labels.quote}</span><h2>${escapeHtml(number)}</h2><p>${dateLabel(createdAt)}</p></div>
      </header>
      <span class="doc-kicker">JG3D WORKS · ${labels.quote}</span>
      <h1 class="doc-title">${escapeHtml(data.projectTitle)}</h1>
      <div class="doc-grid">
        <div class="doc-field"><span>${labels.client}</span><strong>${escapeHtml(data.clientName)}</strong></div>
        <div class="doc-field"><span>${labels.country}</span><strong>${escapeHtml(countries[data.country] || data.country)}</strong></div>
        <div class="doc-field"><span>${labels.application}</span><strong>${escapeHtml(data.vehicle || data.niche)}</strong></div>
        <div class="doc-field"><span>${labels.delivery}</span><strong>${urgencyText}</strong></div>
        <div class="doc-field"><span>${labels.validity}</span><strong>${dateLabel(data.validUntil)}</strong></div>
        <div class="doc-field"><span>${labels.payment}</span><strong>${paymentText}</strong></div>
      </div>
      <section class="doc-section"><h3>${labels.scope}</h3><p>${escapeHtml(scope).replace(/\n/g, "<br>")}</p></section>
      <section class="doc-section"><h3>${labels.deliverables}</h3><ul>${(data.deliverables.length ? data.deliverables : ["Archivo STL listo para imprimir"]).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section class="doc-section"><h3>${labels.conditions}</h3><ul><li>${data.revisions} ${labels.revisions}.</li><li>${escapeHtml(data.notes || defaultCondition)}</li><li>${data.language === "pt" ? "A entrega dos arquivos finais é realizada após a confirmação do pagamento." : data.language === "en" ? "Final files are delivered after payment confirmation." : "Los archivos finales se entregan después de confirmar el pago."}</li></ul></section>
      <div class="doc-total"><div><span>${labels.total}</span><strong>${money(data.calculation.finalConverted, data.currency)}</strong></div><div class="doc-payment"><span>${labels.payment}</span><p>${paymentText}<br>${data.paymentMethod === "paypal" ? "PayPal" : escapeHtml(data.paymentMethod)}</p></div></div>
      <footer class="doc-footer">
        <div class="doc-footer-top">
          <div class="doc-origin">
            <svg class="doc-flag" viewBox="0 0 30 20" role="img" aria-label="Argentina">
              <rect width="30" height="6.67" fill="#74acdf"></rect>
              <rect y="6.67" width="30" height="6.66" fill="#ffffff"></rect>
              <rect y="13.33" width="30" height="6.67" fill="#74acdf"></rect>
              <circle cx="15" cy="10" r="2.1" fill="#f6b40e"></circle>
            </svg>
            <div><span>JG3D WORKS</span><strong>${labels.origin}</strong></div>
          </div>
          <div class="doc-links" aria-label="${labels.contact}">
            <a href="https://www.instagram.com/jg3d.works/" target="_blank" rel="noopener noreferrer">
              <svg class="doc-instagram" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle class="doc-instagram-dot" cx="17.4" cy="6.7" r="1"></circle></svg>
              <span>@jg3d.works</span>
            </a>
            <a href="https://jg3dworks.com/whatsapp/" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
            <a href="https://jg3dworks.com/" target="_blank" rel="noopener noreferrer">jg3dworks.com ↗</a>
          </div>
        </div>
        <p>${labels.footer}</p>
      </footer>`;
  }

  function openPreview(record = null) {
    currentPreview = record || { number: quoteNumber(), createdAt: new Date().toISOString(), data: getQuoteData() };
    $("#quoteDocument").innerHTML = buildDocument(currentPreview);
    $("#previewModal").classList.add("open");
    $("#previewModal").setAttribute("aria-hidden", "false");
  }

  function closePreview() {
    $("#previewModal").classList.remove("open");
    $("#previewModal").setAttribute("aria-hidden", "true");
  }

  function whatsappMessage(record) {
    const data = record.data || record;
    const number = record.number || quoteNumber();
    const total = money(data.calculation.finalConverted, data.currency);
    const messages = {
      es: `Hola ${data.clientName}, te envío el presupuesto ${number} correspondiente a “${data.projectTitle}”.\n\nTotal: ${total}\nValidez: ${data.validDays} días.\n\nAdjunto el PDF con el alcance, los entregables y la forma de pago. Quedo atento a tu confirmación.`,
      en: `Hello ${data.clientName}, I’m sending you quotation ${number} for “${data.projectTitle}”.\n\nTotal: ${total}\nValid for: ${data.validDays} days.\n\nThe attached PDF includes the scope, deliverables and payment terms. Please let me know if you would like to proceed.`,
      pt: `Olá ${data.clientName}, estou enviando o orçamento ${number} referente a “${data.projectTitle}”.\n\nTotal: ${total}\nValidade: ${data.validDays} dias.\n\nO PDF anexo contém o escopo, os entregáveis e a forma de pagamento. Fico no aguardo da sua confirmação.`
    };
    return messages[data.language] || messages.en;
  }

  async function copyWhatsapp() {
    if (!currentPreview) return;
    try {
      await navigator.clipboard.writeText(whatsappMessage(currentPreview));
      toast("Mensaje de WhatsApp copiado.");
    } catch {
      toast("No se pudo copiar automáticamente.");
    }
  }

  function saveQuote(event) {
    event.preventDefault();
    if (!$("#projectTitle").value.trim()) {
      $("#projectTitle").focus();
      toast("Ingresá un título para el proyecto.");
      return;
    }
    const record = {
      id: uid("quote"),
      number: quoteNumber(),
      createdAt: new Date().toISOString(),
      status: "draft",
      data: getQuoteData()
    };
    quotes.unshift(record);
    settings.nextNumber += 1;
    persist();
    renderDashboard();
    renderQuotes();
    openPreview(record);
    toast(`Presupuesto ${record.number} guardado como borrador.`);
  }

  function resetQuoteForm() {
    $("#quoteForm").reset();
    $("#country").value = "BR";
    $("#language").value = "pt";
    $("#currency").value = "BRL";
    $("#validDays").value = settings.validDays;
    setCurrencyRate();
    updateCalculation();
  }

  function setCountryDefaults() {
    const map = {
      BR: { language: "pt", currency: "BRL" },
      US: { language: "en", currency: "USD" },
      AR: { language: "es", currency: "ARS" },
      OTHER: { language: "en", currency: "USD" }
    }[$("#country").value];
    $("#language").value = map.language;
    $("#currency").value = map.currency;
    setCurrencyRate();
  }

  function setCurrencyRate() {
    const currency = $("#currency").value;
    $("#exchangeRate").value = settings.rates[currency] || 1;
    $("#currencySuffix").textContent = currency;
    updateCalculation();
  }

  function populateClientSelect() {
    const select = $("#quoteClient");
    const previous = select.value;
    select.innerHTML = '<option value="">Cliente ocasional / sin guardar</option>' + clients.map(client => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join("");
    if (clients.some(client => client.id === previous)) select.value = previous;
  }

  function selectClient() {
    const client = clients.find(item => item.id === $("#quoteClient").value);
    if (!client) return;
    $("#clientType").value = "existing";
    $("#clientName").value = client.name;
    $("#country").value = client.country;
    $("#language").value = client.language;
    $("#currency").value = client.currency;
    setCurrencyRate();
  }

  function saveClient(event) {
    event.preventDefault();
    const client = {
      id: uid("client"),
      createdAt: new Date().toISOString(),
      name: $("#newClientName").value.trim(),
      country: $("#newClientCountry").value,
      language: $("#newClientLanguage").value,
      phone: $("#newClientPhone").value.trim(),
      email: $("#newClientEmail").value.trim(),
      currency: $("#newClientCurrency").value,
      notes: $("#newClientNotes").value.trim()
    };
    clients.unshift(client);
    persist();
    $("#clientForm").reset();
    $("#clientFormCard").classList.add("hidden");
    populateClientSelect();
    renderClients();
    renderDashboard();
    toast("Cliente guardado.");
  }

  function deleteClient(id) {
    if (!confirm("¿Eliminar este cliente del prototipo?")) return;
    clients = clients.filter(client => client.id !== id);
    persist();
    populateClientSelect();
    renderClients();
    renderDashboard();
    toast("Cliente eliminado.");
  }

  function renderClients() {
    const query = $("#clientSearch").value.trim().toLowerCase();
    const filtered = clients.filter(client => [client.name, client.email, client.phone, countries[client.country]].join(" ").toLowerCase().includes(query));
    $("#clientsTable").innerHTML = filtered.map(client => {
      const quoteCount = quotes.filter(quote => quote.data.clientId === client.id).length;
      return `<tr>
        <td><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.notes || "Sin notas")}</small></td>
        <td>${escapeHtml(countries[client.country] || client.country)}</td>
        <td>${escapeHtml(languageLabels[client.language] || client.language)}</td>
        <td><strong>${escapeHtml(client.phone || client.email || "—")}</strong><small>${escapeHtml(client.email || "")}</small></td>
        <td>${quoteCount}</td>
        <td><div class="row-actions"><button class="row-button danger" type="button" data-delete-client="${client.id}">×</button></div></td>
      </tr>`;
    }).join("");
    $("#clientCount").textContent = `${filtered.length} ${filtered.length === 1 ? "cliente" : "clientes"}`;
    $("#clientsEmpty").classList.toggle("hidden", filtered.length > 0);
    $(".responsive-table", $("#view-clients")).classList.toggle("hidden", filtered.length === 0);
  }

  function renderQuotes() {
    const query = $("#quoteSearch").value.trim().toLowerCase();
    const filter = $("#statusFilter").value;
    const filtered = quotes.filter(record => {
      const matchesText = [record.number, record.data.projectTitle, record.data.clientName].join(" ").toLowerCase().includes(query);
      return matchesText && (filter === "all" || record.status === filter);
    });
    $("#quotesTable").innerHTML = filtered.map(record => `<tr>
      <td><strong>${record.number}</strong></td>
      <td><strong>${escapeHtml(record.data.projectTitle)}</strong><small>${escapeHtml(record.data.vehicle || record.data.niche)}</small></td>
      <td>${escapeHtml(record.data.clientName)}</td>
      <td><strong>${money(record.data.calculation.finalConverted, record.data.currency)}</strong></td>
      <td><select data-status="${record.id}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${record.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td>${dateLabel(record.createdAt)}</td>
      <td><div class="row-actions"><button class="row-button" type="button" data-preview-quote="${record.id}" title="Vista previa">PDF</button><button class="row-button danger" type="button" data-delete-quote="${record.id}" title="Eliminar">×</button></div></td>
    </tr>`).join("");
    $("#quotesEmpty").classList.toggle("hidden", filtered.length > 0);
    $(".responsive-table", $("#view-history")).classList.toggle("hidden", filtered.length === 0);
  }

  function updateQuoteStatus(id, status) {
    const record = quotes.find(item => item.id === id);
    if (!record) return;
    record.status = status;
    persist();
    renderDashboard();
    toast(`Estado actualizado: ${statusLabels[status]}.`);
  }

  function deleteQuote(id) {
    if (!confirm("¿Eliminar este presupuesto del prototipo?")) return;
    quotes = quotes.filter(record => record.id !== id);
    persist();
    renderQuotes();
    renderDashboard();
    toast("Presupuesto eliminado.");
  }

  function renderDashboard() {
    $("#metricTotal").textContent = quotes.length;
    $("#metricProgress").textContent = quotes.filter(record => record.status === "progress").length;
    $("#metricClients").textContent = clients.length;
    $("#metricValue").textContent = money(quotes.reduce((total, record) => total + record.data.calculation.grossUsd, 0));
    const recent = quotes.slice(0, 4);
    $("#recentQuotes").innerHTML = recent.length ? recent.map(record => `<div class="recent-item"><div><strong>${escapeHtml(record.data.projectTitle)}</strong><small>${record.number} · ${escapeHtml(record.data.clientName)}</small></div><div class="recent-price"><strong>${money(record.data.calculation.finalConverted, record.data.currency)}</strong><span class="status-badge ${record.status}">${statusLabels[record.status]}</span></div></div>`).join("") : '<div class="empty-state small"><span>◇</span><p>Todavía no hay presupuestos guardados.</p></div>';
  }

  function populateSettings() {
    $("#settingModelRate").value = settings.modelRate;
    $("#settingRenderRate").value = settings.renderRate;
    $("#settingPersonalization").value = settings.personalization;
    $("#settingPaymentThreshold").value = settings.paymentThreshold;
    $("#settingPaypalPercent").value = settings.paypalPercent;
    $("#settingPaypalFixed").value = settings.paypalFixed;
    $("#settingValidDays").value = settings.validDays;
    $("#settingNextNumber").value = settings.nextNumber;
    $("#settingUsdRate").value = settings.rates.USD;
    $("#settingBrlRate").value = settings.rates.BRL;
    $("#settingArsRate").value = settings.rates.ARS;
  }

  function saveSettings(event) {
    event.preventDefault();
    settings = {
      modelRate: numeric($("#settingModelRate").value, 10),
      renderRate: numeric($("#settingRenderRate").value, 5),
      personalization: numeric($("#settingPersonalization").value, 5),
      paymentThreshold: numeric($("#settingPaymentThreshold").value, 50),
      paypalPercent: numeric($("#settingPaypalPercent").value, 5.4),
      paypalFixed: numeric($("#settingPaypalFixed").value, .3),
      validDays: numeric($("#settingValidDays").value, 7),
      nextNumber: numeric($("#settingNextNumber").value, 1),
      rates: {
        USD: numeric($("#settingUsdRate").value, 1),
        BRL: numeric($("#settingBrlRate").value, 5.4),
        ARS: numeric($("#settingArsRate").value, 1300)
      }
    };
    persist();
    $("#validDays").value = settings.validDays;
    setCurrencyRate();
    updateCalculation();
    toast("Configuración guardada.");
  }

  function bindEvents() {
    $$(".nav-item").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
    $$('[data-go]').forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
    $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    $("#quoteForm").addEventListener("input", updateCalculation);
    $("#quoteForm").addEventListener("change", updateCalculation);
    $("#quoteForm").addEventListener("submit", saveQuote);
    $("#country").addEventListener("change", setCountryDefaults);
    $("#currency").addEventListener("change", setCurrencyRate);
    $("#quoteClient").addEventListener("change", selectClient);
    $("#printPreview").addEventListener("click", () => openPreview());
    $("#closePreview").addEventListener("click", closePreview);
    $("#previewModal").addEventListener("click", event => { if (event.target === $("#previewModal")) closePreview(); });
    $("#printQuote").addEventListener("click", () => window.print());
    $("#copyWhatsapp").addEventListener("click", copyWhatsapp);
    $("#newClientButton").addEventListener("click", () => $("#clientFormCard").classList.remove("hidden"));
    $("#cancelClient").addEventListener("click", () => $("#clientFormCard").classList.add("hidden"));
    $("#clientForm").addEventListener("submit", saveClient);
    $("#clientSearch").addEventListener("input", renderClients);
    $("#quoteSearch").addEventListener("input", renderQuotes);
    $("#statusFilter").addEventListener("change", renderQuotes);
    $("#settingsForm").addEventListener("submit", saveSettings);
    $("#resetSettings").addEventListener("click", () => {
      if (!confirm("¿Restaurar las tarifas y reglas iniciales?")) return;
      settings = structuredClone(defaults);
      persist();
      populateSettings();
      setCurrencyRate();
      toast("Valores iniciales restaurados.");
    });
    document.addEventListener("click", event => {
      const deleteClientButton = event.target.closest("[data-delete-client]");
      const previewQuoteButton = event.target.closest("[data-preview-quote]");
      const deleteQuoteButton = event.target.closest("[data-delete-quote]");
      if (deleteClientButton) deleteClient(deleteClientButton.dataset.deleteClient);
      if (previewQuoteButton) openPreview(quotes.find(record => record.id === previewQuoteButton.dataset.previewQuote));
      if (deleteQuoteButton) deleteQuote(deleteQuoteButton.dataset.deleteQuote);
    });
    document.addEventListener("change", event => {
      if (event.target.matches("[data-status]")) updateQuoteStatus(event.target.dataset.status, event.target.value);
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closePreview(); });
  }

  function init() {
    bindEvents();
    populateClientSelect();
    populateSettings();
    resetQuoteForm();
    renderDashboard();
    renderClients();
    renderQuotes();
  }

  init();
})();
