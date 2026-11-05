CREATE OR REPLACE FUNCTION public.admin_game_modes(p_from date, p_to date)
RETURNS TABLE(mode text, games_completed integer, median_seconds numeric, avg_players numeric, avg_correct_claims numeric, avg_wrong_claims numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH modes(is_solo, mode) AS (VALUES (true, 'solo'::text), (false, 'together'::text))
  SELECT m.mode,
    COUNT(r.id)::integer,
    ROUND(COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.duration_ms) / 1000.0, 0)::numeric, 1),
    ROUND(COALESCE(AVG(r.player_count), 0)::numeric, 2),
    ROUND(COALESCE(AVG(r.correct_claims), 0)::numeric, 2),
    ROUND(COALESCE(AVG(r.wrong_claims), 0)::numeric, 2)
  FROM modes m
  LEFT JOIN public.classic_results r ON r.is_solo = m.is_solo
    AND r.created_at >= p_from::timestamptz
    AND r.created_at < (p_to + 1)::timestamptz
  WHERE public.is_admin()
  GROUP BY m.mode, m.is_solo
  ORDER BY m.is_solo DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_game_modes(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_game_modes(date, date) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_game_modes(date, date) IS 'Admin-only Solo and Together completed-game aggregates. Claims are game-wide (Solo includes the bot); dates preserve admin_classic created_at semantics. Existing admin_classic remains compatible with the published dashboard.';