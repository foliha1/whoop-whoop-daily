import { getSupabase } from "@/lib/db";
import { isValidEmail } from "@/lib/dailySubscribe";
import { markUpdatesSubscription } from "@/lib/updatesSubscriptionStatus";

/** Joins the general Whoop! Whoop! updates list, never the Daily reminder list. */
export async function subscribeToUpdates(
  email: string,
  source: "preorder",
): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return false;
  try {
    const { data, error } = await (await getSupabase()).functions.invoke("ac-subscribe", {
      body: { email: clean, list: "updates", source },
    });
    if (error || (data as { ok?: boolean } | null)?.ok !== true) return false;
    markUpdatesSubscription();
    if ((data as { syncedToAc?: boolean }).syncedToAc === true) {
      window.__lovableEvents?.track?.("project.updates_list_added", { via: source });
    }
    return true;
  } catch {
    return false;
  }
}
