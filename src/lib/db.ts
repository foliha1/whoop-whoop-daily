// ============================================================================
// db.ts — the one way app code reaches the database client.
//
// The Supabase SDK is large (~60 KB gzip). Importing the client statically put
// it on the critical path of every page, so the first paint waited for it.
// getSupabase() loads it on first use instead; every caller shares one load.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let clientPromise: Promise<SupabaseClient<Database>> | null = null;

export function getSupabase(): Promise<SupabaseClient<Database>> {
  if (!clientPromise) {
    clientPromise = import("@/integrations/supabase/client").then((m) => m.supabase);
    // A failed chunk load must not poison every later call.
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

/** Warm the client after first paint so the first real call doesn't wait. */
export function preloadSupabase(): void {
  void getSupabase().catch(() => undefined);
}
