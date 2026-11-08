import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ProviderError, syncDailyNumber } from "./sync.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // Reuse the existing server-only scheduled-job credential, never an anon key or client session.
  const expected = Deno.env.get("BACKUP_CRON_SECRET");
  if (!expected || req.headers.get("x-backup-secret") !== expected) return json({ error: "Unauthorized" }, 401);
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed;
    if (Object.keys(body).some((key) => key !== "time" && key !== "dryRun") ||
      (body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
      (body.time !== undefined && (typeof body.time !== "string" || body.time.length > 100))) throw new Error();
  } catch { return json({ error: "Invalid request body" }, 400); }
  try {
    const result = await syncDailyNumber({ base: Deno.env.get("AC_API_URL") ?? "",
      key: Deno.env.get("AC_API_KEY") ?? "", listId: Deno.env.get("AC_LIST_ID") ?? "", dryRun: body.dryRun === true });
    console.log("ac-daily-sync", JSON.stringify(result)); // Counts only; no contact addresses or credentials.
    return json(result);
  } catch (error) {
    if (error instanceof ProviderError) {
      console.error("ac-daily-sync provider failure", error.status, error.details);
      return json({ error: "ActiveCampaign request failed", status: error.status, details: error.details }, error.status);
    }
    console.error("ac-daily-sync failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: error instanceof Error ? error.message : "Sync failed" }, 500);
  }
});