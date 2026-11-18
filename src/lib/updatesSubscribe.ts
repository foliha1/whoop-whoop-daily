import { supabase } from "@/integrations/supabase/client";
import { isValidEmail } from "@/lib/dailySubscribe";

/** Joins the general Whoop! Whoop! updates list, never the Daily reminder list. */
export async function subscribeToUpdates(
  email: string,
  source: "preorder",
): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return false;
  try {
    const { data, error } = await supabase.functions.invoke("ac-subscribe", {
      body: { email: clean, list: "updates", source },
    });
    if (error || (data as { ok?: boolean } | null)?.ok !== true) return false;
    if ((data as { syncedToAc?: boolean }).syncedToAc === true) {
      window.__lovableEvents?.track?.("project.updates_list_added", { via: source });
    }
    return true;
  } catch {
    return false;
  }
}
