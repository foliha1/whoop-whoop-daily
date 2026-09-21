-- ============================================================================
-- Whoop Score engine. Daily results only; Classic never feeds this.
-- Constants live in whoop_score_config(); tiers in whoop_score_tier().
-- ============================================================================

CREATE OR REPLACE FUNCTION public.whoop_score_config()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'window_games', 30,
    'consistency_days', 30,
    'score_min_games', 5,
    'rank_min_games', 10,
    'percentile_min_players', 20,
    'weight_no_peek', 0.4,
    'weight_zero_mistake', 0.4,
    'weight_consistency', 0.2
  )
$$;

CREATE OR REPLACE FUNCTION public.whoop_score_tier(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_score IS NULL THEN NULL
    WHEN p_score >= 85 THEN 'legend'
    WHEN p_score >= 70 THEN 'tier_4'
    WHEN p_score >= 55 THEN 'tier_3'
    WHEN p_score >= 40 THEN 'tier_2'
    ELSE 'rookie'
  END
$$;

CREATE OR REPLACE FUNCTION public.whoop_score_tier_floor(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_tier
    WHEN 'rookie' THEN 0
    WHEN 'tier_2' THEN 40
    WHEN 'tier_3' THEN 55
    WHEN 'tier_4' THEN 70
    WHEN 'legend' THEN 85
  END
$$;

-- One row per (identity, puzzle) with identity = email when known, else visitor_id.
CREATE OR REPLACE FUNCTION public.whoop_score_rows()
RETURNS TABLE(identity text, puzzle_number integer, puzzle_date date, peek_used boolean, total_misses integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH emails AS (
    SELECT d.visitor_id, min(lower(trim(d.email))) AS email
    FROM public.daily_results d
    WHERE nullif(trim(coalesce(d.email, '')), '') IS NOT NULL
    GROUP BY d.visitor_id
  ),
  mapped AS (
    SELECT coalesce(e.email, d.visitor_id) AS identity,
           d.puzzle_number, d.puzzle_date, d.peek_used, d.total_misses
    FROM public.daily_results d
    LEFT JOIN emails e ON e.visitor_id = d.visitor_id
  )
  SELECT DISTINCT ON (m.identity, m.puzzle_number)
         m.identity, m.puzzle_number, m.puzzle_date, m.peek_used, m.total_misses
  FROM mapped m
  ORDER BY m.identity, m.puzzle_number, m.peek_used ASC, m.total_misses ASC;
$$;

-- Every identity's score over the window ending p_offset results back.
CREATE OR REPLACE FUNCTION public.whoop_score_table(p_offset integer DEFAULT 0)
RETURNS TABLE(identity text, games_counted integer, no_peek_rate numeric,
              zero_mistake_rate numeric, consistency_rate numeric, score integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
           max(w.puzzle_date) AS ref
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
$$;

-- RPC 1: the caller's own score. Never exposes another player's figures.
CREATE OR REPLACE FUNCTION public.get_whoop_score(p_visitor_id text, p_email text DEFAULT NULL)
RETURNS TABLE(score integer, tier text, games_counted integer,
              no_peek_rate numeric, zero_mistake_rate numeric, consistency_rate numeric,
              previous_score integer, next_tier_threshold integer, points_to_next integer,
              percentile_band integer, games_needed integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg jsonb := public.whoop_score_config();
  v_identity text;
  v_me record;
  v_prev integer;
  v_tier text;
  v_next integer;
  v_eligible integer := 0;
  v_below integer := 0;
  v_band integer;
BEGIN
  IF nullif(trim(coalesce(p_email, '')), '') IS NOT NULL THEN
    v_identity := lower(trim(p_email));
  ELSE
    v_identity := nullif(trim(coalesce(p_visitor_id, '')), '');
  END IF;

  IF v_identity IS NULL THEN
    RETURN QUERY SELECT NULL::int, NULL::text, 0, NULL::numeric, NULL::numeric, NULL::numeric,
                        NULL::int, NULL::int, NULL::int, NULL::int,
                        (cfg->>'score_min_games')::int;
    RETURN;
  END IF;

  -- The visitor's rows may be filed under an email identity; resolve both ways.
  SELECT t.* INTO v_me
  FROM public.whoop_score_table(0) t
  WHERE t.identity = v_identity
     OR t.identity = (
       SELECT r.identity FROM public.whoop_score_rows() r
       WHERE r.identity = v_identity LIMIT 1
     )
  LIMIT 1;

  IF v_me IS NULL AND nullif(trim(coalesce(p_visitor_id, '')), '') IS NOT NULL THEN
    SELECT t.* INTO v_me
    FROM public.whoop_score_table(0) t
    WHERE t.identity = trim(p_visitor_id)
    LIMIT 1;
  END IF;

  IF v_me IS NULL OR v_me.games_counted < (cfg->>'score_min_games')::int THEN
    RETURN QUERY SELECT NULL::int, NULL::text, coalesce(v_me.games_counted, 0),
                        NULL::numeric, NULL::numeric, NULL::numeric,
                        NULL::int, NULL::int, NULL::int, NULL::int,
                        (cfg->>'score_min_games')::int - coalesce(v_me.games_counted, 0);
    RETURN;
  END IF;

  v_tier := public.whoop_score_tier(v_me.score);

  SELECT t.score INTO v_prev
  FROM public.whoop_score_table(1) t
  WHERE t.identity = v_me.identity
    AND t.games_counted >= (cfg->>'score_min_games')::int
  LIMIT 1;

  v_next := CASE v_tier
    WHEN 'rookie' THEN 40 WHEN 'tier_2' THEN 55
    WHEN 'tier_3' THEN 70 WHEN 'tier_4' THEN 85 ELSE NULL END;

  IF v_me.games_counted >= (cfg->>'rank_min_games')::int THEN
    SELECT count(*)::int,
           count(*) FILTER (WHERE t.score < v_me.score)::int
    INTO v_eligible, v_below
    FROM public.whoop_score_table(0) t
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
$$;

-- RPC 2: aggregate tier distribution only.
CREATE OR REPLACE FUNCTION public.get_whoop_tier_distribution()
RETURNS TABLE(tier text, players integer, eligible_total integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg jsonb := public.whoop_score_config();
  v_total integer := 0;
BEGIN
  SELECT count(*)::int INTO v_total
  FROM public.whoop_score_table(0) t
  WHERE t.games_counted >= (cfg->>'rank_min_games')::int;

  IF v_total < (cfg->>'percentile_min_players')::int THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT k.tier,
         coalesce(c.n, 0)::int,
         v_total
  FROM (VALUES ('rookie'), ('tier_2'), ('tier_3'), ('tier_4'), ('legend')) AS k(tier)
  LEFT JOIN (
    SELECT public.whoop_score_tier(t.score) AS tier, count(*) AS n
    FROM public.whoop_score_table(0) t
    WHERE t.games_counted >= (cfg->>'rank_min_games')::int
    GROUP BY 1
  ) c ON c.tier = k.tier
  ORDER BY public.whoop_score_tier_floor(k.tier);
END;
$$;

REVOKE ALL ON FUNCTION public.whoop_score_rows() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.whoop_score_table(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_score_config() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_score_tier(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whoop_score(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_whoop_tier_distribution() TO anon, authenticated;