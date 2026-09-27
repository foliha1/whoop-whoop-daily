CREATE OR REPLACE FUNCTION public.log_analytics_events(p_visitor_id text, p_events jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY[
    'classic_demo_opened','classic_demo_finished','classic_demo_skipped',
    'room_created','room_joined','invite_link_clicked','game_started','game_completed'
  ];
  c_max_batch constant integer := 10;
  c_per_ip_per_day constant integer := 2000;
  c_per_user_per_day constant integer := 500;
  c_meta_max_bytes constant integer := 512;
  c_meta_max_keys constant integer := 8;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 64);
  v_ip text;
  v_uid uuid := auth.uid();
  v_written integer := 0;
  v_i integer := 0;
  e jsonb;
  v_type text;
  v_meta jsonb;
  v_room text;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    PERFORM public.rl_hit('analytics_dropped', 'bad_batch', 2147483647);
    RETURN 0;
  END IF;
  IF length(v_visitor) = 0 THEN
    PERFORM public.rl_hit('analytics_dropped', 'no_visitor', 2147483647);
    RETURN 0;
  END IF;
  v_ip := public.request_ip();

  FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    v_i := v_i + 1;
    IF v_i > c_max_batch THEN
      PERFORM public.rl_hit('analytics_dropped', 'over_batch', 2147483647);
      EXIT;
    END IF;
    IF jsonb_typeof(e) <> 'object' THEN
      PERFORM public.rl_hit('analytics_dropped', 'unknown_type', 2147483647);
      CONTINUE;
    END IF;
    v_type := e->>'event_type';
    IF v_type IS NULL OR NOT (v_type = ANY (v_allowed)) THEN
      PERFORM public.rl_hit('analytics_dropped', 'unknown_type', 2147483647);
      CONTINUE;
    END IF;
    v_meta := coalesce(e->'metadata', '{}'::jsonb);
    IF jsonb_typeof(v_meta) <> 'object'
       OR octet_length(v_meta::text) > c_meta_max_bytes
       OR (SELECT count(*) FROM jsonb_object_keys(v_meta)) > c_meta_max_keys THEN
      PERFORM public.rl_hit('analytics_dropped', 'bad_metadata', 2147483647);
      CONTINUE;
    END IF;
    v_room := CASE WHEN jsonb_typeof(e->'room_code') = 'string'
                   THEN left(nullif(btrim(e->>'room_code'), ''), 16) ELSE NULL END;
    IF NOT public.rl_hit('analytics_ip', v_ip, c_per_ip_per_day) THEN
      PERFORM public.rl_hit('analytics_dropped', 'rate_ip', 2147483647);
      EXIT;
    END IF;
    IF v_uid IS NOT NULL AND NOT public.rl_hit('analytics_user', v_uid::text, c_per_user_per_day) THEN
      PERFORM public.rl_hit('analytics_dropped', 'rate_user', 2147483647);
      EXIT;
    END IF;
    INSERT INTO public.analytics_events (event_type, room_code, visitor_id, metadata)
    VALUES (v_type, v_room, v_visitor, v_meta);
    v_written := v_written + 1;
  END LOOP;
  RETURN v_written;
EXCEPTION WHEN OTHERS THEN
  RETURN v_written;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_analytics_events(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_analytics_events(text, jsonb) TO anon, authenticated;