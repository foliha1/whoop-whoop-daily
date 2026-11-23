CREATE OR REPLACE FUNCTION public.whoop_points_study_bonus(p_study_level text, p_rounds_solved integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE coalesce(p_study_level, 'look')
    WHEN 'blink'  THEN 0.5 * greatest(0, least(3, coalesce(p_rounds_solved, 0)))
    WHEN 'glance' THEN 0.5 * greatest(0, least(3, coalesce(p_rounds_solved, 0)) - 1)
    ELSE 0
  END::numeric
$$;

DROP FUNCTION IF EXISTS public.get_whoop_points(text, date);
DROP FUNCTION IF EXISTS public.whoop_points_table(date);
DROP FUNCTION IF EXISTS public.whoop_points_for(text, date);
DROP FUNCTION IF EXISTS public.whoop_points_all(date);
DROP FUNCTION IF EXISTS public.whoop_points_rows();
DROP FUNCTION IF EXISTS public.whoop_points_tier(integer);
DROP FUNCTION IF EXISTS public.whoop_points_apply_decay(integer, integer);

CREATE FUNCTION public.whoop_points_tier(p_total numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(p_total, 0) >= 300 THEN 'legend'
    WHEN coalesce(p_total, 0) >= 150 THEN 'xray_vision'
    WHEN coalesce(p_total, 0) >= 75  THEN 'match_maker'
    WHEN coalesce(p_total, 0) >= 25  THEN 'great_eye'
    ELSE 'rookie'
  END
$$;

CREATE FUNCTION public.whoop_points_apply_decay(p_total numeric, p_days integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  WITH cfg AS (SELECT public.whoop_points_config() AS c)
  SELECT CASE
    WHEN coalesce(p_total, 0) <= (SELECT (c->>'decay_protected_points')::int FROM cfg)
      THEN greatest(0, coalesce(p_total, 0))
    ELSE greatest(
      (SELECT (c->>'decay_protected_points')::int FROM cfg)::numeric,
      coalesce(p_total, 0)
        - greatest(0, coalesce(p_days, 0) - (SELECT (c->>'grace_days')::int FROM cfg))
          * (SELECT (c->>'decay_per_day')::int FROM cfg)
    )
  END
$$;

CREATE FUNCTION public.whoop_points_rows()
RETURNS TABLE(identity text, puzzle_number integer, puzzle_date date, game_points numeric, used_fallback boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH stamped AS (
    SELECT d.visitor_id, min(lower(trim(d.email))) AS email
    FROM public.daily_results d
    WHERE nullif(trim(coalesce(d.email, '')), '') IS NOT NULL
    GROUP BY d.visitor_id
  ),
  emails AS (
    SELECT visitor_id, email FROM stamped
    UNION ALL
    SELECT l.visitor_id, l.email FROM public.legacy_subscriber_links l
    WHERE NOT EXISTS (SELECT 1 FROM stamped s WHERE s.visitor_id = l.visitor_id)
  ),
  mapped AS (
    SELECT coalesce(d.user_id::text, e.email, d.visitor_id) AS identity,
           d.puzzle_number, d.puzzle_date, d.created_at, d.id,
           (public.whoop_points_game(d.round_events, d.rounds_solved, d.total_misses, d.peek_used)
             + public.whoop_points_study_bonus(d.study_level, d.rounds_solved))::numeric AS game_points,
           (jsonb_typeof(d.round_events) IS DISTINCT FROM 'array') AS used_fallback
    FROM public.daily_results d
    LEFT JOIN emails e ON e.visitor_id = d.visitor_id
  )
  SELECT DISTINCT ON (m.identity, m.puzzle_number)
         m.identity, m.puzzle_number, m.puzzle_date, m.game_points, m.used_fallback
  FROM mapped m
  ORDER BY m.identity, m.puzzle_number, m.created_at ASC, m.id ASC;
$$;

CREATE FUNCTION public.whoop_points_all(p_as_of date DEFAULT NULL::date)
RETURNS TABLE(identity text, games_played integer, total numeric, tier text, peak_total numeric, highest_tier_ever text, last_played date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date);
  r record;
  v_id text; v_total numeric; v_peak numeric; v_games int;
  v_prev date; v_last date;
BEGIN
  FOR r IN
    SELECT w.identity, w.puzzle_date, w.puzzle_number, w.game_points
    FROM public.whoop_points_rows() w
    WHERE w.puzzle_date <= v_as_of
    ORDER BY w.identity, w.puzzle_date, w.puzzle_number
  LOOP
    IF v_id IS DISTINCT FROM r.identity THEN
      IF v_id IS NOT NULL THEN
        v_total := public.whoop_points_apply_decay(v_total, (v_as_of - v_last));
        RETURN QUERY SELECT v_id, v_games, v_total, public.whoop_points_tier(v_total),
                            v_peak, public.whoop_points_tier(v_peak), v_last;
      END IF;
      v_id := r.identity; v_total := 0; v_peak := 0; v_games := 0;
      v_prev := NULL; v_last := NULL;
    END IF;
    IF v_prev IS NOT NULL THEN
      v_total := public.whoop_points_apply_decay(v_total, (r.puzzle_date - v_prev));
    END IF;
    v_total := greatest(0, v_total + r.game_points);
    IF v_total > v_peak THEN v_peak := v_total; END IF;
    v_games := v_games + 1;
    v_prev := r.puzzle_date;
    v_last := r.puzzle_date;
  END LOOP;
  IF v_id IS NOT NULL THEN
    v_total := public.whoop_points_apply_decay(v_total, (v_as_of - v_last));
    RETURN QUERY SELECT v_id, v_games, v_total, public.whoop_points_tier(v_total),
                        v_peak, public.whoop_points_tier(v_peak), v_last;
  END IF;
END;
$function$;

CREATE FUNCTION public.whoop_points_for(p_identity text, p_as_of date DEFAULT NULL::date)
RETURNS TABLE(identity text, games_played integer, total numeric, tier text, peak_total numeric, highest_tier_ever text, last_played date, days_away integer, decay_applied numeric, today_points numeric, total_before_today numeric, badges jsonb, fallback_rows integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date);
  r record; t record;
  v_total numeric := 0; v_peak numeric := 0; v_games int := 0; v_fallback int := 0;
  v_prev date; v_last date;
  v_today_points numeric; v_before_today numeric;
  v_gap int; v_final_decay numeric := 0;
  v_earned jsonb := '{}'::jsonb;
BEGIN
  IF nullif(trim(coalesce(p_identity, '')), '') IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT w.* FROM public.whoop_points_rows() w
    WHERE w.identity = p_identity AND w.puzzle_date <= v_as_of
    ORDER BY w.puzzle_date, w.puzzle_number
  LOOP
    IF v_prev IS NOT NULL THEN
      v_total := public.whoop_points_apply_decay(v_total, (r.puzzle_date - v_prev));
    END IF;
    IF r.puzzle_date = v_as_of AND v_today_points IS NULL THEN
      v_before_today := v_total;
      v_today_points := 0;
    END IF;
    v_total := greatest(0, v_total + r.game_points);
    IF r.puzzle_date = v_as_of THEN
      v_today_points := v_today_points + r.game_points;
    END IF;
    IF r.used_fallback THEN v_fallback := v_fallback + 1; END IF;
    IF v_total > v_peak THEN v_peak := v_total; END IF;
    v_games := v_games + 1;
    FOR t IN SELECT key, value FROM jsonb_each_text(cfg->'tiers') LOOP
      IF v_total >= t.value::int AND NOT (v_earned ? t.key) THEN
        v_earned := v_earned || jsonb_build_object(t.key, r.puzzle_date::text);
      END IF;
    END LOOP;
    v_prev := r.puzzle_date;
    v_last := r.puzzle_date;
  END LOOP;
  IF v_games = 0 THEN RETURN; END IF;
  v_gap := (v_as_of - v_last);
  v_final_decay := v_total - public.whoop_points_apply_decay(v_total, v_gap);
  v_total := public.whoop_points_apply_decay(v_total, v_gap);
  RETURN QUERY SELECT p_identity, v_games, v_total, public.whoop_points_tier(v_total),
    v_peak, public.whoop_points_tier(v_peak), v_last, v_gap, v_final_decay,
    v_today_points, v_before_today,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'earned_on', e.value)
              ORDER BY public.whoop_points_tier_floor(e.key)), '[]'::jsonb)
     FROM jsonb_each_text(v_earned) e),
    v_fallback;
