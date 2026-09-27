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
  | "classic_demo_skipped";

interface TrackOpts {
  roomCode?: string;
  metadata?: Record<string, unknown>;
}

export function trackEvent(eventType: AnalyticsEventType, opts: TrackOpts = {}): void {
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
