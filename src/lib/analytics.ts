import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";

export type AnalyticsEventType =
  | "invite_link_clicked"
  | "room_created"
  | "room_joined"
  | "game_started"
  | "game_completed"
  | "room_replayed"
  | "email_captured"
  | "mp_howto_opened"
  | "mp_howto_finished"
  | "mp_howto_skipped";

interface TrackOpts {
  roomCode?: string;
  metadata?: Record<string, unknown>;
}

export function trackEvent(eventType: AnalyticsEventType, opts: TrackOpts = {}): void {
  // Fire and forget — never block, never throw.
  try {
    const payload = {
      event_type: eventType,
      room_code: opts.roomCode ?? null,
      visitor_id: getVisitorId(),
      metadata: (opts.metadata ?? {}) as Record<string, unknown>,
    };
    void supabase
      .from("analytics_events")
      .insert(payload as never)
      .then(({ error }) => {
        if (error) console.warn("[analytics] insert failed", error.message);
      });
  } catch (e) {
    console.warn("[analytics] threw synchronously", e);
  }
}
