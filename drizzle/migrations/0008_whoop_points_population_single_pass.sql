-- The population RPC recomputed the whole results table once per player (93
-- full passes), which blew past the API's statement timeout and made the tier
-- comparison on /you silently disappear.
--
-- Same numbers, one pass: walk every identity's rows in a single ordered scan,
-- carrying the running total exactly as `whoop_points_for` does — play, gap
-- decay past the grace window, protection of the first N points, floor at zero,
-- then the final decay up to today.
CREATE OR REPLACE FUNCTION public.whoop_points_all(p_as_of date DEFAULT NULL)
RETURNS TABLE(identity text, games_played integer, total integer, tier text,
              peak_total integer, highest_tier_ever text, last_played date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_grace int := (cfg->>'grace_days')::int;
  v_rate int := (cfg->>'decay_per_day')::int;
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date);
  r record;
  v_id text; v_total int; v_peak int; v_games int;
  v_prev date; v_last date;
BEGIN
  FOR r IN
    SELECT w.identity, w.puzzle_date, w.puzzle_number, w.game_points
    FROM public.whoop_points_rows() w
    WHERE w.puzzle_date <= v_as_of
    ORDER BY w.identity, w.puzzle_date, w.puzzle_number
  LOOP
    IF v_id IS DISTINCT FROM r.identity THEN
      -- Close out the previous identity.
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
$$;

CREATE OR REPLACE FUNCTION public.get_whoop_points_population()
RETURNS TABLE(tier text, players integer, active_total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH cfg AS (SELECT public.whoop_points_config() AS c),
  today AS (SELECT (now() AT TIME ZONE 'utc')::date AS d),
  active AS (
    SELECT a.*
    FROM public.whoop_points_all((SELECT d FROM today)) a, cfg, today
    WHERE a.last_played > today.d - (cfg.c->>'active_days')::int
  ),
  tiers AS (SELECT e.key AS tier, (e.value)::int AS floor
            FROM cfg, jsonb_each_text(cfg.c->'tiers') e)
  SELECT t.tier,
         count(a.identity)::int AS players,
         (SELECT count(*)::int FROM active) AS active_total
  FROM tiers t
  LEFT JOIN active a ON a.tier = t.tier
  GROUP BY t.tier, t.floor
  ORDER BY t.floor;
$$;

GRANT EXECUTE ON FUNCTION public.whoop_points_all(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whoop_points_population() TO anon, authenticated, service_role;