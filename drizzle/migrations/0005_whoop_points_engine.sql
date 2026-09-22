-- Whoop Points: a countable running total that grows with play and decays with absence.
-- Built alongside the existing Whoop Score engine; nothing existing is altered.

CREATE OR REPLACE FUNCTION public.whoop_points_config()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'point_play', 1,
    'point_first_try_max', 3,
    'point_no_peek', 1,
    'max_per_game', 5,
    'grace_days', 7,
    'decay_per_day', 3,
    'active_days', 30,
    'tiers', jsonb_build_object(
      'rookie', 0,
      'great_eye', 25,
      'match_maker', 75,
      'xray_vision', 150,
      'legend', 300
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.whoop_points_tier_floor(p_tier text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ((public.whoop_points_config()->'tiers')->>p_tier)::int
$$;

CREATE OR REPLACE FUNCTION public.whoop_points_tier(p_total integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN coalesce(p_total, 0) >= 300 THEN 'legend'
    WHEN coalesce(p_total, 0) >= 150 THEN 'xray_vision'
    WHEN coalesce(p_total, 0) >= 75  THEN 'match_maker'
    WHEN coalesce(p_total, 0) >= 25  THEN 'great_eye'
    ELSE 'rookie'
  END
$$;

-- First-try rounds: a round is first-try when its first recorded event is SOLVE.
CREATE OR REPLACE FUNCTION public.whoop_points_first_try(
  p_round_events jsonb, p_rounds_solved integer, p_total_misses integer
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_round_events) = 'array' THEN (
      SELECT count(*)::int FROM jsonb_array_elements(p_round_events) e
      WHERE jsonb_typeof(e) = 'array' AND e->>0 = 'SOLVE'
    )
    WHEN coalesce(p_total_misses, 0) = 0 THEN greatest(0, coalesce(p_rounds_solved, 0))
    ELSE greatest(0, coalesce(p_rounds_solved, 0) - coalesce(p_total_misses, 0))
  END
$$;

CREATE OR REPLACE FUNCTION public.whoop_points_game(
  p_round_events jsonb, p_rounds_solved integer, p_total_misses integer, p_peek_used boolean
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT 1
       + least(3, public.whoop_points_first_try(p_round_events, p_rounds_solved, p_total_misses))
       + CASE WHEN coalesce(p_peek_used, false) THEN 0 ELSE 1 END
$$;

-- One best row per identity per puzzle, with its points already scored.
CREATE OR REPLACE FUNCTION public.whoop_points_rows()
RETURNS TABLE(identity text, puzzle_number integer, puzzle_date date,
              game_points integer, used_fallback boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH emails AS (
    SELECT d.visitor_id, min(lower(trim(d.email))) AS email
    FROM public.daily_results d
    WHERE nullif(trim(coalesce(d.email, '')), '') IS NOT NULL
    GROUP BY d.visitor_id
  ),
  mapped AS (
    SELECT coalesce(e.email, d.visitor_id) AS identity,
           d.puzzle_number, d.puzzle_date,
           public.whoop_points_game(d.round_events, d.rounds_solved, d.total_misses, d.peek_used) AS game_points,
           (jsonb_typeof(d.round_events) IS DISTINCT FROM 'array') AS used_fallback
    FROM public.daily_results d
    LEFT JOIN emails e ON e.visitor_id = d.visitor_id
  )
  SELECT DISTINCT ON (m.identity, m.puzzle_number)
         m.identity, m.puzzle_number, m.puzzle_date, m.game_points, m.used_fallback
  FROM mapped m
  ORDER BY m.identity, m.puzzle_number, m.game_points DESC;
$$;

CREATE OR REPLACE FUNCTION public.whoop_points_active_identities(p_as_of date DEFAULT NULL)
RETURNS TABLE(identity text) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT DISTINCT r.identity
  FROM public.whoop_points_rows() r, (SELECT public.whoop_points_config() AS c) cfg
  WHERE r.puzzle_date > coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date)
                        - (cfg.c->>'active_days')::int
$$;

-- The deterministic walk: points in puzzle_date order, decay for every gap past
-- the grace window, floored at zero at every step.
CREATE OR REPLACE FUNCTION public.whoop_points_for(p_identity text, p_as_of date DEFAULT NULL)
RETURNS TABLE(identity text, games_played integer, total integer, tier text,
              peak_total integer, highest_tier_ever text, last_played date,
              days_away integer, decay_applied integer, today_points integer,
              total_before_today integer, badges jsonb, fallback_rows integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_grace int := (cfg->>'grace_days')::int;
  v_rate int := (cfg->>'decay_per_day')::int;
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date);
  r record; t record;
  v_total int := 0; v_peak int := 0; v_games int := 0; v_fallback int := 0;
  v_prev date; v_last date;
  v_today_points int; v_before_today int;
  v_gap int; v_decay int; v_final_decay int := 0;
  v_earned jsonb := '{}'::jsonb;
BEGIN
  IF nullif(trim(coalesce(p_identity, '')), '') IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT w.* FROM public.whoop_points_rows() w
    WHERE w.identity = p_identity AND w.puzzle_date <= v_as_of
    ORDER BY w.puzzle_date, w.puzzle_number
  LOOP
    IF v_prev IS NOT NULL THEN
      v_gap := (r.puzzle_date - v_prev);
      v_total := greatest(0, v_total - greatest(0, v_gap - v_grace) * v_rate);
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
  v_decay := greatest(0, v_gap - v_grace) * v_rate;
  v_final_decay := least(v_decay, v_total);
  v_total := greatest(0, v_total - v_decay);

  RETURN QUERY SELECT p_identity, v_games, v_total, public.whoop_points_tier(v_total),
    v_peak, public.whoop_points_tier(v_peak), v_last, v_gap, v_final_decay,
    v_today_points, v_before_today,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'earned_on', e.value)
              ORDER BY public.whoop_points_tier_floor(e.key)), '[]'::jsonb)
     FROM jsonb_each_text(v_earned) e),
    v_fallback;
