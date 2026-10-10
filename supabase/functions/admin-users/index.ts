// Supabase Edge Function: admin-users
//
// Account actions that need the service-role key, called by the admin
// dashboard's "Users and roles" screen. Currently one action:
//
//   { "action": "reset_mfa", "user_id": "<uuid>" }
//     Removes every 2-step verification (authenticator) factor from that
//     account, for someone who has lost their phone. They then sign in
//     with just their password and can set it up again.
//
// Security: the caller must be signed in, active and role = 'admin'
// (checked against public.profiles with the caller's own token). The
// service-role key never leaves Supabase. Each reset is written to the
// audit log.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
// "Via editor" -> name it exactly `admin-users` -> paste this file ->
// Deploy. Keep "Verify JWT" on.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://admin.harleygarrison.co.uk",
  "https://house-of-guards.onata-1230.workers.dev",
  "http://localhost:4321",
]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://admin.harleygarrison.co.uk",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json({ error: "Not signed in" }, 401, origin);
  const { data: me } = await caller.from("profiles").select("role, active, full_name, email").eq("id", userData.user.id).maybeSingle();
  if (!me || me.role !== "admin" || !me.active) return json({ error: "Admins only" }, 403, origin);

  let body: { action?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400, origin);
  }
  if (body.action !== "reset_mfa") return json({ error: "Unknown action" }, 400, origin);
  const userId = String(body.user_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Invalid user" }, 400, origin);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
  if (listError) return json({ error: "Couldn't read that account's 2-step settings" }, 500, origin);

  let removed = 0;
  for (const f of factors?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (!error) removed++;
  }

  await admin.from("audit_log").insert({
    actor_id: userData.user.id,
    actor_name: me.full_name || me.email,
    action: "reset_mfa",
    entity: "auth.users",
    entity_id: userId,
    summary: `${removed} authenticator(s) removed`,
  });

  return json({ removed }, 200, origin);
});
