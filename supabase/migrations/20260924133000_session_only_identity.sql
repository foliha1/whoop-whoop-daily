-- Identity comes only from the session (auth.uid()) or, for anonymous play,
-- the caller's visitor_id. A client-supplied email is never an identity.
-- Grandfathered: result rows stamped with an email before accounts, and
-- subscriber records created before this migration, still bridge that
-- player's old browsers. No new bridge can be created from a typed email.

DROP FUNCTION IF EXISTS public.email_has_history(text);
DROP FUNCTION IF EXISTS public.get_subscriber_email(text);
DROP FUNCTION IF EXISTS public.backfill_result_emails(text, text, integer);
DROP FUNCTION IF EXISTS public.link_group_email(text, text);

CREATE OR REPLACE FUNCTION public.subscribe_daily(p_email text, p_visitor_id text, p_source text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source text := coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'daily_result');
BEGIN
  IF v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' OR length(v_email) > 255 THEN
    RETURN false;
  END IF;

  IF v_source NOT IN ('daily_result', 'landing', 'prelaunch') THEN
    v_source := 'daily_result';
  END IF;

  INSERT INTO public.daily_subscribers (email, visitor_id, source)
  VALUES (v_email, nullif(btrim(coalesce(p_visitor_id, '')), ''), v_source)
  ON CONFLICT (email) DO NOTHING;


  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.subscribe_daily(p_email text, p_visitor_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' OR length(v_email) > 255 THEN
    RETURN false;
  END IF;

  INSERT INTO public.daily_subscribers (email, visitor_id, source)
  VALUES (v_email, nullif(btrim(coalesce(p_visitor_id, '')), ''), 'daily_result')
  ON CONFLICT (email) DO NOTHING;


  RETURN true;
END;
$function$
;


DROP FUNCTION IF EXISTS public.get_daily_stats(text, text);
DROP FUNCTION IF EXISTS public.get_daily_percentile(text, integer, text);
DROP FUNCTION IF EXISTS public.get_streak(text, integer, text);
DROP FUNCTION IF EXISTS public.get_daily_results(text, text);
DROP FUNCTION IF EXISTS public.get_first_attempt(text, text, integer);
DROP FUNCTION IF EXISTS public.get_whoop_points(text, text);
DROP FUNCTION IF EXISTS public.get_my_groups(text, text, integer);
DROP FUNCTION IF EXISTS public.join_daily_group(text, text, text, text);
DROP FUNCTION IF EXISTS public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer, text);
DROP FUNCTION IF EXISTS public.daily_rows_for(text, text);

