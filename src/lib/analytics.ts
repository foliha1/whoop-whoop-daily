import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";

// Must match the allow-list in the log_analytics_events server function;
// any other type is dropped quietly on the server.
export type AnalyticsEventType =
  | "invite_link_clicked"
  | "room_created"
  | "room_joined"
  | "game_started"
  | "game_completed"
  // Classic How to Play (scripted demo).
  | "classic_demo_opened"
  | "classic_demo_finished"
  | "classic_demo_skipped"
  // Umbrella Home. "peeps" is the internal name for the Together tile.
  | "home_viewed"
  | "home_daily_tapped"
  | "home_solo_tapped"
  | "home_peeps_tapped"
  // About card-waterfall Easter egg; the server keeps one per player.
  | "easter_egg_found"
  // /rules loads; qr marks a scan of the printed bag card.
  | "rules_view"
  | "rules_qr_scan"
  | "preorder_view"
  | "preorder_click";

interface TrackOpts {
  roomCode?: string;
  metadata?: Record<string, unknown>;
}

export function trackEvent(eventType: AnalyticsEventType, opts: TrackOpts = {}): void {
  // Pre-order conversion reports count only the public site, never development
  // or preview loads. Other established usage reports retain their behavior.
  if (eventType === "preorder_view" || eventType === "preorder_click") {
    const publicHosts = ["whoop-whoop.com", "www.whoop-whoop.com", "whoop-whoop.lovable.app"];
    if (import.meta.env.DEV || !publicHosts.includes(window.location.hostname)) return;
  }
  // Fire and forget — never block, never throw.
  try {
    const event = {
      event_type: eventType,
      room_code: opts.roomCode ?? null,
      metadata: opts.metadata ?? {},
    };
    void supabase
      .rpc("log_analytics_events", {
        p_visitor_id: getVisitorId(),
        p_events: [event] as never,
      })
      .then(({ error }) => {
        if (error) console.warn("[analytics] log failed", error.message);
      });
  } catch (e) {
    console.warn("[analytics] threw synchronously", e);
  }
}
