-- Security boundary: a bare visitor_id never grants access to an account's data.

CREATE OR REPLACE FUNCTION public.caller_visitor(p_visitor_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The supplied browser id, only when it is unlinked or linked to the caller.
  SELECT v FROM (SELECT nullif(left(btrim(coalesce(p_visitor_id, '')), 100), '') AS v) x
  WHERE v IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.player_devices pd
      WHERE pd.visitor_id = x.v
        AND (auth.uid() IS NULL OR pd.user_id <> auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.daily_rows_for(p_visitor_id text)
 RETURNS TABLE(puzzle_number integer, rounds_solved integer, total_misses integer, elapsed_ms integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (d.puzzle_number) d.puzzle_number, d.rounds_solved, d.total_misses, d.elapsed_ms
  FROM public.daily_results d
  WHERE (d.visitor_id = public.caller_visitor(p_visitor_id)
         AND (d.user_id IS NULL OR d.user_id = auth.uid()))
     OR (auth.uid() IS NOT NULL AND d.user_id = auth.uid())
  ORDER BY d.puzzle_number, d.created_at ASC, d.id ASC;
$function$;

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
  WHERE (r.visitor_id = public.caller_visitor(p_visitor_id)
         AND (r.user_id IS NULL OR r.user_id = auth.uid()))
     OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
  ORDER BY r.puzzle_number ASC, r.created_at ASC, r.id ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_first_attempt(p_visitor_id text, p_puzzle_number integer)
 RETURNS TABLE(is_mine boolean, puzzle_number integer, puzzle_date date, rounds_solved integer, total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (r.visitor_id = public.caller_visitor(p_visitor_id)), r.puzzle_number, r.puzzle_date,
         r.rounds_solved, r.total_misses, r.peek_used, r.round_events, r.elapsed_ms, r.created_at
  FROM public.daily_results r
  WHERE r.puzzle_number = p_puzzle_number
    AND ((r.visitor_id = public.caller_visitor(p_visitor_id)
          AND (r.user_id IS NULL OR r.user_id = auth.uid()))
         OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid()))
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1
$function$;

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
  ELSIF v_visitor IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor) THEN
    -- Signed out: only this browser's own anonymous history (plus the frozen
    -- pre-account legacy links). An account-linked browser needs the session.
    SELECT coalesce(
      (SELECT min(lower(trim(d.email))) FROM public.daily_results d
        WHERE d.visitor_id = v_visitor AND d.user_id IS NULL
          AND nullif(trim(coalesce(d.email, '')), '') IS NOT NULL),
      (SELECT l.email FROM public.legacy_subscriber_links l WHERE l.visitor_id = v_visitor),
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
$function$;

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

  -- A signed-out save never attaches an account. A signed-in save only uses a
  -- browser id that is unlinked or already linked to the caller.
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor AND pd.user_id <> v_uid
  ) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'visitor_owned_elsewhere'));
    RETURN false;
  END IF;

  -- Emails known server-side for this browser (never taken from the client).
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
    total_misses, peek_used, round_events, elapsed_ms, email, user_id
  ) VALUES (
    v_visitor, p_puzzle_number, v_date, p_rounds_solved, p_total_misses,
    coalesce(p_peek_used, false), p_round_events, p_elapsed_ms, v_email, v_uid
  )
  ON CONFLICT (visitor_id, puzzle_number) DO NOTHING;
  RETURN FOUND;
END;
$function$;

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

  -- Link an unlinked browser or refresh the caller's own link. A browser that
  -- belongs to a different account is never taken over.
  IF v_visitor IS NOT NULL THEN
    INSERT INTO public.player_devices (visitor_id, user_id) VALUES (v_visitor, v_uid)
    ON CONFLICT (visitor_id) DO UPDATE SET linked_at = now()
      WHERE public.player_devices.user_id = EXCLUDED.user_id;
  END IF;

  -- Browsers tied to this email by results or the subscriber record, unless
  -- they already belong to another account.
  INSERT INTO public.player_devices (visitor_id, user_id)
  SELECT DISTINCT x.visitor_id, v_uid FROM (
    SELECT r.visitor_id FROM public.daily_results r WHERE r.email = v_email
    UNION SELECT s.visitor_id FROM public.daily_subscribers s
          WHERE s.email = v_email AND s.visitor_id IS NOT NULL AND s.created_at < timestamptz '2026-09-24 13:30:00+00'
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
$function$;

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
      ORDER BY r.created_at ASC, r.id ASC
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
$function$;

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
      ORDER BY r.created_at ASC, r.id ASC
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
$function$;

-- Internal helpers, hidden Groups RPCs and the direct signup path: server only.
REVOKE EXECUTE ON FUNCTION public.caller_visitor(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caller_visitor(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_rows() TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_for(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_for(text, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_table(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_table(date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_active_identities(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_active_identities(date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_all(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_all(date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_score_table(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_score_table(integer, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_config() TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_apply_decay(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_apply_decay(integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_first_try(jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_first_try(jsonb, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_game(jsonb, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_game(jsonb, integer, integer, boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_tier(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_tier(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whoop_points_tier_floor(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_tier_floor(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.daily_puzzle_date(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_puzzle_date(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.daily_season_start(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_season_start(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.gen_daily_group_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_daily_group_code() TO service_role;
REVOKE EXECUTE ON FUNCTION public.legacy_links_frozen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_links_frozen() TO service_role;
REVOKE EXECUTE ON FUNCTION public.session_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_email() TO service_role;
REVOKE EXECUTE ON FUNCTION public.request_ip() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_ip() TO service_role;
REVOKE EXECUTE ON FUNCTION public.daily_result_reject_reason(integer, date, integer, integer, jsonb, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_result_reject_reason(integer, date, integer, integer, jsonb, integer, date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.classic_result_reject_reason(timestamp with time zone, timestamp with time zone, integer, jsonb, integer, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classic_result_reject_reason(timestamp with time zone, timestamp with time zone, integer, jsonb, integer, integer, integer, boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_daily_event_counts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_event_counts(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_daily_group(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_group(text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.join_daily_group(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_daily_group(text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.leave_daily_group(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_daily_group(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_groups(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_groups(text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_group_today(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_today(uuid, integer, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_group_season(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_season(uuid, integer, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.subscribe_daily(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_daily(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.subscribe_daily(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_daily(text, text, text) TO service_role;

-- Admin readers check is_admin() inside; drop the stray PUBLIC/anon grants.
REVOKE EXECUTE ON FUNCTION public.admin_classic(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_classic(date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_retention_split() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retention_split() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_signin_funnel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_signin_funnel(integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.link_device_and_merge(text) FROM PUBLIC, anon;
