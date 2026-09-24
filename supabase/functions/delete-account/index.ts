// ============================================================================
// delete-account — removes the signed-in player's account and all its data.
// Identity comes only from the caller's session token, never from the body.
// Also handles `reminder_off`, which unsubscribes the email in ActiveCampaign.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function acContactId(email: string): Promise<string | null> {
  const base = (Deno.env.get("AC_API_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("AC_API_KEY") ?? "";
  if (!base || !key) return null;
  const res = await fetch(`${base}/api/3/contacts?email=${encodeURIComponent(email)}`, {
    headers: { "Api-Token": key },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.contacts?.[0]?.id ? String(body.contacts[0].id) : null;
}

async function acUnsubscribe(email: string): Promise<boolean> {
  const base = (Deno.env.get("AC_API_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("AC_API_KEY") ?? "";
  const listId = Deno.env.get("AC_LIST_ID") ?? "";
  const id = await acContactId(email);
  if (!id || !listId) return false;
  const res = await fetch(`${base}/api/3/contactLists`, {
    method: "POST",
    headers: { "Api-Token": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contactList: { list: Number(listId), contact: Number(id), status: 2 } }),
  });
  return res.ok;
}

async function acDelete(email: string): Promise<boolean> {
  const base = (Deno.env.get("AC_API_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("AC_API_KEY") ?? "";
  const id = await acContactId(email);
  if (!id) return false;
  const res = await fetch(`${base}/api/3/contacts/${id}`, {
    method: "DELETE",
    headers: { "Api-Token": key },
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.email) return json({ error: "Not signed in" }, 401);
  const email = user.email.toLowerCase();

  let action = "delete";
  try {
    const body = await req.json();
    if (body?.action === "reminder_off") action = "reminder_off";
  } catch {
    // default action
  }

  if (action === "reminder_off") {
    let ok = false;
    try {
      ok = await acUnsubscribe(email);
    } catch (err) {
      console.error("delete-account: unsubscribe threw", err);
    }
    await admin.from("daily_subscribers").delete().eq("email", email);
    return json({ ok: true, unsubscribed: ok });
  }

  const { error: wipeError } = await admin.rpc("delete_account_data", {
    p_user_id: user.id,
    p_email: email,
  });
  if (wipeError) {
    console.error("delete-account: wipe failed", wipeError.message);
    return json({ error: "Could not delete account" }, 500);
  }

  try {
    await acDelete(email);
  } catch (err) {
    console.error("delete-account: AC delete threw", err);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("delete-account: auth delete failed", authError.message);
    return json({ error: "Could not delete account" }, 500);
  }
  return json({ ok: true });
});
