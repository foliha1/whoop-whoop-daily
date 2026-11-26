ALTER TABLE public.classic_timing_samples
  DROP CONSTRAINT classic_timing_samples_role_check;

ALTER TABLE public.classic_timing_samples
  ADD CONSTRAINT classic_timing_samples_role_check
  CHECK (role = ANY (ARRAY['host'::text, 'joiner'::text, 'table'::text]));

CREATE OR REPLACE FUNCTION public.log_classic_timing(p_samples jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer := 0;
  s jsonb;
  clamp_ms constant integer := 60000;
BEGIN
  IF p_samples IS NULL OR jsonb_typeof(p_samples) <> 'array' THEN RETURN 0; END IF;
  IF NOT public.rl_hit('classic_timing', coalesce(public.request_ip(), 'unknown'), 40) THEN RETURN 0; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(p_samples) LIMIT 50 LOOP
    IF (s->>'kind') NOT IN ('tap','frames') OR (s->>'role') NOT IN ('host','joiner','table') THEN CONTINUE; END IF;
    INSERT INTO public.classic_timing_samples(kind, role, browser, in_app_instagram, surface,
      tap_to_host_ms, host_to_send_ms, send_to_paint_ms, total_ms, window_ms, long_frames, dropped_frames)
    VALUES (
      s->>'kind', s->>'role',
      CASE WHEN (s->>'browser') IN ('chrome','safari','firefox','edge','samsung','other') THEN s->>'browser' ELSE 'other' END,
      coalesce((s->>'ig')::boolean, false),
      CASE WHEN (s->>'surface') IN ('flip','pulse','roll','claim','claim_seen') THEN s->>'surface' ELSE NULL END,
      least(greatest((s->>'tap_to_host_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'host_to_send_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'send_to_paint_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'total_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'window_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'long_frames')::integer, 0), 10000),
      least(greatest((s->>'dropped_frames')::integer, 0), 10000)
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
EXCEPTION WHEN others THEN
  RETURN 0;
END;
$function$;