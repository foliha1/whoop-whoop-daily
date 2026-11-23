ALTER TABLE public.daily_results ADD COLUMN IF NOT EXISTS study_level text NOT NULL DEFAULT 'look'
  CHECK (study_level IN ('blink','glance','look','study'));

DROP FUNCTION IF EXISTS public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer);

CREATE FUNCTION public.save_daily_result(p_visitor_id text, p_puzzle_number integer, p_puzzle_date date, p_rounds_solved integer, p_total_misses integer, p_peek_used boolean, p_round_events jsonb, p_elapsed_ms integer, p_study_level text DEFAULT 'look')
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_per_visitor_per_day constant integer := 10;
  c_per_ip_per_day constant integer := 40;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_date date := coalesce(p_puzzle_date, (now() AT TIME ZONE 'utc')::date);
  v_uid uuid := auth.uid();
  v_email text := public.session_email();
  v_level text := CASE WHEN p_study_level IN ('blink','glance','look','study') THEN p_study_level ELSE 'look' END;
  v_emails text[];
  v_reason text;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN false; END IF;

  v_reason := public.daily_result_reject_reason(
    p_puzzle_number, v_date, p_rounds_solved, p_total_misses, p_round_events, p_elapsed_ms);
  IF v_reason IS NOT NULL THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number,
            jsonb_build_object('reason', v_reason, 'elapsed_ms', p_elapsed_ms));
    RETURN false;
  END IF;

  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor AND pd.user_id <> v_uid
  ) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'visitor_owned_elsewhere'));
    RETURN false;
  END IF;

  IF v_uid IS NULL AND EXISTS (
    SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor
  ) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'visitor_linked_needs_session'));
    RETURN false;
  END IF;

  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT v_email AS e
    UNION SELECT s.email FROM public.daily_subscribers s WHERE s.visitor_id = v_visitor
          AND s.created_at < timestamptz '2026-09-24 13:30:00+00'
    UNION SELECT lower(btrim(r.email)) FROM public.daily_results r
          WHERE r.visitor_id = v_visitor AND r.email IS NOT NULL
  ) x WHERE e IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM public.daily_results r
    WHERE r.puzzle_number = p_puzzle_number AND r.visitor_id <> v_visitor
      AND ((v_uid IS NOT NULL AND (r.user_id = v_uid OR r.visitor_id IN (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid)))
           OR (v_emails IS NOT NULL AND (r.email = ANY (v_emails)
               OR r.visitor_id IN (SELECT s.visitor_id FROM public.daily_subscribers s
                                   WHERE s.email = ANY (v_emails) AND s.created_at < timestamptz '2026-09-24 13:30:00+00'))))
  ) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number,
            jsonb_build_object('reason', 'duplicate_attempt'));
    RETURN false;
  END IF;

  IF NOT public.rl_hit('daily_result_visitor', v_visitor, c_per_visitor_per_day) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'rate_limit_visitor'));
    RETURN false;
  END IF;
  IF NOT public.rl_hit('daily_result_ip', public.request_ip(), c_per_ip_per_day) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'rate_limit_ip'));
    RETURN false;
  END IF;

  INSERT INTO public.daily_results (
    visitor_id, puzzle_number, puzzle_date, rounds_solved,
    total_misses, peek_used, round_events, elapsed_ms, email, user_id, study_level
  ) VALUES (
    v_visitor, p_puzzle_number, v_date, p_rounds_solved, p_total_misses,
    coalesce(p_peek_used, false), p_round_events, p_elapsed_ms, v_email, v_uid, v_level
  )
  ON CONFLICT (visitor_id, puzzle_number) DO NOTHING;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer, text) TO anon, authenticated, service_role;