END;
$$;

CREATE OR REPLACE FUNCTION public.whoop_points_table(p_as_of date DEFAULT NULL)
RETURNS TABLE(identity text, games_played integer, total integer, tier text,
              peak_total integer, highest_tier_ever text, last_played date,
              days_away integer, decay_applied integer, today_points integer,
              total_before_today integer, badges jsonb, fallback_rows integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT f.* FROM (SELECT DISTINCT r.identity FROM public.whoop_points_rows() r) i
  CROSS JOIN LATERAL public.whoop_points_for(i.identity, p_as_of) f
$$;

-- RPC 1: the caller's own points. An email is only an identity key when it is
-- genuinely linked to this visitor.
CREATE OR REPLACE FUNCTION public.get_whoop_points(p_visitor_id text, p_email text DEFAULT NULL)
RETURNS TABLE(total integer, tier text, today_points integer, total_before_today integer,
              points_to_next_tier integer, next_tier_threshold integer,
              peak_total integer, highest_tier_ever text, badges jsonb,
              days_away integer, decay_applied integer, games_played integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_visitor text := nullif(trim(coalesce(p_visitor_id, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_linked_email text;
  v_identity text;
  v_me record;
  v_next integer;
BEGIN
  IF v_visitor IS NULL THEN
    RETURN QUERY SELECT 0, 'rookie', NULL::int, NULL::int, 25, 25, 0, 'rookie', '[]'::jsonb,
                        NULL::int, 0, 0;
    RETURN;
  END IF;

  IF v_email IS NOT NULL AND public.email_linked_to_visitor(v_visitor, v_email) THEN
    v_linked_email := v_email;
  END IF;

  SELECT coalesce(min(lower(trim(d.email))), v_visitor) INTO v_identity
  FROM public.daily_results d
  WHERE d.visitor_id = v_visitor
    AND nullif(trim(coalesce(d.email, '')), '') IS NOT NULL;

  v_identity := coalesce(v_identity, v_visitor);

  SELECT f.* INTO v_me
  FROM (SELECT coalesce(v_linked_email, v_identity) AS id
        UNION SELECT v_identity
        UNION SELECT v_visitor) ids
  CROSS JOIN LATERAL public.whoop_points_for(ids.id, v_today) f
  ORDER BY f.games_played DESC
  LIMIT 1;

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
$$;

-- RPC 2: aggregate tier population of players active in the last 30 days.
CREATE OR REPLACE FUNCTION public.get_whoop_points_population()
RETURNS TABLE(tier text, players integer, active_total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH active AS (
    SELECT f.tier
    FROM public.whoop_points_active_identities((now() AT TIME ZONE 'utc')::date) a
    CROSS JOIN LATERAL public.whoop_points_for(a.identity, (now() AT TIME ZONE 'utc')::date) f
  ),
  total AS (SELECT count(*)::int AS n FROM active)
  SELECT k.tier, coalesce(c.n, 0)::int, (SELECT n FROM total)
  FROM (VALUES ('rookie'), ('great_eye'), ('match_maker'), ('xray_vision'), ('legend')) AS k(tier)
  LEFT JOIN (SELECT a.tier, count(*) AS n FROM active a GROUP BY 1) c ON c.tier = k.tier
  ORDER BY public.whoop_points_tier_floor(k.tier);
$$;

REVOKE ALL ON FUNCTION public.whoop_points_rows() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_for(text, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_table(date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_points_active_identities(date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whoop_points(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whoop_points_population() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.whoop_points_config() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.whoop_points_tier(integer) TO anon, authenticated, service_role;