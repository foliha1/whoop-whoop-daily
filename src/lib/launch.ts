// ============================================================================
// launch.ts — reads the one launch switch and answers "is the umbrella on?"
//
// Three answers, in order:
//   1. LAUNCHED (build-time, from src/launch.config.ts): true for everyone
//      after launch day.
//   2. Admin preview: a signed-in user on the admin allowlist gets the ON
//      version on the live site. Resolved once per session via the
//      can_preview_umbrella() RPC; signed-out visitors never call it and
//      always get OFF. A failed check stays OFF.
//   3. Otherwise OFF.
//
// Crawlers don't run JavaScript and can't sign in, so link previews and
// search engines only ever see the static OFF pages.
//
// Cleanup after launch: delete this file and src/launch.config.ts, remove
// every useUmbrella()/umbrellaOn() gate and its OFF branch, and drop the
// can_preview_umbrella() function.
// ============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LAUNCH_CONFIG } from "@/launch.config";

/** Build-time value. True only in a build made after launch day. */
export const LAUNCHED: boolean = LAUNCH_CONFIG.launched;

let preview = false;
let checked = false;

/** Resolves the signed-in admin preview once per session. Safe to repeat. */
export async function initUmbrellaPreview(): Promise<void> {
  if (LAUNCHED || checked) return;
  checked = true;
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.rpc("can_preview_umbrella");
    if (!error && data === true) preview = true;
  } catch {
    // Stays OFF.
  }
}

/** Synchronous read for non-React code (account sync, solo names). */
export function umbrellaOn(): boolean {
  return LAUNCHED || preview;
}

/** React hook: OFF until the admin preview resolves, then re-renders. */
export function useUmbrella(): boolean {
  const [on, setOn] = useState(umbrellaOn());
  useEffect(() => {
    let live = true;
    void initUmbrellaPreview().then(() => {
      if (live) setOn(umbrellaOn());
    });
    const authSubscription = supabase.auth?.onAuthStateChange?.((event) => {
      // Only a real identity change re-resolves the preview; the initial
      // session restore and token refreshes must not wipe it.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      checked = false;
      preview = false;
      setOn(false);
      void initUmbrellaPreview().then(() => {
        if (live) setOn(umbrellaOn());
      });
    });
    return () => {
      live = false;
      authSubscription?.data.subscription.unsubscribe();
    };
  }, []);
  return on;
}

/** Test-only override. Pass null to restore real behaviour. */
export function setUmbrellaPreviewForTests(on: boolean | null): void {
  if (on === null) {
    preview = false;
    checked = false;
  } else {
    preview = on;
    checked = true;
  }
}
