CREATE OR REPLACE FUNCTION public.log_daily_events(p_visitor_id text, p_events jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY[
    'ready_viewed','howto_opened','howto_skipped','howto_finished','run_started',
    'round_solved','round_failed','peek_used','run_finished','run_abandoned',
    'share_clicked','subscribe_shown','subscribe_submitted',
    'invite_sent','invite_landed',
    'announcement_shown','announcement_primary_tapped','announcement_dismissed'
  ];
  c_per_visitor_per_day constant integer := 400;
  c_per_ip_per_day constant integer := 2000;
  v_written integer := 0;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_ip text;
  e jsonb;
  v_event text;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN 0; END IF;
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN RETURN 0; END IF;
  v_ip := public.request_ip();
  FOR e IN SELECT * FROM jsonb_array_elements(p_events) LIMIT 50 LOOP
    v_event := nullif(btrim(coalesce(e->>'event', '')), '');
    IF v_event IS NULL OR NOT (v_event = ANY (v_allowed)) THEN CONTINUE; END IF;
    IF NOT public.rl_hit('daily_events_visitor', v_visitor, c_per_visitor_per_day) THEN EXIT; END IF;
    IF NOT public.rl_hit('daily_events_ip', v_ip, c_per_ip_per_day) THEN EXIT; END IF;
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props, referrer, utm_source)
    VALUES (
      v_visitor, v_event,
      CASE WHEN jsonb_typeof(e->'puzzle_number') = 'number' THEN (e->>'puzzle_number')::integer ELSE NULL END,
      CASE WHEN jsonb_typeof(e->'props') = 'object' THEN e->'props' ELSE NULL END,
      left(nullif(btrim(coalesce(e->>'referrer', '')), ''), 120),
      left(nullif(btrim(coalesce(e->>'utm_source', '')), ''), 60)
    );
    v_written := v_written + 1;
  END LOOP;
  RETURN v_written;
END;
$function$;