(() => {
  "use strict";

  const STORAGE = {
    clients: "jg3d_quote_clients_v1",
    quotes: "jg3d_quotes_v1",
    settings: "jg3d_quote_settings_v1",
    fx: "jg3d_quote_fx_v1"
  };

  const defaults = {
    modelRate: 10,
    renderRate: 5,
    personalization: 5,
    paymentThreshold: 50,
    paypalPercent: 6,
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
  const documentLocales = { es: "es-AR", en: "en-US", pt: "pt-BR" };
  const documentCountries = {
    BR: { es: "Brasil", en: "Brazil", pt: "Brasil" },
    US: { es: "Estados Unidos", en: "United States", pt: "Estados Unidos" },
    AR: { es: "Argentina", en: "Argentina", pt: "Argentina" },
    OTHER: { es: "Otro país", en: "Other country", pt: "Outro país" }
  };
  const documentNiches = {
    street: { es: "Automóvil personal o de calle", en: "Personal or street car", pt: "Carro pessoal ou de rua" },
    motorsport: { es: "Competición y automovilismo", en: "Competition and motorsport", pt: "Competição e automobilismo" },
    workshop: { es: "Talleres, herramientas y gabaritos", en: "Workshops, tools and assembly jigs", pt: "Oficinas, ferramentas e gabaritos" },
    business: { es: "Empresas, fabricación o reventa", en: "Business, manufacturing or resale", pt: "Empresas, fabricação ou revenda" }
  };
  const documentDeliverables = {
    stl: { es: "Archivo STL listo para imprimir", en: "Print-ready STL file", pt: "Arquivo STL pronto para impressão" },
    step: { es: "Archivo STEP o sólido exportado", en: "STEP file or exported solid model", pt: "Arquivo STEP ou sólido exportado" },
    renders: { es: "Imágenes renderizadas", en: "Rendered images", pt: "Imagens renderizadas" },
    drawings: { es: "Planos o instrucciones de montaje", en: "Drawings or assembly instructions", pt: "Desenhos técnicos ou instruções de montagem" }
  };
  const documentPaymentMethods = {
    paypal: { es: "PayPal", en: "PayPal", pt: "PayPal" },
    other: { es: "Transferencia u otro medio", en: "Bank transfer or other method", pt: "Transferência ou outro meio" }
  };
  const logoUrl = "https://raw.githubusercontent.com/joacogelos3-ui/jg3dworks/main/assets/jg3d-logo.png";
  const cloudConfig = window.JG3D_SUPABASE || null;
  const cloudClient = cloudConfig && window.supabase
    ? window.supabase.createClient(cloudConfig.url, cloudConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null;

  let settings = load(STORAGE.settings, defaults);
  let clients = load(STORAGE.clients, []);
  let quotes = load(STORAGE.quotes, []);
  let currentPreview = null;
  let receiptsApp = null;
  let cultsApp = null;
  let currentUser = null;
  let cloudSyncTimer = null;
  let suppressCloudSync = false;
  let appStarted = false;
  const rateProviders = {
    ARS: { url: "https://dolarapi.com/v1/dolares/blue", source: "DolarAPI · dólar blue venta", ttl: 5 * 60 * 1000, maxAge: 7 * 86400000 },
    BRL: { url: "https://open.er-api.com/v6/latest/USD", source: "ExchangeRate-API · referencia USD/BRL", ttl: 60 * 60 * 1000, maxAge: 3 * 86400000 }
  };
  const storedRateCache = load(STORAGE.fx, {});
  const rateCache = storedRateCache && typeof storedRateCache === "object" && !Array.isArray(storedRateCache) ? storedRateCache : {};
  const rateRequests = new Map();
  let rateGeneration = 0;
  let rateState = { mode: "manual", status: "ready", metadata: null };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function load(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (!parsed) return structuredClone(fallback);
      if (key === STORAGE.settings) {
        const merged = { ...structuredClone(defaults), ...parsed, rates: { ...defaults.rates, ...(parsed.rates || {}) } };
        // The previous built-in default was 5.4%; migrate that untouched default
        // to the new 6% estimate while keeping any other custom setting intact.
        if (parsed.paypalPercent === 5.4) merged.paypalPercent = 6;
        return merged;
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
    if (!suppressCloudSync) scheduleCloudSave();
  }

  function workspacePayload() {
    return {
      user_id: currentUser.id,
      clients,
      quotes,
      settings,
      updated_at: new Date().toISOString()
    };
  }

  async function saveWorkspaceNow() {
    if (!cloudClient || !currentUser) return;
    const { error } = await cloudClient.from("workspaces").upsert(workspacePayload(), { onConflict: "user_id" });
    if (error) throw error;
  }

  function scheduleCloudSave() {
    if (!cloudClient || !currentUser) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(async () => {
      try {
        await saveWorkspaceNow();
        setCloudStatus("Sincronizado", "online");
      } catch (error) {
        console.error("Supabase sync failed", error);
        setCloudStatus("Error de sincronización", "error");
        toast("No se pudo sincronizar con la nube.");
      }
    }, 450);
  }

  async function loadCloudWorkspace() {
    const { data, error } = await cloudClient
      .from("workspaces")
      .select("clients, quotes, settings")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      suppressCloudSync = true;
      clients = Array.isArray(data.clients) ? data.clients : [];
      quotes = Array.isArray(data.quotes) ? data.quotes : [];
      settings = {
        ...structuredClone(defaults),
        ...(data.settings || {}),
        rates: { ...defaults.rates, ...((data.settings || {}).rates || {}) }
      };
      const repaired = restoreQuoteClientLinks();
      persist();
      suppressCloudSync = false;
      if (repaired) await saveWorkspaceNow();
      return "loaded";
    }

    restoreQuoteClientLinks();
    await saveWorkspaceNow();
    return "migrated";
  }

  function setCloudStatus(label, state = "online") {
    const footer = $(".sidebar-footer");
    if (!footer) return;
    const title = $("strong", footer);
    const dot = $(".status-dot", footer);
    title.textContent = label;
    dot.dataset.state = state;
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

  function moneyWithCode(value, currency = "USD") {
    const locale = currency === "ARS" ? "es-AR" : currency === "BRL" ? "pt-BR" : "en-US";
    const digits = currency === "ARS" ? 0 : 2;
    return `${currency} ${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numeric(value))}`;
  }

  function dateLabel(iso) {
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  }

  function documentDateLabel(iso, language = "en") {
    return new Intl.DateTimeFormat(documentLocales[language] || documentLocales.en, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(iso));
  }

  function translatedDocumentValue(dictionary, value, language = "en") {
    const direct = dictionary[value];
    if (direct) return direct[language] || direct.en || value;

    const legacy = Object.values(dictionary).find(translations => Object.values(translations).includes(value));
    return legacy ? (legacy[language] || legacy.en || value) : value;
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

  function setAuthMessage(message = "", type = "") {
    const node = $("#authMessage");
    node.textContent = message;
    node.dataset.type = type;
  }

  function showAuth(message = "", type = "") {
    $("#appShell").hidden = true;
    $("#authGate").hidden = false;
    setAuthMessage(message, type);
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "El correo o la contraseña no son correctos.";
    if (message.includes("email not confirmed")) return "Primero tenés que confirmar el correo en Supabase.";
    if (message.includes("failed to fetch")) return "No se pudo conectar con Supabase. Revisá tu conexión.";
    return "No fue posible iniciar sesión. Intentá nuevamente.";
  }

  async function startAuthenticatedApp(session) {
    currentUser = session.user;
    setAuthMessage("Sincronizando tu espacio privado…", "loading");

    try {
      const result = await loadCloudWorkspace();
      if (!receiptsApp) receiptsApp = window.JG3DReceipts.create({
        cloud: cloudClient, clients: () => clients, quotes: () => quotes, settings: () => settings,
        navigate, toast, footer: documentFooter, rate: fetchCurrencyRate, closePreview,
        incomeChanged: () => cultsApp?.renderDashboard(),
        preview: receipt => openPreview({ kind: 'receipt', receipt }),
        async ensureClient(receipt) {
          const selected = clients.find(c => c.id === receipt.client_id);
          if (selected) return selected.id;
          const matches = matchingClients(receipt.client.name, receipt.client.country);
          if (matches.length > 1) throw Error('Hay varios clientes con ese nombre. Seleccioná la ficha correcta.');
          if (matches.length === 1) return matches[0].id;
          const client = createClientFromQuote({clientName:receipt.client.name, clientEmail:receipt.client.email, clientPhone:receipt.client.phone, country:receipt.client.country, language:receipt.language, currency:receipt.currency});
          try {
            clearTimeout(cloudSyncTimer);
            await saveWorkspaceNow();
            suppressCloudSync = true; persist(); suppressCloudSync = false;
            populateClientSelect(); renderClients(); renderDashboard();
            return client.id;
          } catch (error) {
            clients = clients.filter(c => c.id !== client.id);
            suppressCloudSync = false;
            throw error;
          }
        }
      });
      if (!cultsApp) cultsApp = window.JG3DCults.create({
        cloud: cloudClient,
        toast,
        directSummary: year => receiptsApp?.summary(year) || { count: 0, gross: 0, fee: 0, net: 0 }
      });
      if (!appStarted) {
        bindEvents();
        appStarted = true;
      }
      populateClientSelect();
      populateSettings();
      resetQuoteForm();
      renderDashboard();
      renderClients();
      renderQuotes();
      $("#userEmail").textContent = currentUser.email || "Usuario";
      $("#authGate").hidden = true;
      $("#appShell").hidden = false;
      setCloudStatus("Nube segura activa", "online");
      await receiptsApp.start(currentUser);
      await cultsApp.start(currentUser);
      if (result === "migrated") toast("Datos locales sincronizados con Supabase.");
    } catch (error) {
      console.error("Supabase workspace load failed", error);
      showAuth("La cuenta funciona, pero falta crear la tabla privada en Supabase.", "error");
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (!cloudClient) {
      showAuth("No se pudo cargar la conexión segura.", "error");
      return;
    }

    const button = $("#loginButton");
    button.disabled = true;
    button.textContent = "Ingresando…";
    setAuthMessage("Verificando acceso…", "loading");

    const { data, error } = await cloudClient.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value
    });

    button.disabled = false;
    button.textContent = "Ingresar";

    if (error || !data.session) {
      setAuthMessage(friendlyAuthError(error), "error");
      return;
    }

    $("#loginPassword").value = "";
    await startAuthenticatedApp(data.session);
  }

  async function signOut() {
    const button = $("#logoutButton");
    button.disabled = true;
    try {
      clearTimeout(cloudSyncTimer);
      await saveWorkspaceNow();
    } catch (error) {
      console.error("Final Supabase sync failed", error);
    }
    await cloudClient.auth.signOut();
    currentUser = null;
    receiptsApp?.stop();
    cultsApp?.stop();
    closePreview();
    currentPreview = null;
    $("#quoteDocument").replaceChildren();
    clients = [];
    quotes = [];
    settings = structuredClone(defaults);
    localStorage.removeItem(STORAGE.clients);
    localStorage.removeItem(STORAGE.quotes);
    localStorage.removeItem(STORAGE.settings);
    button.disabled = false;
    showAuth("Sesión cerrada correctamente.", "success");
  }

  function navigate(viewName) {
    const headings = {
      dashboard: ["RESUMEN", "Panel de trabajo"],
      quote: ["COTIZACIÓN", "Nuevo presupuesto"],
      clients: ["RELACIONES", "Clientes"],
      history: ["SEGUIMIENTO", "Presupuestos"],
      receipts: ["VENTAS DIRECTAS", "Recibos e ingresos"],
      cults: ["MARKETPLACE", "Ventas de Cults"],
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
    if (viewName === "receipts") receiptsApp?.render();
    if (viewName === "cults") cultsApp?.render();
    if (viewName === "settings") populateSettings();
    if (viewName === "quote") refreshRateIfNeeded();
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
    let paymentFee = 0;
    let actualNetUsd = desiredNet;
    if (paymentMethod === "paypal") {
      const enteredGross = numeric($("#paypalGrossUsd").value);
      if (enteredGross > 0) grossUsd = enteredGross;
      const rate = Math.min(.99, Math.max(0, settings.paypalPercent / 100));
      paymentFee = grossUsd > 0 ? grossUsd * rate + Math.max(0, settings.paypalFixed) : 0;
      actualNetUsd = Math.max(0, grossUsd - paymentFee);
    }
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
      clientPhone: $("#clientPhone").value.trim(),
      clientEmail: $("#clientEmail").value.trim(),
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
      exchangeRateInfo: { ...structuredClone(rateState.metadata || {}), mode: rateState.mode, currency, rate: exchangeRate },
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
        actualNetUsd,
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
    const isPaypal = data.paymentMethod === "paypal";
    $("#paypalGrossGroup").classList.toggle("hidden", !isPaypal);
    $("#paypalGrossUsd").required = isPaypal;
    $("#sumModel").textContent = money(c.modelCost);
    $("#sumRender").textContent = money(c.renderCost);
    $("#sumDifficulty").textContent = money(c.difficultyAmount);
    $("#sumPersonalization").textContent = money(c.personalizationAmount);
    $("#sumUrgency").textContent = money(c.urgencyAmount);
    $("#sumLicense").textContent = money(c.licenseFee);
    $("#sumPaymentFee").textContent = money(c.paymentFee);
    $("#sumNetLabel").textContent = isPaypal ? "Neto estimado después de PayPal" : "Neto deseado";
    $("#sumNet").textContent = money(isPaypal ? c.actualNetUsd : c.desiredNet);
    const displayCurrency = isPaypal ? "USD" : data.currency;
    const displayAmount = isPaypal ? c.grossUsd : c.finalConverted;
    $("#displayCurrency").textContent = displayCurrency;
    $("#finalPrice").textContent = new Intl.NumberFormat(displayCurrency === "ARS" ? "es-AR" : "en-US", { minimumFractionDigits: displayCurrency === "ARS" ? 0 : 2, maximumFractionDigits: displayCurrency === "ARS" ? 0 : 2 }).format(displayAmount);
    $("#priceSubtitle").textContent = isPaypal ? "Monto bruto del enlace PayPal" : "Importe final para el cliente";
    $("#paymentPlan").innerHTML = c.installments === 2
      ? `<span>Forma de pago</span><strong>50% para comenzar: ${isPaypal ? money(c.grossUsd / 2, "USD") : money(c.finalConverted / 2, data.currency)}<br>50% antes de entregar: ${isPaypal ? money(c.grossUsd / 2, "USD") : money(c.finalConverted / 2, data.currency)}</strong>`
      : `<span>Forma de pago</span><strong>100% antes de comenzar: ${isPaypal ? money(c.grossUsd, "USD") : money(c.finalConverted, data.currency)}</strong>`;
    if (rateState.mode === "automatic" && rateState.status !== "ready") {
      $("#finalPrice").textContent = "—";
      $("#priceSubtitle").textContent = rateState.status === "pending" ? "Consultando tipo de cambio…" : "Falta confirmar el tipo de cambio";
      $("#paymentPlan").textContent = "El total en USD se mantiene; falta la conversión local.";
    }
  }

  function quoteNumber(number = settings.nextNumber) {
    return `JG3D-${new Date().getFullYear()}-${String(number).padStart(3, "0")}`;
  }

  function documentFooter(labels) {
    return `      <footer class="doc-footer">
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
              <svg class="doc-contact-icon doc-instagram" viewBox="0 0 24 24" fill="none" stroke="#e5232c" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle class="doc-instagram-dot" cx="17.4" cy="6.7" r="1" fill="#e5232c" stroke="none"></circle></svg>
              <span>@jg3d.works</span>
            </a>
            <a href="https://jg3dworks.com/whatsapp/" target="_blank" rel="noopener noreferrer">
              <svg class="doc-contact-icon doc-whatsapp" viewBox="0 0 24 24" fill="none" stroke="#e5232c" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.8a8.5 8.5 0 1 1 16.1-4.1Z"></path><path class="doc-whatsapp-phone" fill="#e5232c" stroke="none" d="M8.3 7.3c-.3 0-.6.1-.8.4-.4.4-.7 1-.7 1.6 0 1.5 1.3 3.4 2.9 4.9 1.5 1.4 3.6 2.4 4.9 2.4.6 0 1.3-.4 1.6-.9.2-.4.3-.9.2-1.1l-2.2-1.1c-.2-.1-.4-.1-.5.1l-.8 1c-.2.2-.4.2-.6.1-1.5-.6-2.7-1.7-3.3-3-.1-.2-.1-.4.1-.6l.6-.8c.2-.2.2-.4.1-.6l-.9-2.1c-.1-.2-.3-.3-.6-.3Z"></path></svg>
              <span>WhatsApp ↗</span>
            </a>
            <a href="https://jg3dworks.com/" target="_blank" rel="noopener noreferrer">
              <svg class="doc-contact-icon doc-website" viewBox="0 0 24 24" fill="none" stroke="#e5232c" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse><path d="M3 12h18M5 6.5h14M5 17.5h14" stroke-linecap="round"></path></svg>
              <span>jg3dworks.com ↗</span>
            </a>
          </div>
        </div>
        <p>${labels.footer}</p>
      </footer>`;
  }

  function buildDocument(record) {
    if (record.kind === 'receipt') return receiptsApp.document(record.receipt);
    const data = record.data || record;
    const number = record.number || quoteNumber();
    const createdAt = record.createdAt || new Date().toISOString();
    const documentLanguage = ["es", "en", "pt"].includes(data.language) ? data.language : "en";
    const labels = {
      es: {
        quote: "Presupuesto", client: "Cliente", country: "País", application: "Aplicación", delivery: "Plazo", validity: "Válido hasta", scope: "Alcance del trabajo", deliverables: "Entregables", conditions: "Condiciones", total: "Precio final", paypalTotal: "Total a pagar por PayPal", reference: "Referencia aproximada en reales", payment: "Forma de pago", revisions: "correcciones menores incluidas", normal: "Normal · 2-4 días", priority: "Prioridad · 1-2 días", urgent: "Urgente · mismo día / pocas horas", origin: "Argentina · Entrega digital mundial", contact: "Contacto directo", footer: "Diseño y modelado 3D automotriz"
      },
      en: {
        quote: "Quotation", client: "Client", country: "Country", application: "Application", delivery: "Delivery time", validity: "Valid until", scope: "Scope of work", deliverables: "Deliverables", conditions: "Terms", total: "Final price", paypalTotal: "Total payable via PayPal", reference: "Approximate reference in Brazilian reais", payment: "Payment terms", revisions: "minor revision rounds included", normal: "Standard · 2-4 days", priority: "Priority · 1-2 days", urgent: "Urgent · same day / a few hours", origin: "Argentina · Worldwide digital delivery", contact: "Direct contact", footer: "Automotive 3D design and modeling"
      },
      pt: {
        quote: "Orçamento", client: "Cliente", country: "País", application: "Aplicação", delivery: "Prazo", validity: "Válido até", scope: "Escopo do trabalho", deliverables: "Entregáveis", conditions: "Condições", total: "Preço final", paypalTotal: "Total a pagar via PayPal", reference: "Referência aproximada em reais", payment: "Forma de pagamento", revisions: "rodadas de ajustes menores incluídas", normal: "Normal · 2-4 dias", priority: "Prioridade · 1-2 dias", urgent: "Urgente · no mesmo dia / poucas horas", origin: "Argentina · Entrega digital mundial", contact: "Contato direto", footer: "Design e modelagem 3D automotiva"
      }
    }[documentLanguage];
    const urgencyText = data.urgencyPercent === 40 ? labels.urgent : data.urgencyPercent === 20 ? labels.priority : labels.normal;
    const paypalPayment = data.paymentMethod === "paypal";
    const brazilPaypal = data.country === "BR" && paypalPayment;
    const payableTotal = paypalPayment ? data.calculation.grossUsd : data.calculation.finalConverted;
    const payableCurrency = paypalPayment ? "USD" : data.currency;
    const payableText = paypalPayment ? moneyWithCode(payableTotal, "USD") : money(payableTotal, payableCurrency);
    const paymentText = data.calculation.installments === 2
      ? `50% (${paypalPayment ? moneyWithCode(payableTotal / 2, "USD") : money(payableTotal / 2, payableCurrency)}) + 50% (${paypalPayment ? moneyWithCode(payableTotal / 2, "USD") : money(payableTotal / 2, payableCurrency)})`
      : `100% ${payableText}`;
    const brlReference = brazilPaypal ? money(data.calculation.finalConverted, "BRL") : "";
    const scope = data.scope || (documentLanguage === "pt" ? "Modelagem 3D conforme as referências e medidas fornecidas pelo cliente." : documentLanguage === "en" ? "3D modeling according to the references and measurements supplied by the client." : "Modelado 3D según las referencias y medidas suministradas por el cliente.");
    const defaultCondition = documentLanguage === "pt" ? "Alterações fora do escopo e revisões adicionais serão orçadas separadamente." : documentLanguage === "en" ? "Changes outside the agreed scope and additional revisions will be quoted separately." : "Los cambios fuera del alcance y las revisiones adicionales se cotizarán por separado.";
    const countryText = translatedDocumentValue(documentCountries, data.country, documentLanguage);
    const applicationText = data.vehicle || translatedDocumentValue(documentNiches, data.niche, documentLanguage);
    const deliverables = (Array.isArray(data.deliverables) && data.deliverables.length ? data.deliverables : ["stl"])
      .map(item => translatedDocumentValue(documentDeliverables, item, documentLanguage));
    const paymentMethodText = translatedDocumentValue(documentPaymentMethods, data.paymentMethod, documentLanguage);

    return `
      <div class="doc-watermark" aria-hidden="true"><img src="${logoUrl}" alt=""></div>
      <header class="doc-header">
        <div class="doc-brand">
          <img class="doc-logo" src="${logoUrl}" alt="JG3D Works">
        </div>
        <div class="doc-meta"><span>${labels.quote}</span><h2>${escapeHtml(number)}</h2><p>${documentDateLabel(createdAt, documentLanguage)}</p></div>
      </header>
      <span class="doc-kicker">JG3D WORKS · ${labels.quote}</span>
      <h1 class="doc-title">${escapeHtml(data.projectTitle)}</h1>
      <div class="doc-grid">
        <div class="doc-field"><span>${labels.client}</span><strong>${escapeHtml(data.clientName)}</strong></div>
        <div class="doc-field"><span>${labels.country}</span><strong>${escapeHtml(countryText)}</strong></div>
        <div class="doc-field"><span>${labels.application}</span><strong>${escapeHtml(applicationText)}</strong></div>
        <div class="doc-field"><span>${labels.delivery}</span><strong>${urgencyText}</strong></div>
        <div class="doc-field"><span>${labels.validity}</span><strong>${documentDateLabel(data.validUntil, documentLanguage)}</strong></div>
        <div class="doc-field"><span>${labels.payment}</span><strong>${paymentText}</strong></div>
      </div>
      <section class="doc-section"><h3>${labels.scope}</h3><p>${escapeHtml(scope).replace(/\n/g, "<br>")}</p></section>
      <section class="doc-section"><h3>${labels.deliverables}</h3><ul>${deliverables.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section class="doc-section"><h3>${labels.conditions}</h3><ul><li>${data.revisions} ${labels.revisions}.</li><li>${escapeHtml(data.notes || defaultCondition)}</li><li>${documentLanguage === "pt" ? "A entrega dos arquivos finais é realizada após a confirmação do pagamento." : documentLanguage === "en" ? "Final files are delivered after payment confirmation." : "Los archivos finales se entregan después de confirmar el pago."}</li></ul></section>
      <div class="doc-total"><div><span>${paypalPayment ? labels.paypalTotal : labels.total}</span><strong>${payableText}</strong>${brazilPaypal ? `<small class="doc-price-reference">${labels.reference}: ${brlReference}</small>` : ""}</div><div class="doc-payment"><span>${labels.payment}</span><p>${paymentText}<br>${escapeHtml(paymentMethodText)}</p></div></div>
      ${documentFooter(labels)}`;
  }

  function openPreview(record = null) {
    if (!record && !quoteRateReady()) return;
    $("#quotePrintSheet")?.remove();
    currentPreview = record || { number: quoteNumber(), createdAt: new Date().toISOString(), data: getQuoteData() };
    $("#quoteDocument").innerHTML = buildDocument(currentPreview);
    $("#quoteDocument").classList.toggle('receipt-document', currentPreview.kind === 'receipt');
    $("#previewTitle").textContent = currentPreview.kind === 'receipt' ? 'Vista previa del recibo' : 'Vista previa del presupuesto';
    $("#copyWhatsapp").disabled = currentPreview.kind === 'receipt' && currentPreview.receipt.status === 'void';
    $("#previewModal").classList.add("open");
    $("#previewModal").setAttribute("aria-hidden", "false");
  }

  function closePreview() {
    $("#quotePrintSheet")?.remove();
    $("#previewModal").classList.remove("open");
    $("#previewModal").setAttribute("aria-hidden", "true");
  }

  function prepareQuotePrint() {
    if (!currentPreview) return null;
    if (currentPreview.kind === 'receipt') return receiptsApp.preparePrint(currentPreview.receipt);
    let sheet = $("#quotePrintSheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "quotePrintSheet";
      sheet.className = "quote-print-sheet";
      sheet.setAttribute("aria-hidden", "true");
      const content = document.createElement("article");
      content.className = "quote-document";
      content.lang = currentPreview.data?.language || currentPreview.language || "en";
      content.innerHTML = buildDocument(currentPreview);
      sheet.appendChild(content);
      document.body.appendChild(sheet);
    }
    fitQuotePrint(sheet);
    return sheet;
  }

  function fitQuotePrint(sheet) {
    if (sheet.classList.contains('receipt-print-root')) return;
    const content = $(".quote-document", sheet);
    content.style.transform = "none";
    const sheetStyle = getComputedStyle(sheet);
    const padding = parseFloat(sheetStyle.paddingTop);
    const availableHeight = sheet.clientHeight - padding - parseFloat(sheetStyle.paddingBottom) - 2;
    const availableWidth = sheet.clientWidth - parseFloat(sheetStyle.paddingLeft) - parseFloat(sheetStyle.paddingRight);
    // Measure the actual document, not the deliberately oversized decorative watermark.
    const naturalHeight = content.offsetHeight || content.scrollHeight;
    const naturalWidth = content.offsetWidth || content.scrollWidth;
    const scale = Math.min(1, availableHeight / naturalHeight, availableWidth / naturalWidth);
    content.style.transform = `scale(${scale})`;
    content.style.left = `${parseFloat(sheetStyle.paddingLeft) + availableWidth * (1 - scale) / 2}px`;
    sheet.dataset.scale = String(scale);
  }

  async function printQuote() {
    const button = $("#printQuote");
    button.disabled = true;
    try {
      const sheet = prepareQuotePrint();
      if (!sheet) return;
      if (document.fonts) await document.fonts.ready;
      await Promise.all($$("img", sheet).map(img => Promise.race([
        img.decode().catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 2500))
      ])));
      fitQuotePrint(sheet);
      if (Number(sheet.dataset.scale) < .75) {
        toast("El texto es extenso: se ajustará a una hoja A4. Revisá su legibilidad en la vista de impresión.");
      }
      window.print();
    } finally {
      button.disabled = false;
    }
  }

  function whatsappMessage(record) {
    if (record.kind === 'receipt') return receiptsApp.message(record.receipt);
    const data = record.data || record;
    const number = record.number || quoteNumber();
    const paypalPayment = data.paymentMethod === "paypal";
    const brazilPaypal = data.country === "BR" && paypalPayment;
    const total = paypalPayment ? moneyWithCode(data.calculation.grossUsd, "USD") : money(data.calculation.finalConverted, data.currency);
    const totalLabel = paypalPayment
      ? (data.language === "pt" ? "Total a pagar via PayPal" : data.language === "en" ? "Total payable via PayPal" : "Total a pagar por PayPal")
      : "Total";
    const referenceLine = brazilPaypal
      ? `\n${data.language === "pt" ? "Referência aproximada em reais" : data.language === "en" ? "Approximate reference in Brazilian reais" : "Referencia aproximada en reales"}: ${money(data.calculation.finalConverted, "BRL")}`
      : "";
    const messages = {
      es: `Hola ${data.clientName}, te envío el presupuesto ${number} correspondiente a “${data.projectTitle}”.\n\n${totalLabel}: ${total}${referenceLine}\nValidez: ${data.validDays} días.\n\nAdjunto el PDF con el alcance, los entregables y la forma de pago. Quedo atento a tu confirmación.`,
      en: `Hello ${data.clientName}, I’m sending you quotation ${number} for “${data.projectTitle}”.\n\n${totalLabel}: ${total}${referenceLine}\nValid for: ${data.validDays} days.\n\nThe attached PDF includes the scope, deliverables and payment terms. Please let me know if you would like to proceed.`,
      pt: `Olá ${data.clientName}, estou enviando o orçamento ${number} referente a “${data.projectTitle}”.\n\n${totalLabel}: ${total}${referenceLine}\nValidade: ${data.validDays} dias.\n\nO PDF anexo contém o escopo, os entregáveis e a forma de pagamento. Fico no aguardo da sua confirmação.`
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
    if (!quoteRateReady()) return;
    if (!$("#projectTitle").value.trim()) {
      $("#projectTitle").focus();
      toast("Ingresá un título para el proyecto.");
      return;
    }
    if (!$("#clientName").value.trim()) {
      $("#clientName").focus();
      toast("Ingresá el nombre o empresa del cliente.");
      return;
    }
    if ($("#paymentMethod").value === "paypal" && !(numeric($("#paypalGrossUsd").value) > 0)) {
      $("#paypalGrossUsd").focus();
      toast("Ingresá el monto bruto que vas a colocar en el enlace de PayPal.");
      return;
    }
    const data = getQuoteData();
    if (!linkQuoteClient(data)) return;
    const record = {
      id: uid("quote"),
      number: quoteNumber(),
      createdAt: new Date().toISOString(),
      status: "draft",
      data
    };
    quotes.unshift(record);
    settings.nextNumber += 1;
    persist();
    populateClientSelect();
    $("#quoteClient").value = data.clientId;
    $("#clientType").value = "existing";
    renderClients();
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
    $("#exchangeMode").value = "automatic";
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

  function setManualRate(keepValue = false) {
    rateGeneration += 1;
    const currency = $("#currency").value;
    $("#exchangeMode").value = "manual";
    if (!keepValue) $("#exchangeRate").value = currency === "USD" ? 1 : settings.rates[currency] || 1;
    rateState = { mode: "manual", status: "ready", metadata: { source: "Manual", updatedAt: new Date().toISOString() } };
    renderRateStatus("Cambio manual: revisá este valor antes de guardar. No se actualiza automáticamente.");
    updateCalculation();
  }

  function renderRateStatus(message) {
    $("#exchangeRateHelp").textContent = message;
    $(".exchange-control").dataset.state = rateState.status;
    $("#currencySuffix").textContent = $("#currency").value;
    $("#refreshExchangeRate").disabled = rateState.status === "pending";
    const blocked = rateState.mode === "automatic" && rateState.status !== "ready";
    $("#saveQuote").disabled = blocked;
    $("#printPreview").disabled = blocked;
  }

  function validRateRecord(record, currency) {
    const now = Date.now();
    return record && record.currency === currency && Number.isFinite(record.rate) && record.rate >= .0001 &&
      Number.isFinite(Date.parse(record.updatedAt)) && Date.parse(record.updatedAt) <= now + 300000 &&
      now - Date.parse(record.updatedAt) <= rateProviders[currency].maxAge &&
      Number.isFinite(Date.parse(record.fetchedAt)) && Date.parse(record.fetchedAt) <= now + 300000;
  }

  function cachedRateIsFresh(record, currency) {
    return validRateRecord(record, currency) && Date.now() - Date.parse(record.fetchedAt) < rateProviders[currency].ttl &&
      (!record.nextUpdateAt || Date.now() < record.nextUpdateAt ||
        (record.nextUpdateAt <= Date.parse(record.fetchedAt) && Date.now() - Date.parse(record.fetchedAt) < 300000));
  }

  async function fetchCurrencyRate(currency, force = false) {
    const cached = rateCache[currency];
    if (!force && cachedRateIsFresh(cached, currency)) return structuredClone(cached);
    if (rateRequests.has(currency)) return rateRequests.get(currency);
    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(rateProviders[currency].url, { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error(response.status === 429 ? "Límite de consultas del proveedor; intentá más tarde." : "El proveedor no respondió correctamente.");
        const data = await response.json();
        if (currency === "BRL" && (data.result !== "success" || data.base_code !== "USD")) throw new Error("Respuesta de cambio no válida.");
        if (currency === "ARS" && data.casa !== "blue") throw new Error("La respuesta no corresponde al dólar blue.");
        const record = {
          currency, rate: currency === "ARS" ? data.venta : data.rates?.BRL,
          source: rateProviders[currency].source,
          updatedAt: currency === "ARS" ? data.fechaActualizacion : new Date(data.time_last_update_unix * 1000).toISOString(),
          fetchedAt: new Date().toISOString(),
          nextUpdateAt: currency === "BRL" && Number.isFinite(data.time_next_update_unix) ? data.time_next_update_unix * 1000 : null
        };
        if (!validRateRecord(record, currency)) throw new Error("La cotización recibida es inválida o demasiado antigua.");
        rateCache[currency] = record;
        try { localStorage.setItem(STORAGE.fx, JSON.stringify(rateCache)); } catch { /* El cambio puede usarse sin caché. */ }
        return structuredClone(record);
      } finally { clearTimeout(timeout); }
    })();
    rateRequests.set(currency, request);
    try { return await request; } finally { rateRequests.delete(currency); }
  }

  async function setCurrencyRate(force = false) {
    // DOM change events are not a request to bypass the cache.
    force = force === true;
    const currency = $("#currency").value;
    if ($("#exchangeMode").value === "manual") { setManualRate(); return; }
    const generation = ++rateGeneration;
    rateState = { mode: "automatic", status: "pending", metadata: null };
    $("#exchangeRate").value = "";
    renderRateStatus("Consultando la última cotización disponible…");
    updateCalculation();
    try {
      const record = currency === "USD"
        ? { currency, rate: 1, source: "Moneda base USD", updatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString() }
        : await fetchCurrencyRate(currency, force);
      if (generation !== rateGeneration || currency !== $("#currency").value || $("#exchangeMode").value === "manual") return;
      $("#exchangeRate").value = record.rate;
      rateState = { mode: "automatic", status: "ready", metadata: record };
      const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(record.updatedAt));
      renderRateStatus(`${record.source}. Última cotización: ${date}. Se conserva la última disponible durante cierres de mercado.`);
    } catch (error) {
      if (generation !== rateGeneration) return;
      rateState = { mode: "automatic", status: "error", metadata: null };
      renderRateStatus(`No se pudo actualizar el cambio. ${error.message} Reintentá o elegí modo manual; no se usará un valor viejo como vigente.`);
    }
    updateCalculation();
  }

  function refreshRateIfNeeded() {
    if (!appStarted || rateState.mode !== "automatic" || rateState.status !== "ready") return;
    const currency = $("#currency").value;
    if (currency !== "USD" && !cachedRateIsFresh(rateState.metadata, currency)) setCurrencyRate();
  }

  function quoteRateReady() {
    const currency = $("#currency").value;
    if (rateState.mode === "automatic" && rateState.status === "ready" && currency !== "USD" && !cachedRateIsFresh(rateState.metadata, currency)) {
      setCurrencyRate();
      toast("El cambio necesita actualizarse. Esperá la consulta y volvé a guardar o generar el PDF.");
      return false;
    }
    if (rateState.mode === "automatic" && rateState.status !== "ready") {
      toast("Actualizá el tipo de cambio o ingresalo en modo manual antes de guardar o generar el PDF.");
      return false;
    }
    if (!Number.isFinite(Number($("#exchangeRate").value)) || Number($("#exchangeRate").value) < .0001) {
      $("#exchangeRate").focus();
      toast("Ingresá un tipo de cambio positivo válido.");
      return false;
    }
    return true;
  }

  function populateClientSelect() {
    const select = $("#quoteClient");
    const previous = select.value;
    select.innerHTML = '<option value="">Nuevo cliente / ingresar datos</option>' + clients.map(client => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join("");
    if (clients.some(client => client.id === previous)) select.value = previous;
    const historySelect = $("#historyClientFilter");
    const previousHistory = historySelect.value;
    historySelect.innerHTML = '<option value="all">Todos los clientes</option>' + clients.map(client => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join("");
    if (clients.some(client => client.id === previousHistory)) historySelect.value = previousHistory;
  }

  function selectClient() {
    const client = clients.find(item => item.id === $("#quoteClient").value);
    if (!client) {
      $("#clientType").value = "new";
      $("#clientName").value = "";
      $("#clientPhone").value = "";
      $("#clientEmail").value = "";
      return;
    }
    $("#clientType").value = "existing";
    $("#clientName").value = client.name;
    $("#clientPhone").value = client.phone || "";
    $("#clientEmail").value = client.email || "";
    $("#country").value = client.country;
    $("#language").value = client.language;
    $("#currency").value = client.currency;
    setCurrencyRate();
  }

  function matchingClients(name, country) {
    const normalized = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    return clients.filter(client => client.country === country &&
      String(client.name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() === normalized);
  }

  function createClientFromQuote(data, createdAt = new Date().toISOString()) {
    const client = {
      id: uid("client"), createdAt, name: data.clientName.trim(),
      country: data.country, language: data.language, currency: data.currency,
      phone: data.clientPhone || "", email: data.clientEmail || "", notes: ""
    };
    clients.unshift(client);
    return client;
  }

  function linkQuoteClient(data) {
    const selected = data.clientType === "existing" && clients.find(client => client.id === data.clientId);
    const matches = selected ? [] : matchingClients(data.clientName, data.country);
    let client = selected || (matches.length === 1 ? matches[0] : null);
    if (!client && data.clientType === "existing") {
      toast("Seleccioná el cliente guardado para vincular su presupuesto.");
      $("#quoteClient").focus();
      return false;
    }
    if (!client && matches.length > 1) {
      toast("Hay varios clientes con ese nombre. Seleccioná la ficha correcta en Cliente.");
      $("#quoteClient").focus();
      return false;
    }
    if (!client) client = createClientFromQuote(data);
    data.clientId = client.id;
    return true;
  }

  function restoreQuoteClientLinks() {
    let repaired = 0;
    for (const record of quotes) {
      const data = record.data;
      // Keep intentional deletions and explicit links intact; never guess among duplicate names.
      if (!data || data.clientId || !data.clientName?.trim() || data.clientName === "Cliente") continue;
      const matches = matchingClients(data.clientName, data.country);
      let client = matches.length === 1 ? matches[0] : null;
      if (!client && matches.length === 0 && data.clientType === "new") {
        client = createClientFromQuote(data, record.createdAt);
      }
      if (client) {
        data.clientId = client.id;
        repaired += 1;
      }
    }
    return repaired;
  }

  function openClientHistory(id) {
    if (!clients.some(client => client.id === id)) return;
    $("#historyClientFilter").value = id;
    $("#quoteSearch").value = "";
    $("#statusFilter").value = "all";
    navigate("history");
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
    if (!client.name) {
      $("#newClientName").focus();
      toast("Ingresá el nombre del cliente.");
      return;
    }
    clients.unshift(client);
    restoreQuoteClientLinks();
    persist();
    $("#clientForm").reset();
    $("#clientFormCard").classList.add("hidden");
    populateClientSelect();
    renderClients();
    renderDashboard();
    toast("Cliente guardado.");
  }

  function deleteClient(id) {
    if (!confirm("¿Eliminar este cliente? Sus presupuestos se conservarán en el historial general.")) return;
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
        <td><button class="row-button client-history-button" type="button" data-client-history="${client.id}" aria-label="Ver ${quoteCount} presupuestos de ${escapeHtml(client.name)}">${quoteCount} · Ver pedidos</button></td>
        <td><div class="row-actions"><button class="row-button" type="button" data-new-receipt-client="${escapeHtml(client.id)}">Crear recibo</button><button class="row-button" type="button" data-client-receipts="${escapeHtml(client.id)}">Ver pagos</button><button class="row-button danger" type="button" data-delete-client="${client.id}" aria-label="Eliminar cliente">×</button></div></td>
      </tr>`;
    }).join("");
    $("#clientCount").textContent = `${filtered.length} ${filtered.length === 1 ? "cliente" : "clientes"}`;
    $("#clientsEmpty").classList.toggle("hidden", filtered.length > 0);
    $(".responsive-table", $("#view-clients")).classList.toggle("hidden", filtered.length === 0);
  }

  function renderQuotes() {
    const query = $("#quoteSearch").value.trim().toLowerCase();
    const filter = $("#statusFilter").value;
    const clientFilter = $("#historyClientFilter").value;
    const filtered = quotes.filter(record => {
      const matchesText = [record.number, record.data.projectTitle, record.data.clientName].join(" ").toLowerCase().includes(query);
      return matchesText && (filter === "all" || record.status === filter) &&
        (clientFilter === "all" || record.data.clientId === clientFilter);
    });
    $("#quotesTable").innerHTML = filtered.map(record => `<tr>
      <td><strong>${record.number}</strong></td>
      <td><strong>${escapeHtml(record.data.projectTitle)}</strong><small>${escapeHtml(record.data.vehicle || translatedDocumentValue(documentNiches, record.data.niche, "es"))}</small></td>
      <td>${escapeHtml(record.data.clientName)}</td>
      <td><strong>${money(record.data.calculation.finalConverted, record.data.currency)}</strong></td>
      <td><select data-status="${record.id}">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${record.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td>${dateLabel(record.createdAt)}</td>
      <td><div class="row-actions"><button class="row-button" type="button" data-preview-quote="${record.id}" title="Vista previa">PDF</button><button class="row-button" type="button" data-receipt-quote="${escapeHtml(record.id)}">Crear recibo</button><button class="row-button danger" type="button" data-delete-quote="${record.id}" title="Eliminar">×</button></div></td>
    </tr>`).join("");
    $("#quotesEmpty").classList.toggle("hidden", filtered.length > 0);
    $(".responsive-table", $("#view-history")).classList.toggle("hidden", filtered.length === 0);
  }

  async function updateQuoteStatus(id, status) {
    const record = quotes.find(item => item.id === id);
    if (!record) return;
    const previousStatus = record.status;
    record.status = status;
    persist();
    renderDashboard();
    toast(`Estado actualizado: ${statusLabels[status]}.`);
    if (status === "delivered" && previousStatus !== "delivered") {
      try {
        if (!receiptsApp?.createFromQuote) throw new Error("El módulo de recibos no está disponible.");
        const result = await receiptsApp.createFromQuote(record);
        toast(result.created
          ? `Ingreso automático creado: ${result.record.number}.`
          : `El ingreso de ${result.record.number} ya existía; no se duplicó.`);
      } catch (error) {
        console.error("Automatic delivered-income creation failed", error);
        toast("Presupuesto entregado. No se pudo crear el ingreso automático; abrí Recibos e ingresos para reintentarlo.");
      }
    }
  }

  function deleteQuote(id) {
    if (!confirm("¿Eliminar este presupuesto?")) return;
    quotes = quotes.filter(record => record.id !== id);
    persist();
    renderQuotes();
    renderClients();
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
    cultsApp?.renderDashboard();
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
    $("#exchangeMode").addEventListener("change", () => {
      if ($("#exchangeMode").value === "manual") setManualRate(Boolean($("#exchangeRate").value));
      else setCurrencyRate();
    });
    $("#exchangeRate").addEventListener("input", () => setManualRate(true));
    $("#refreshExchangeRate").addEventListener("click", () => {
      $("#exchangeMode").value = "automatic";
      setCurrencyRate(true);
    });
    setInterval(refreshRateIfNeeded, 60000);
    $("#quoteClient").addEventListener("change", selectClient);
    $("#clientType").addEventListener("change", () => {
      if ($("#clientType").value === "new" && $("#quoteClient").value) {
        $("#quoteClient").value = "";
        selectClient();
      }
    });
    $("#printPreview").addEventListener("click", () => openPreview());
    $("#closePreview").addEventListener("click", closePreview);
    $("#previewModal").addEventListener("click", event => { if (event.target === $("#previewModal")) closePreview(); });
    $("#printQuote").addEventListener("click", printQuote);
    window.addEventListener("beforeprint", prepareQuotePrint);
    window.addEventListener("afterprint", () => $("#quotePrintSheet")?.remove());
    $("#copyWhatsapp").addEventListener("click", copyWhatsapp);
    $("#newClientButton").addEventListener("click", () => $("#clientFormCard").classList.remove("hidden"));
    $("#cancelClient").addEventListener("click", () => $("#clientFormCard").classList.add("hidden"));
    $("#clientForm").addEventListener("submit", saveClient);
    $("#clientSearch").addEventListener("input", renderClients);
    $("#quoteSearch").addEventListener("input", renderQuotes);
    $("#statusFilter").addEventListener("change", renderQuotes);
    $("#historyClientFilter").addEventListener("change", renderQuotes);
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
      const newReceiptClient = event.target.closest('[data-new-receipt-client]');
      const clientReceipts = event.target.closest('[data-client-receipts]');
      const quoteReceipt = event.target.closest('[data-receipt-quote]');
      if (newReceiptClient) receiptsApp?.openNew(newReceiptClient.dataset.newReceiptClient);
      if (clientReceipts) receiptsApp?.history(clientReceipts.dataset.clientReceipts);
      if (quoteReceipt) receiptsApp?.openNew('', quoteReceipt.dataset.receiptQuote);
      const deleteClientButton = event.target.closest("[data-delete-client]");
      const clientHistoryButton = event.target.closest("[data-client-history]");
      const previewQuoteButton = event.target.closest("[data-preview-quote]");
      const deleteQuoteButton = event.target.closest("[data-delete-quote]");
      if (deleteClientButton) deleteClient(deleteClientButton.dataset.deleteClient);
      if (clientHistoryButton) openClientHistory(clientHistoryButton.dataset.clientHistory);
      if (previewQuoteButton) openPreview(quotes.find(record => record.id === previewQuoteButton.dataset.previewQuote));
      if (deleteQuoteButton) deleteQuote(deleteQuoteButton.dataset.deleteQuote);
    });
    document.addEventListener("change", event => {
      if (event.target.matches("[data-status]")) updateQuoteStatus(event.target.dataset.status, event.target.value);
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closePreview(); });
  }

  async function init() {
    $("#loginForm").addEventListener("submit", signIn);
    $("#logoutButton").addEventListener("click", signOut);

    if (!cloudClient) {
      showAuth("No se pudo cargar la conexión segura. Recargá la página.", "error");
      return;
    }

    setAuthMessage("Comprobando sesión…", "loading");
    const { data, error } = await cloudClient.auth.getSession();
    if (error) {
      showAuth("No se pudo verificar la sesión. Intentá nuevamente.", "error");
      return;
    }

    if (data.session) {
      await startAuthenticatedApp(data.session);
    } else {
      showAuth();
    }
  }

  init();
})();
