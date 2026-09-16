import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const query = `
  query JG3DSales($limit: Int!, $offset: Int!) {
    myself {
      salesBatch(sort: BY_CREATION, direction: DESC, limit: $limit, offset: $offset) {
        total
        results {
          id
          createdAt
          payedOutAt
          commissionPercent
          vatPercent
          totalExcludingTax { value currency }
          commission { value currency }
          income { value currency }
          totalTaxed { value currency }
          vat { value currency }
          orderCountry { code name flag }
          buyer { nick }
          creation { name url }
        }
      }
    }
  }
`;

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("Cults devolvió un importe inválido.");
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const authorization = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const cultsUsername = Deno.env.get("CULTS_USERNAME") || "";
  const cultsApiKey = Deno.env.get("CULTS_API_KEY") || "";
  const startedAt = new Date().toISOString();
  let ownerId = "";

  try {
    if (!authorization.startsWith("Bearer ")) throw new Error("Sesión inválida.");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("La función no tiene configurada la conexión con Supabase.");
    if (!cultsUsername || !cultsApiKey) throw new Error("Faltan CULTS_USERNAME o CULTS_API_KEY en los secretos de Supabase.");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("No se pudo verificar la sesión.");
    ownerId = userData.user.id;

    const writer = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await writer.from("cults_sync_state").upsert({ user_id: ownerId, last_started_at: startedAt, last_error: "" }, { onConflict: "user_id" });

    const pageSize = 100;
    let offset = 0;
    let remoteTotal = 0;
    let processed = 0;

    do {
      const response = await fetch("https://cults3d.com/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${cultsUsername}:${cultsApiKey}`)}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "JG3D-Cotizador/1.0",
        },
        body: JSON.stringify({ query, variables: { limit: pageSize, offset } }),
      });
      if (!response.ok) throw new Error(`Cults respondió con estado ${response.status}.`);
      const payload = await response.json();
      if (payload.errors?.length) throw new Error(payload.errors.map((item: { message?: string }) => item.message || "Error GraphQL").join(" · "));
      const batch = payload.data?.myself?.salesBatch;
      if (!batch || !Array.isArray(batch.results)) throw new Error("Cults no devolvió la lista de ventas esperada.");
      remoteTotal = Number(batch.total || 0);

      const rows = batch.results.map((sale: any) => {
        if (!sale?.id || !sale?.createdAt) throw new Error("Cults devolvió una venta sin identificador o fecha.");
        const currency = String(sale.income?.currency || sale.totalExcludingTax?.currency || "EUR").toUpperCase();
        return {
          user_id: ownerId,
          external_id: String(sale.id),
          sold_at: String(sale.createdAt),
          paid_out_at: sale.payedOutAt ? String(sale.payedOutAt) : null,
          buyer_nick: String(sale.buyer?.nick || ""),
          product_name: String(sale.creation?.name || "Producto de Cults"),
          product_url: String(sale.creation?.url || ""),
          country_code: String(sale.orderCountry?.code || "").toUpperCase(),
          country_name: String(sale.orderCountry?.name || ""),
          country_flag: String(sale.orderCountry?.flag || ""),
          currency,
          gross_excluding_tax: numberValue(sale.totalExcludingTax?.value),
          commission: numberValue(sale.commission?.value),
          net_income: numberValue(sale.income?.value),
          total_taxed: numberValue(sale.totalTaxed?.value),
          vat: numberValue(sale.vat?.value),
          commission_percent: numberValue(sale.commissionPercent),
          vat_percent: numberValue(sale.vatPercent),
          is_active: true,
          last_seen_at: startedAt,
          synced_at: new Date().toISOString(),
        };
      });

      if (rows.length) {
        const { error: upsertError } = await writer.from("cults_sales").upsert(rows, { onConflict: "user_id,external_id" });
        if (upsertError) throw upsertError;
      }
      processed += rows.length;
      offset += rows.length;
      if (!rows.length) break;
    } while (offset < remoteTotal && offset < 50000);

    if (offset < remoteTotal) throw new Error("La sincronización se detuvo antes de descargar todas las ventas.");

    const { error: staleError } = await writer.from("cults_sales").update({ is_active: false }).eq("user_id", ownerId).lt("last_seen_at", startedAt);
    if (staleError) throw staleError;
    const { count, error: countError } = await writer.from("cults_sales").select("external_id", { count: "exact", head: true }).eq("user_id", ownerId).eq("is_active", true);
    if (countError) throw countError;
    const completedAt = new Date().toISOString();
    const { error: stateError } = await writer.from("cults_sync_state").upsert({
      user_id: ownerId,
      last_started_at: startedAt,
      last_completed_at: completedAt,
      remote_total: remoteTotal,
      active_total: count || 0,
      last_error: "",
    }, { onConflict: "user_id" });
    if (stateError) throw stateError;

    return new Response(JSON.stringify({ ok: true, processed, total: remoteTotal, active: count || 0, completedAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo sincronizar Cults.";
    if (ownerId && supabaseUrl && serviceRoleKey) {
      const writer = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await writer.from("cults_sync_state").upsert({ user_id: ownerId, last_started_at: startedAt, last_error: message.slice(0, 500) }, { onConflict: "user_id" });
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
