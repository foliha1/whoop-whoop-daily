DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.log_analytics_events(text,jsonb)'::regprocedure) INTO definition;
 IF position('''preorder_view''' in definition) = 0 THEN
  definition := replace(definition, '''easter_egg_found'',''rules_view'',''rules_qr_scan''', '''easter_egg_found'',''rules_view'',''rules_qr_scan'',''preorder_view'',''preorder_click''');
  IF position('''preorder_view''' in definition) = 0 THEN RAISE EXCEPTION 'Analytics allowlist not found'; END IF;
  EXECUTE definition;
 END IF;
END $migration$;
CREATE OR REPLACE FUNCTION public.public_daily_player_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT count(DISTINCT coalesce(r.user_id::text, pd.user_id::text, r.visitor_id)) FROM public.daily_results r LEFT JOIN public.player_devices pd ON pd.visitor_id = r.visitor_id; $$;
REVOKE ALL ON FUNCTION public.public_daily_player_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_daily_player_count() TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.admin_preorder(p_from date, p_to date)
RETURNS TABLE(views bigint, clicks bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$ BEGIN
 IF NOT public.is_admin() THEN RETURN; END IF;
 RETURN QUERY SELECT count(*) FILTER (WHERE event_type = 'preorder_view'), count(*) FILTER (WHERE event_type = 'preorder_click') FROM public.analytics_events WHERE event_type IN ('preorder_view','preorder_click') AND created_at >= p_from::timestamptz AND created_at < (p_to + 1)::timestamptz;
END; $$;
REVOKE ALL ON FUNCTION public.admin_preorder(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preorder(date,date) TO authenticated;