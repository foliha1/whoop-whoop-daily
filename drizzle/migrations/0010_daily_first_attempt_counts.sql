-- First attempt counts, always. Every per-player figure keeps the EARLIEST
-- result per identity per puzzle; replays can never become the counted attempt.

-- Visitor ids known to belong to an email: rows stamped with it, or a signup.
CREATE OR REPLACE FUNCTION public.email_visitor_ids(p_email text)
RETURNS TABLE(visitor_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.visitor_id FROM public.daily_results r
  WHERE nullif(lower(btrim(coalesce(p_email,''))),'') IS NOT NULL
    AND r.email = lower(btrim(p_email))
  UNION
  SELECT s.visitor_id FROM public.daily_subscribers s
  WHERE nullif(lower(btrim(coalesce(p_email,''))),'') IS NOT NULL
    AND s.email = lower(btrim(p_email)) AND s.visitor_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.email_visitor_ids(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_visitor_ids(text) TO service_role;

-- 1. Points engine: earliest attempt, not best.
CREATE OR REPLACE FUNCTION public.whoop_points_rows()
 RETURNS TABLE(identity text, puzzle_number integer, puzzle_date date, game_points integer, used_fallback boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH emails AS (
    SELECT d.visitor_id, min(lower(trim(d.email))) AS email
    FROM public.daily_results d
    WHERE nullif(trim(coalesce(d.email, '')), '') IS NOT NULL
    GROUP BY d.visitor_id
  ),
  mapped AS (
    SELECT coalesce(e.email, d.visitor_id) AS identity,
           d.puzzle_number, d.puzzle_date, d.created_at, d.id,
           public.whoop_points_game(d.round_events, d.rounds_solved, d.total_misses, d.peek_used) AS game_points,
           (jsonb_typeof(d.round_events) IS DISTINCT FROM 'array') AS used_fallback
    FROM public.daily_results d
    LEFT JOIN emails e ON e.visitor_id = d.visitor_id
  )
  SELECT DISTINCT ON (m.identity, m.puzzle_number)
         m.identity, m.puzzle_number, m.puzzle_date, m.game_points, m.used_fallback
  FROM mapped m
  ORDER BY m.identity, m.puzzle_number, m.created_at ASC, m.id ASC;
$function$;

-- Days Played, Clean Runs, Longest/current streak, percentile all read this.
CREATE OR REPLACE FUNCTION public.daily_rows_for(p_visitor_id text, p_email text)
 RETURNS TABLE(puzzle_number integer, rounds_solved integer, total_misses integer, elapsed_ms integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (d.puzzle_number) d.puzzle_number, d.rounds_solved, d.total_misses, d.elapsed_ms
  FROM public.daily_results d
  WHERE (nullif(trim(coalesce(p_visitor_id, '')), '') IS NOT NULL
         AND d.visitor_id = p_visitor_id)
     OR (public.email_linked_to_visitor(p_visitor_id, p_email)
         AND d.email = lower(trim(p_email)))
  ORDER BY d.puzzle_number, d.created_at ASC, d.id ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_daily_percentile(p_visitor_id text, p_puzzle_number integer, p_email text DEFAULT NULL::text)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_min_players constant integer := 20;
  v_total integer := 0;
  v_me record;
  v_beat integer := 0;
BEGIN
  IF p_puzzle_number IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT d.visitor_id)::integer INTO v_total
  FROM public.daily_results d WHERE d.puzzle_number = p_puzzle_number;
  IF v_total IS NULL OR v_total < v_min_players THEN RETURN NULL; END IF;

  SELECT d.rounds_solved, d.total_misses, d.elapsed_ms INTO v_me
  FROM public.daily_rows_for(p_visitor_id, p_email) d
  WHERE d.puzzle_number = p_puzzle_number LIMIT 1;
  IF v_me IS NULL THEN RETURN NULL; END IF;

  SELECT count(*)::integer INTO v_beat
  FROM (
    SELECT DISTINCT ON (d.visitor_id) d.visitor_id, d.rounds_solved, d.total_misses, d.elapsed_ms
    FROM public.daily_results d
    WHERE d.puzzle_number = p_puzzle_number
    ORDER BY d.visitor_id, d.created_at ASC, d.id ASC
  ) o
  WHERE ROW(v_me.rounds_solved, -v_me.total_misses, -v_me.elapsed_ms)
        >= ROW(o.rounds_solved, -o.total_misses, -o.elapsed_ms);
  RETURN greatest(0, least(100, round((v_beat::numeric / v_total::numeric) * 100)::integer));
END;
$function$;

-- 2. The first attempt for a player on one puzzle, across this browser and
-- every browser known for the email. is_mine: saved by this browser.
CREATE OR REPLACE FUNCTION public.get_first_attempt(p_visitor_id text, p_email text, p_puzzle_number integer)
RETURNS TABLE(is_mine boolean, puzzle_number integer, puzzle_date date, rounds_solved integer,
              total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer,
              created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (r.visitor_id = btrim(coalesce(p_visitor_id,''))), r.puzzle_number, r.puzzle_date,
         r.rounds_solved, r.total_misses, r.peek_used, r.round_events, r.elapsed_ms, r.created_at
  FROM public.daily_results r
  WHERE r.puzzle_number = p_puzzle_number
    AND (r.visitor_id = btrim(coalesce(p_visitor_id,''))
         OR (nullif(lower(btrim(coalesce(p_email,''))),'') IS NOT NULL
             AND (r.email = lower(btrim(p_email))
                  OR r.visitor_id IN (SELECT v.visitor_id FROM public.email_visitor_ids(p_email) v))))
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_first_attempt(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_first_attempt(text, text, integer) TO anon, authenticated, service_role;

-- Server guard: a result for a puzzle this player's email already has is
-- rejected (logged, false) — same shape as implausible results.
CREATE OR REPLACE FUNCTION public.save_daily_result(p_visitor_id text, p_puzzle_number integer, p_puzzle_date date, p_rounds_solved integer, p_total_misses integer, p_peek_used boolean, p_round_events jsonb, p_elapsed_ms integer, p_email text DEFAULT NULL::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c_per_visitor_per_day constant integer := 10;
  c_per_ip_per_day constant integer := 40;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_date date := coalesce(p_puzzle_date, (now() AT TIME ZONE 'utc')::date);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
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

  -- Every email this browser is known by, plus the one it sent.
  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT v_email AS e
    UNION SELECT s.email FROM public.daily_subscribers s WHERE s.visitor_id = v_visitor
    UNION SELECT lower(btrim(r.email)) FROM public.daily_results r
          WHERE r.visitor_id = v_visitor AND r.email IS NOT NULL
  ) x WHERE e IS NOT NULL;

  IF v_emails IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.daily_results r
    WHERE r.puzzle_number = p_puzzle_number AND r.visitor_id <> v_visitor
      AND (r.email = ANY (v_emails)
           OR r.visitor_id IN (SELECT s.visitor_id FROM public.daily_subscribers s
                               WHERE s.email = ANY (v_emails)))
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
    total_misses, peek_used, round_events, elapsed_ms, email
  ) VALUES (
    v_visitor, p_puzzle_number, v_date, p_rounds_solved, p_total_misses,
    coalesce(p_peek_used, false), p_round_events, p_elapsed_ms,
    -- Only an email already linked to this browser is ever stamped.
    CASE WHEN public.email_linked_to_visitor(v_visitor, v_email) THEN v_email END
  )
  ON CONFLICT (visitor_id, puzzle_number) DO NOTHING;
  RETURN FOUND;
END;
$function$;

-- Backfill never stamps an email onto a row when that email already has an
-- earlier result for the same puzzle elsewhere.
CREATE OR REPLACE FUNCTION public.backfill_result_emails(p_visitor_id text, p_email text, p_limit integer DEFAULT 500)
 RETURNS TABLE(updated_rows integer, collisions integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_visitor text := nullif(btrim(coalesce(p_visitor_id, '')), '');
  v_updated integer := 0;
  v_collisions integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 0), 500);
BEGIN
  updated_rows := 0; collisions := 0;
  IF v_visitor IS NULL OR v_email = '' THEN RETURN NEXT; RETURN; END IF;

  SELECT count(*) INTO v_collisions FROM public.daily_results
  WHERE visitor_id = v_visitor AND email IS NOT NULL AND lower(btrim(email)) <> v_email;

  WITH target AS (
    SELECT r.id FROM public.daily_results r
    WHERE r.visitor_id = v_visitor AND r.email IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.daily_results o
        WHERE o.puzzle_number = r.puzzle_number
          AND o.visitor_id <> v_visitor
          AND o.created_at < r.created_at
          AND (o.email = v_email
               OR o.visitor_id IN (SELECT s.visitor_id FROM public.daily_subscribers s
                                   WHERE s.email = v_email)))
    ORDER BY r.puzzle_number
    LIMIT v_limit
  ), done AS (
    UPDATE public.daily_results r SET email = v_email
    FROM target t WHERE r.id = t.id RETURNING r.id
  )
  SELECT count(*) INTO v_updated FROM done;

  updated_rows := v_updated; collisions := v_collisions;
  RETURN NEXT;
END;
$function$;