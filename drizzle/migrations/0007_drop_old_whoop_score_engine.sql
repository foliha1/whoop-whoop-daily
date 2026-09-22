-- The rolling-average Whoop Score engine is retired: the points engine
-- (`get_whoop_points`, `get_whoop_points_population`) is now the only score the
-- app reads. Drop the old surface so nothing can call it by accident.
--
-- Nothing in the daily-percentile chain (`daily_rows_for`, the percentile
-- functions) or the points engine depends on these, so the drops are safe.
DROP FUNCTION IF EXISTS public.get_whoop_score(text, text);
DROP FUNCTION IF EXISTS public.get_whoop_tier_distribution();
DROP FUNCTION IF EXISTS public.whoop_score_active_identities(date);
DROP FUNCTION IF EXISTS public.whoop_score_table(text, text, integer, date);
DROP FUNCTION IF EXISTS public.whoop_score_table(integer);
DROP FUNCTION IF EXISTS public.whoop_score_rows();
DROP FUNCTION IF EXISTS public.whoop_score_tier_floor(text);
DROP FUNCTION IF EXISTS public.whoop_score_tier(integer);
DROP FUNCTION IF EXISTS public.whoop_score_config();