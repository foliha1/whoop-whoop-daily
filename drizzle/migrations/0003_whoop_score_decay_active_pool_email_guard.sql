-- 1) config: add active_days
CREATE OR REPLACE FUNCTION public.whoop_score_config()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'window_games', 30,
    'consistency_days', 30,
    'active_days', 30,
    'score_min_games', 5,
    'rank_min_games', 10,
    'percentile_min_players', 20,
    'weight_no_peek', 0.4,
    'weight_zero_mistake', 0.4,
    'weight_consistency', 0.2
  )
$function$;

-- 2) scoring table: consistency window anchored on an explicit as-of date.
--    p_as_of NULL keeps the legacy per-player anchor (used for previous_score,
--    whose window must end on that earlier result's own date).
DROP FUNCTION IF EXISTS public.whoop_score_table(integer);
CREATE OR REPLACE FUNCTION public.whoop_score_table(
  p_offset integer DEFAULT 0,
  p_as_of date DEFAULT NULL
)
RETURNS TABLE(identity text, games_counted integer, no_peek_rate numeric,
              zero_mistake_rate numeric, consistency_rate numeric, score integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cfg AS (SELECT public.whoop_score_config() AS c),
  r AS (SELECT * FROM public.whoop_score_rows()),
  ranked AS (
    SELECT r.*, row_number() OVER (PARTITION BY r.identity ORDER BY r.puzzle_number DESC) AS rn
    FROM r
  ),
  windowed AS (
    SELECT ranked.* FROM ranked, cfg
    WHERE ranked.rn > coalesce(p_offset, 0)
      AND ranked.rn <= coalesce(p_offset, 0) + (cfg.c->>'window_games')::int
  ),
  agg AS (
    SELECT w.identity,
           count(*)::int AS games,
           avg(CASE WHEN w.peek_used THEN 0 ELSE 1 END)::numeric AS nopeek,
           avg(CASE WHEN w.total_misses = 0 THEN 1 ELSE 0 END)::numeric AS zero,
           coalesce(p_as_of, max(w.puzzle_date)) AS ref
    FROM windowed w
    GROUP BY w.identity
  ),
  cons AS (
    SELECT a.*,
           least(1::numeric, (
             SELECT count(DISTINCT r2.puzzle_date)
             FROM r r2, cfg
             WHERE r2.identity = a.identity
               AND r2.puzzle_date <= a.ref
               AND r2.puzzle_date > a.ref - (cfg.c->>'consistency_days')::int
           )::numeric / (SELECT (c->>'consistency_days')::numeric FROM cfg)) AS consistency
    FROM agg a
  )
  SELECT c.identity,
         c.games,
         round(c.nopeek, 4),
         round(c.zero, 4),
         round(c.consistency, 4),
         round(100 * (
           (SELECT (cfg.c->>'weight_no_peek')::numeric FROM cfg) * c.nopeek
         + (SELECT (cfg.c->>'weight_zero_mistake')::numeric FROM cfg) * c.zero
         + (SELECT (cfg.c->>'weight_consistency')::numeric FROM cfg) * c.consistency
         ))::int
  FROM cons c;
$function$;

REVOKE ALL ON FUNCTION public.whoop_score_table(integer, date) FROM anon, authenticated;

-- 3) active identities: at least one result in the last active_days
CREATE OR REPLACE FUNCTION public.whoop_score_active_identities(p_as_of date DEFAULT NULL)
RETURNS TABLE(identity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT r.identity
  FROM public.whoop_score_rows() r, (SELECT public.whoop_score_config() AS c) cfg
  WHERE r.puzzle_date > coalesce(p_as_of, (now() AT TIME ZONE 'utc')::date)
                        - (cfg.c->>'active_days')::int
$function$;

REVOKE ALL ON FUNCTION public.whoop_score_active_identities(date) FROM anon, authenticated;

-- 4) caller score: decaying consistency, active-only percentile pool, verified email
CREATE OR REPLACE FUNCTION public.get_whoop_score(p_visitor_id text, p_email text DEFAULT NULL::text)
RETURNS TABLE(score integer, tier text, games_counted integer, no_peek_rate numeric,
              zero_mistake_rate numeric, consistency_rate numeric, previous_score integer,
              next_tier_threshold integer, points_to_next integer, percentile_band integer,
              games_needed integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb := public.whoop_score_config();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_visitor text := nullif(trim(coalesce(p_visitor_id, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_linked_email text;
  v_identity text;
  v_me record;
  v_prev integer;
  v_tier text;
  v_next integer;
  v_eligible integer := 0;
  v_below integer := 0;
  v_band integer;
  v_active boolean := false;
BEGIN
  -- An email is only an identity key when it is already linked to this visitor.
  IF v_visitor IS NOT NULL AND v_email IS NOT NULL THEN
    SELECT v_email INTO v_linked_email
    WHERE EXISTS (SELECT 1 FROM public.daily_results d
                  WHERE d.visitor_id = v_visitor AND lower(trim(d.email)) = v_email)
       OR EXISTS (SELECT 1 FROM public.daily_subscribers s
                  WHERE s.visitor_id = v_visitor AND lower(trim(s.email)) = v_email);
  END IF;

  IF v_visitor IS NULL AND v_linked_email IS NULL THEN
    RETURN QUERY SELECT NULL::int, NULL::text, 0, NULL::numeric, NULL::numeric, NULL::numeric,
                        NULL::int, NULL::int, NULL::int, NULL::int,
                        (cfg->>'score_min_games')::int;
    RETURN;
  END IF;

  -- Resolve the identity whoop_score_rows() files this player's results under.
  IF v_visitor IS NOT NULL THEN
    SELECT coalesce(min(lower(trim(d.email))), v_visitor) INTO v_identity
    FROM public.daily_results d
    WHERE d.visitor_id = v_visitor
      AND nullif(trim(coalesce(d.email, '')), '') IS NOT NULL;
  END IF;

  SELECT t.* INTO v_me
  FROM public.whoop_score_table(0, v_today) t
  WHERE t.identity = v_identity
     OR (v_linked_email IS NOT NULL AND t.identity = v_linked_email)
  ORDER BY t.games_counted DESC
  LIMIT 1;

  IF v_me IS NULL OR v_me.games_counted < (cfg->>'score_min_games')::int THEN
    RETURN QUERY SELECT NULL::int, NULL::text, coalesce(v_me.games_counted, 0),
                        NULL::numeric, NULL::numeric, NULL::numeric,
                        NULL::int, NULL::int, NULL::int, NULL::int,
                        (cfg->>'score_min_games')::int - coalesce(v_me.games_counted, 0);
    RETURN;
  END IF;

  v_tier := public.whoop_score_tier(v_me.score);

  -- Previous score: the window before the latest result, anchored on that
  -- result's own date, so the delta reflects today's game only.
  SELECT t.score INTO v_prev
  FROM public.whoop_score_table(1, NULL) t
  WHERE t.identity = v_me.identity
    AND t.games_counted >= (cfg->>'score_min_games')::int
  LIMIT 1;

  v_next := CASE v_tier
    WHEN 'rookie' THEN 40 WHEN 'tier_2' THEN 55
    WHEN 'tier_3' THEN 70 WHEN 'tier_4' THEN 85 ELSE NULL END;

  SELECT EXISTS (SELECT 1 FROM public.whoop_score_active_identities(v_today) a
                 WHERE a.identity = v_me.identity)
  INTO v_active;

  IF v_active AND v_me.games_counted >= (cfg->>'rank_min_games')::int THEN
    SELECT count(*)::int,
           count(*) FILTER (WHERE t.score < v_me.score)::int
    INTO v_eligible, v_below
    FROM public.whoop_score_table(0, v_today) t
    JOIN public.whoop_score_active_identities(v_today) a ON a.identity = t.identity
    WHERE t.games_counted >= (cfg->>'rank_min_games')::int;

    IF v_eligible >= (cfg->>'percentile_min_players')::int THEN
      v_band := greatest(1, least(100,
        (round(((100::numeric - (100::numeric * v_below / v_eligible)) / 5)) * 5)::int));
    END IF;
  END IF;

  RETURN QUERY SELECT v_me.score, v_tier, v_me.games_counted,
                      v_me.no_peek_rate, v_me.zero_mistake_rate, v_me.consistency_rate,
                      v_prev, v_next,
                      CASE WHEN v_next IS NULL THEN NULL ELSE greatest(0, v_next - v_me.score) END,
                      v_band, NULL::int;
END;
$function$;

-- 5) distribution over the active, rank-eligible pool only
CREATE OR REPLACE FUNCTION public.get_whoop_tier_distribution()
RETURNS TABLE(tier text, players integer, eligible_total integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb := public.whoop_score_config();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_total integer := 0;
BEGIN
  SELECT count(*)::int INTO v_total
  FROM public.whoop_score_table(0, v_today) t
  JOIN public.whoop_score_active_identities(v_today) a ON a.identity = t.identity
  WHERE t.games_counted >= (cfg->>'rank_min_games')::int;

  IF v_total < (cfg->>'percentile_min_players')::int THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT k.tier, coalesce(c.n, 0)::int, v_total
  FROM (VALUES ('rookie'), ('tier_2'), ('tier_3'), ('tier_4'), ('legend')) AS k(tier)
  LEFT JOIN (
    SELECT public.whoop_score_tier(t.score) AS tier, count(*) AS n
    FROM public.whoop_score_table(0, v_today) t
    JOIN public.whoop_score_active_identities(v_today) a ON a.identity = t.identity
    WHERE t.games_counted >= (cfg->>'rank_min_games')::int
    GROUP BY 1
  ) c ON c.tier = k.tier
  ORDER BY public.whoop_score_tier_floor(k.tier);
END;
$function$;