END;
$function$;

CREATE FUNCTION public.whoop_points_table(p_as_of date DEFAULT NULL::date)
RETURNS TABLE(identity text, games_played integer, total numeric, tier text, peak_total numeric, highest_tier_ever text, last_played date, days_away integer, decay_applied numeric, today_points numeric, total_before_today numeric, badges jsonb, fallback_rows integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT f.* FROM (SELECT DISTINCT r.identity FROM public.whoop_points_rows() r) i
  CROSS JOIN LATERAL public.whoop_points_for(i.identity, p_as_of) f
$$;

CREATE FUNCTION public.get_whoop_points(p_visitor_id text, p_puzzle_date date DEFAULT NULL::date)
RETURNS TABLE(total numeric, tier text, today_points numeric, total_before_today numeric, points_to_next_tier numeric, next_tier_threshold integer, peak_total numeric, highest_tier_ever text, badges jsonb, days_away integer, decay_applied numeric, games_played integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_today date := CASE WHEN p_puzzle_date BETWEEN (now() AT TIME ZONE 'utc')::date - 1 AND (now() AT TIME ZONE 'utc')::date + 1 THEN p_puzzle_date ELSE (now() AT TIME ZONE 'utc')::date END;
  v_visitor text := nullif(trim(coalesce(p_visitor_id, '')), '');
  v_identity text;
  v_me record;
  v_next integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_identity := auth.uid()::text;
  ELSIF v_visitor IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor) THEN
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
    RETURN QUERY SELECT 0::numeric, 'rookie', NULL::numeric, NULL::numeric, 25::numeric, 25, 0::numeric, 'rookie', '[]'::jsonb,
                        NULL::int, 0::numeric, 0;
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

REVOKE ALL ON FUNCTION public.whoop_points_study_bonus(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_tier(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_apply_decay(numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_rows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_all(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_for(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_table(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_points_study_bonus(text, integer), public.whoop_points_tier(numeric), public.whoop_points_apply_decay(numeric, integer), public.whoop_points_rows(), public.whoop_points_all(date), public.whoop_points_for(text, date), public.whoop_points_table(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_whoop_points(text, date) TO anon, authenticated, service_role;