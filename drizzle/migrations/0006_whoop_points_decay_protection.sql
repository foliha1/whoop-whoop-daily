-- Decay may only remove points above a protected floor.
CREATE OR REPLACE FUNCTION public.whoop_points_config()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'point_play', 1,
    'point_first_try_max', 3,
    'point_no_peek', 1,
    'max_per_game', 5,
    'grace_days', 7,
    'decay_per_day', 3,
    'decay_protected_points', 25,
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

-- Apply a gap's decay to a running total: nothing below the protected floor,
-- and no decay at all for a total already at or below it.
CREATE OR REPLACE FUNCTION public.whoop_points_apply_decay(
  p_total integer, p_days integer
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  WITH cfg AS (SELECT public.whoop_points_config() AS c)
  SELECT CASE
    WHEN coalesce(p_total, 0) <= (SELECT (c->>'decay_protected_points')::int FROM cfg)
      THEN greatest(0, coalesce(p_total, 0))
    ELSE greatest(
      (SELECT (c->>'decay_protected_points')::int FROM cfg),
      coalesce(p_total, 0)
        - greatest(0, coalesce(p_days, 0) - (SELECT (c->>'grace_days')::int FROM cfg))
          * (SELECT (c->>'decay_per_day')::int FROM cfg)
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.whoop_points_for(p_identity text, p_as_of date DEFAULT NULL)
RETURNS TABLE(identity text, games_played integer, total integer, tier text,
              peak_total integer, highest_tier_ever text, last_played date,
              days_away integer, decay_applied integer, today_points integer,
              total_before_today integer, badges jsonb, fallback_rows integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date);
  r record; t record;
  v_total int := 0; v_peak int := 0; v_games int := 0; v_fallback int := 0;
  v_prev date; v_last date;
  v_today_points int; v_before_today int;
  v_gap int; v_final_decay int := 0;
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
$$;

REVOKE ALL ON FUNCTION public.whoop_points_apply_decay(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whoop_points_apply_decay(integer, integer) TO service_role;
