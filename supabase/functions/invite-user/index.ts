// Supabase Edge Function: invite-user
//
// Called by the admin dashboard to create an officer (or client) account
// and return a one-time invite LINK the admin can send by WhatsApp/text.
// No email is sent, so this works without custom SMTP.
//
// Security:
//  * The caller must be signed in, active and role = 'admin' (checked
//    against public.profiles with the caller's own token).
//  * The service-role key never leaves Supabase: Edge Functions receive it
//    as an environment variable automatically.
//  * The returned link carries a hashed token in the URL FRAGMENT and the
//    portal only redeems it when the person presses "Activate account", so
//    messaging-app link previews (which fetch URLs) cannot use it up.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
// "Via editor" -> name it exactly `invite-user` -> paste this file -> Deploy.

import { createClient } from "npm:@supabase/supabase-js@2";

const PORTAL_URL: Record<string, string> = {
  guard: "https://officers.harleygarrison.co.uk/",
  client: "https://portal.harleygarrison.co.uk/",
};

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

  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  if (!userData?.user) return json({ error: "Not signed in" }, 401, origin);

  const { data: me } = await caller.from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle();
  if (!me || me.role !== "admin" || !me.active) return json({ error: "Admins only" }, 403, origin);

  let body: { email?: string; full_name?: string; role?: string; client_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400, origin);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim().slice(0, 120);
  const role = body.role === "client" ? "client" : "guard";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400, origin);
  if (!fullName) return json({ error: "Enter the person's full name" }, 400, origin);
  if (role === "client" && !body.client_id) return json({ error: "Choose which client this person belongs to" }, 400, origin);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName }, redirectTo: PORTAL_URL[role] },
  });
  if (linkError || !link?.user) {
    const exists = /already/i.test(linkError?.message ?? "");
    return json({ error: exists ? "An account with that email already exists" : "The invite couldn't be created" }, exists ? 409 : 500, origin);
  }

  const userId = link.user.id;
  const { error: profileError } = await admin.from("profiles").update({ role, full_name: fullName }).eq("id", userId);
  if (profileError) return json({ error: "Account created but its profile couldn't be set up" }, 500, origin);

  if (role === "client") {
    const { error: memberError } = await admin.from("client_users").insert({ client_id: body.client_id, user_id: userId });
    if (memberError) return json({ error: "Account created but couldn't be linked to the client" }, 500, origin);
  }

  const tokenHash = link.properties?.hashed_token;
  const inviteUrl = `${PORTAL_URL[role]}#/activate?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;
  return json({ user_id: userId, invite_url: inviteUrl }, 200, origin);
});