CREATE OR REPLACE FUNCTION public.daily_rows_for(p_visitor_id text)
 RETURNS TABLE(puzzle_number integer, rounds_solved integer, total_misses integer, elapsed_ms integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (d.puzzle_number) d.puzzle_number, d.rounds_solved, d.total_misses, d.elapsed_ms
  FROM public.daily_results d
  WHERE (nullif(btrim(coalesce(p_visitor_id, '')), '') IS NOT NULL AND d.visitor_id = p_visitor_id)
     OR (auth.uid() IS NOT NULL AND d.user_id = auth.uid())
  ORDER BY d.puzzle_number, d.created_at ASC, d.id ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_streak(p_visitor_id text, p_current_puzzle_number integer)
 RETURNS TABLE(current_streak integer, longest_streak integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cur integer := 0;
  v_longest integer := 0;
  v_run integer := 0;
  v_prev integer := NULL;
  v_last integer := NULL;
  r record;
BEGIN
  IF nullif(trim(coalesce(p_visitor_id, '')), '') IS NULL AND auth.uid() IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  FOR r IN
    SELECT DISTINCT d.puzzle_number AS n
    FROM public.daily_rows_for(p_visitor_id) d
    ORDER BY 1 ASC
  LOOP
    IF v_prev IS NOT NULL AND r.n = v_prev + 1 THEN
      v_run := v_run + 1;
    ELSE
      v_run := 1;
    END IF;
    IF v_run > v_longest THEN
      v_longest := v_run;
    END IF;
    v_prev := r.n;
    v_last := r.n;
  END LOOP;

  IF v_last IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF p_current_puzzle_number IS NULL OR v_last >= p_current_puzzle_number - 1 THEN
    v_cur := v_run;
  ELSE
    v_cur := 0;
  END IF;

  RETURN QUERY SELECT v_cur, v_longest;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_daily_stats(p_visitor_id text)
 RETURNS TABLE(total_played integer, clean_runs integer, best_streak integer, avg_misses numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer := 0;
  v_clean integer := 0;
  v_avg numeric := 0;
  v_best integer := 0;
BEGIN
  IF nullif(trim(coalesce(p_visitor_id, '')), '') IS NULL AND auth.uid() IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 0::numeric;
    RETURN;
  END IF;

  WITH rows AS (
    SELECT DISTINCT d.puzzle_number, d.rounds_solved, d.total_misses
    FROM public.daily_rows_for(p_visitor_id) d
  )
  SELECT count(*)::integer,
         count(*) FILTER (WHERE rounds_solved >= 3 AND total_misses = 0)::integer,
         round(coalesce(avg(total_misses), 0)::numeric, 2)
  INTO v_total, v_clean, v_avg
  FROM rows;

  SELECT s.longest_streak INTO v_best
  FROM public.get_streak(p_visitor_id, NULL) s;

  RETURN QUERY SELECT v_total, v_clean, coalesce(v_best, 0), coalesce(v_avg, 0::numeric);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_daily_percentile(p_visitor_id text, p_puzzle_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
  FROM public.daily_rows_for(p_visitor_id) d
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_daily_results(p_visitor_id text)
 RETURNS TABLE(puzzle_number integer, puzzle_date date, rounds_solved integer, total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (r.puzzle_number)
         r.puzzle_number, r.puzzle_date, r.rounds_solved, r.total_misses,
         r.peek_used, r.round_events, r.elapsed_ms, r.created_at
  FROM public.daily_results r
  WHERE (nullif(btrim(coalesce(p_visitor_id, '')), '') IS NOT NULL AND r.visitor_id = p_visitor_id)
     OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
  ORDER BY r.puzzle_number ASC, r.created_at ASC, r.id ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_first_attempt(p_visitor_id text, p_puzzle_number integer)
 RETURNS TABLE(is_mine boolean, puzzle_number integer, puzzle_date date, rounds_solved integer, total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (r.visitor_id = btrim(coalesce(p_visitor_id,''))), r.puzzle_number, r.puzzle_date,
         r.rounds_solved, r.total_misses, r.peek_used, r.round_events, r.elapsed_ms, r.created_at
  FROM public.daily_results r
  WHERE r.puzzle_number = p_puzzle_number
    AND (r.visitor_id = btrim(coalesce(p_visitor_id,''))
         OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid()))
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_whoop_points(p_visitor_id text)
 RETURNS TABLE(total integer, tier text, today_points integer, total_before_today integer, points_to_next_tier integer, next_tier_threshold integer, peak_total integer, highest_tier_ever text, badges jsonb, days_away integer, decay_applied integer, games_played integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_visitor text := nullif(trim(coalesce(p_visitor_id, '')), '');
  v_identity text;
  v_me record;
  v_next integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_identity := auth.uid()::text;
  ELSIF v_visitor IS NOT NULL THEN
    SELECT coalesce(
      (SELECT pd.user_id::text FROM public.player_devices pd WHERE pd.visitor_id = v_visitor),
      (SELECT min(lower(trim(d.email))) FROM public.daily_results d
        WHERE d.visitor_id = v_visitor AND d.user_id IS NULL
          AND nullif(trim(coalesce(d.email, '')), '') IS NOT NULL),
      v_visitor) INTO v_identity;
  END IF;

  IF v_identity IS NOT NULL THEN
    SELECT f.* INTO v_me FROM public.whoop_points_for(v_identity, v_today) f;
  END IF;

  IF v_me IS NULL THEN
    RETURN QUERY SELECT 0, 'rookie', NULL::int, NULL::int, 25, 25, 0, 'rookie', '[]'::jsonb,
                        NULL::int, 0, 0;
    RETURN;
  END IF;

  SELECT min(f.floor) INTO v_next
  FROM (SELECT (e.value)::int AS floor FROM jsonb_each_text(cfg->'tiers') e) f
  WHERE f.floor > v_me.total;

  RETURN QUERY SELECT v_me.total, v_me.tier, v_me.today_points, v_me.total_before_today,
    CASE WHEN v_next IS NULL THEN NULL ELSE greatest(0, v_next - v_me.total) END,
    v_next, v_me.peak_total, v_me.highest_tier_ever, v_me.badges,
    v_me.days_away, v_me.decay_applied, v_me.games_played;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_groups(p_visitor_id text, p_puzzle_number integer DEFAULT NULL::integer)
 RETURNS TABLE(group_id uuid, name text, code text, member_count integer, my_position integer, my_points integer, puzzle_number integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_puzzle integer := p_puzzle_number;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN; END IF;

  IF v_puzzle IS NULL THEN
    SELECT max(d.puzzle_number) INTO v_puzzle
    FROM public.daily_rows_for(v_visitor) d;
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, g.code,
         (SELECT count(*)::integer FROM public.daily_group_members x
          WHERE x.group_id = g.id),
         CASE WHEN v_puzzle IS NULL THEN NULL ELSE
           (SELECT t.rank_position FROM public.get_group_today(g.id, v_puzzle, v_visitor) t
            WHERE t.is_me LIMIT 1) END,
         CASE WHEN v_puzzle IS NULL THEN 0 ELSE
           coalesce((SELECT s.points FROM public.get_group_season(g.id, v_puzzle, v_visitor) s
                     WHERE s.is_me LIMIT 1), 0) END,
         v_puzzle
  FROM public.daily_groups g
  JOIN public.daily_group_members m ON m.group_id = g.id AND m.visitor_id = v_visitor
  ORDER BY m.joined_at ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.join_daily_group(p_code text, p_visitor_id text, p_display_name text)
 RETURNS TABLE(group_id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_max_members constant integer := 20;
  c_max_groups constant integer := 5;
  c_per_visitor_per_day constant integer := 20;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_dn text := left(btrim(coalesce(p_display_name, '')), 6);
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_email text := public.session_email();
  v_id uuid;
  v_name text;
BEGIN
  IF length(v_visitor) = 0 OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF length(v_dn) = 0 THEN v_dn := 'Player'; END IF;


  IF NOT public.rl_hit('daily_group_join', v_visitor, c_per_visitor_per_day) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT g.id, g.name INTO v_id, v_name
  FROM public.daily_groups g WHERE lower(g.code) = v_code LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.daily_group_members m
             WHERE m.group_id = v_id AND m.visitor_id = v_visitor) THEN
    UPDATE public.daily_group_members m
    SET display_name = v_dn,
        email = coalesce(v_email, m.email),
        user_id = coalesce(auth.uid(), m.user_id)
    WHERE m.group_id = v_id AND m.visitor_id = v_visitor;
    RETURN QUERY SELECT v_id, v_name;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.group_id = v_id)
     >= c_max_members THEN
    RAISE EXCEPTION 'group_full';
  END IF;
  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.visitor_id = v_visitor)
     >= c_max_groups THEN
    RAISE EXCEPTION 'group_limit_reached';
  END IF;

  INSERT INTO public.daily_group_members (group_id, visitor_id, display_name, email, user_id)
  VALUES (v_id, v_visitor, v_dn, v_email, auth.uid());

  RETURN QUERY SELECT v_id, v_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_daily_group(p_name text, p_visitor_id text, p_display_name text)
 RETURNS TABLE(group_id uuid, name text, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_max_groups constant integer := 5;
  c_per_visitor_per_day constant integer := 10;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_name text := left(btrim(coalesce(p_name, '')), 24);
  v_dn text := left(btrim(coalesce(p_display_name, '')), 6);
  v_email text := public.session_email();
  v_code text;
  v_id uuid;
  v_try integer := 0;
BEGIN
  IF length(v_visitor) = 0 OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF length(v_dn) = 0 THEN v_dn := 'Player'; END IF;

  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.visitor_id = v_visitor)
     >= c_max_groups THEN
    RAISE EXCEPTION 'group_limit_reached';
  END IF;

  IF NOT public.rl_hit('daily_group_create', v_visitor, c_per_visitor_per_day) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := public.gen_daily_group_code();
    BEGIN
      INSERT INTO public.daily_groups (code, name, created_by)
      VALUES (v_code, v_name, v_visitor)
      RETURNING public.daily_groups.id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 20 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
    END;
  END LOOP;

  INSERT INTO public.daily_group_members (group_id, visitor_id, display_name, email, user_id)
  VALUES (v_id, v_visitor, v_dn, v_email, auth.uid());

  RETURN QUERY SELECT v_id, v_name, v_code;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_group_today(p_group_id uuid, p_puzzle_number integer, p_visitor_id text)
 RETURNS TABLE(visitor_id text, display_name text, rounds_solved integer, total_misses integer, peek_used boolean, rank_position integer, not_played boolean, is_me boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
BEGIN
  IF length(v_visitor) = 0 OR p_group_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_group_members m
                 WHERE m.group_id = p_group_id AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mem AS (
    SELECT m.visitor_id AS vid, m.display_name AS dn,
           m.user_id AS uid
    FROM public.daily_group_members m WHERE m.group_id = p_group_id
  ),
  scored AS (
    SELECT mem.vid, mem.dn, b.rounds_solved AS rs, b.total_misses AS tm, b.peek_used AS pk
    FROM mem
    LEFT JOIN LATERAL (
      SELECT r.rounds_solved, r.total_misses, r.peek_used
      FROM public.daily_results r
      WHERE r.puzzle_number = p_puzzle_number
        AND (r.visitor_id = mem.vid
             OR (mem.uid IS NOT NULL AND r.user_id = mem.uid))
      ORDER BY r.rounds_solved DESC, r.total_misses ASC, r.created_at ASC
      LIMIT 1
    ) b ON true
  )
  SELECT s.vid, s.dn,
         coalesce(s.rs, 0)::integer,
         coalesce(s.tm, 0)::integer,
         coalesce(s.pk, false),
         CASE WHEN s.rs IS NULL THEN NULL ELSE (
           1 + (SELECT count(*) FROM scored o
                WHERE o.rs IS NOT NULL
                  AND (o.rs, -o.tm) > (s.rs, -s.tm))
         )::integer END,
         (s.rs IS NULL),
         (s.vid = v_visitor)
  FROM scored s
  ORDER BY (s.rs IS NULL), s.rs DESC NULLS LAST, s.tm ASC, s.dn ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_group_season(p_group_id uuid, p_puzzle_number integer, p_visitor_id text)
 RETURNS TABLE(visitor_id text, display_name text, points integer, puzzles_played integer, rank_position integer, is_me boolean, season_start date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_week date := public.daily_season_start(p_puzzle_number);
  v_first integer := greatest(1, (public.daily_season_start(p_puzzle_number) - date '2026-08-11') + 1);
BEGIN
  IF length(v_visitor) = 0 OR p_group_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_group_members m
                 WHERE m.group_id = p_group_id AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mem AS (
    SELECT m.visitor_id AS vid, m.display_name AS dn,
           m.user_id AS uid
    FROM public.daily_group_members m WHERE m.group_id = p_group_id
  ),
  nums AS (SELECT n FROM generate_series(v_first, p_puzzle_number) AS n),
  rows_ AS (
    SELECT mem.vid, nums.n, b.rounds_solved AS rs, b.total_misses AS tm
    FROM mem CROSS JOIN nums
    LEFT JOIN LATERAL (
      SELECT r.rounds_solved, r.total_misses
      FROM public.daily_results r
      WHERE r.puzzle_number = nums.n
        AND (r.visitor_id = mem.vid
             OR (mem.uid IS NOT NULL AND r.user_id = mem.uid))
      ORDER BY r.rounds_solved DESC, r.total_misses ASC, r.created_at ASC
      LIMIT 1
    ) b ON true
  ),
  placed AS (
    SELECT x.vid, x.n,
           1 + (SELECT count(*) FROM rows_ o
                WHERE o.n = x.n AND o.rs IS NOT NULL
                  AND (o.rs, -o.tm) > (x.rs, -x.tm)) AS pos
    FROM rows_ x WHERE x.rs IS NOT NULL
  ),
  pts AS (
    SELECT mem.vid, mem.dn,
           coalesce(sum(CASE placed.pos WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1
                                        ELSE 0 END), 0)::integer AS points,
           count(placed.n)::integer AS played
    FROM mem LEFT JOIN placed ON placed.vid = mem.vid
    GROUP BY mem.vid, mem.dn
  )
  SELECT p.vid, p.dn, p.points, p.played,
         (1 + (SELECT count(*) FROM pts o WHERE o.points > p.points))::integer,
         (p.vid = v_visitor),
         v_week
  FROM pts p
  ORDER BY p.points DESC, p.played DESC, p.dn ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_daily_result(p_visitor_id text, p_puzzle_number integer, p_puzzle_date date, p_rounds_solved integer, p_total_misses integer, p_peek_used boolean, p_round_events jsonb, p_elapsed_ms integer)
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

  -- A browser linked to an account keeps saving to it even when signed out.
  IF v_uid IS NULL THEN
    SELECT pd.user_id INTO v_uid FROM public.player_devices pd WHERE pd.visitor_id = v_visitor;
  END IF;

  -- Grandfathered bridge: emails already on this browser's own rows or its
  -- pre-account subscriber record. Never taken from the client.
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
      AND ((v_uid IS NOT NULL AND (r.user_id = v_uid OR r.visitor_id IN
              (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid)))
           OR (v_emails IS NOT NULL AND (r.email = ANY (v_emails)
               OR r.visitor_id IN (SELECT s.visitor_id FROM public.daily_subscribers s
                                   WHERE s.email = ANY (v_emails)
                                     AND s.created_at < timestamptz '2026-09-24 13:30:00+00')))))
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
    total_misses, peek_used, round_events, elapsed_ms, email, user_id
  ) VALUES (
    v_visitor, p_puzzle_number, v_date, p_rounds_solved, p_total_misses,
    coalesce(p_peek_used, false), p_round_events, p_elapsed_ms, v_email, v_uid
  )
  ON CONFLICT (visitor_id, puzzle_number) DO NOTHING;
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.link_device_and_merge(p_visitor_id text)
 RETURNS TABLE(first_signin boolean, games integer, was_subscriber boolean, reminder_answered boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := public.session_email();
  v_visitor text := nullif(left(btrim(coalesce(p_visitor_id, '')), 100), '');
  v_first boolean;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL THEN RETURN; END IF;

  v_first := NOT EXISTS (SELECT 1 FROM public.player_devices WHERE user_id = v_uid)
         AND NOT EXISTS (SELECT 1 FROM public.daily_results WHERE user_id = v_uid);

  -- This browser always follows the account that signs in on it.
  IF v_visitor IS NOT NULL THEN
    INSERT INTO public.player_devices (visitor_id, user_id) VALUES (v_visitor, v_uid)
    ON CONFLICT (visitor_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = now();
  END IF;

  -- Browsers tied to this email by results or the subscriber record, unless
  -- they already belong to another account.
  INSERT INTO public.player_devices (visitor_id, user_id)
  SELECT DISTINCT x.visitor_id, v_uid FROM (
    SELECT r.visitor_id FROM public.daily_results r WHERE r.email = v_email
    UNION SELECT s.visitor_id FROM public.daily_subscribers s
          WHERE s.email = v_email AND s.visitor_id IS NOT NULL
            AND s.created_at < timestamptz '2026-09-24 13:30:00+00'
  ) x
  ON CONFLICT (visitor_id) DO NOTHING;

  UPDATE public.daily_results r
     SET user_id = v_uid, email = coalesce(r.email, v_email)
   WHERE r.user_id IS NULL
     AND (r.email = v_email
          OR r.visitor_id IN (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid));

  UPDATE public.daily_group_members m SET user_id = v_uid
   WHERE m.user_id IS NULL
     AND m.visitor_id IN (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid);

  RETURN QUERY SELECT v_first,
    (SELECT count(DISTINCT r.puzzle_number)::int FROM public.daily_results r WHERE r.user_id = v_uid),
    EXISTS (SELECT 1 FROM public.daily_subscribers s WHERE s.email = v_email),
    EXISTS (SELECT 1 FROM public.reminder_consents c WHERE c.user_id = v_uid);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid, p_email text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_visitors text[];
  v_n integer;
BEGIN
  SELECT array_agg(visitor_id) INTO v_visitors FROM public.player_devices WHERE user_id = p_user_id;
  v_visitors := coalesce(v_visitors, ARRAY[]::text[]);
  DELETE FROM public.daily_results
   WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.daily_subscribers WHERE visitor_id = ANY (v_visitors) OR (v_email IS NOT NULL AND email = v_email);
  DELETE FROM public.daily_group_members WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  DELETE FROM public.daily_events WHERE visitor_id = ANY (v_visitors);
  DELETE FROM public.reminder_consents WHERE user_id = p_user_id;
  DELETE FROM public.player_devices WHERE user_id = p_user_id;
  RETURN v_n;
END;
$function$
;


DROP FUNCTION IF EXISTS public.email_linked_to_visitor(text, text);
DROP FUNCTION IF EXISTS public.email_visitor_ids(text);

REVOKE ALL ON FUNCTION public.daily_rows_for(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_rows_for(text) TO service_role;
DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_streak(text, integer)', 'public.get_daily_stats(text)',
    'public.get_daily_percentile(text, integer)', 'public.get_daily_results(text)',
    'public.get_first_attempt(text, integer)', 'public.get_whoop_points(text)',
    'public.get_my_groups(text, integer)', 'public.join_daily_group(text, text, text)',
    'public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END $g$;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid, text) TO service_role;
