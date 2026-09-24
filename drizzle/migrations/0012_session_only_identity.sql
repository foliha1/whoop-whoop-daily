-- Identity comes only from the session (auth.uid()) or, for anonymous play,
-- the caller's visitor_id. A client-supplied email is never an identity.
-- Grandfathered: result rows stamped with an email before accounts, and
-- subscriber records created before this migration, still bridge that
-- player's old browsers. No new bridge can be created from a typed email.
-- Each function is rewritten from its live definition; every edit must match.

CREATE OR REPLACE FUNCTION pg_temp.rw(p_sig text, p_pairs text[], p_drop boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $rw$
DECLARE d text; n text; i int;
BEGIN
  d := pg_get_functiondef(p_sig::regprocedure);
  FOR i IN 1 .. coalesce(array_length(p_pairs, 1), 0) BY 2 LOOP
    n := regexp_replace(d, p_pairs[i], p_pairs[i + 1], 'g');
    IF n = d THEN RAISE EXCEPTION 'rewrite of % did not match: %', p_sig, p_pairs[i]; END IF;
    d := n;
  END LOOP;
  IF p_drop THEN EXECUTE 'DROP FUNCTION ' || p_sig; END IF;
  EXECUTE d;
END $rw$;

DROP FUNCTION IF EXISTS public.email_has_history(text);
DROP FUNCTION IF EXISTS public.get_subscriber_email(text);
DROP FUNCTION IF EXISTS public.link_group_email(text, text);

-- Subscribing stores an address; it never stamps it onto results.
SELECT pg_temp.rw('public.subscribe_daily(text,text,text)',
  ARRAY['\s*PERFORM public\.backfill_result_emails\([^;]*\);', ''], false);
SELECT pg_temp.rw('public.subscribe_daily(text,text)',
  ARRAY['\s*PERFORM public\.backfill_result_emails\([^;]*\);', ''], false);
DROP FUNCTION IF EXISTS public.backfill_result_emails(text, text, integer);

-- Readers: no email argument; caller visitor rows plus the session account.
SELECT pg_temp.rw('public.daily_rows_for(text,text)', ARRAY['p_visitor_id text, p_email text\)', 'p_visitor_id text)'], false);
SELECT pg_temp.rw('public.get_streak(text,integer,text)', ARRAY[
  ', p_email text DEFAULT NULL::text\)', ')',
  'AND nullif\(trim\(coalesce\(p_email, ''''\)\), ''''\) IS NULL', 'AND auth.uid() IS NULL',
  'daily_rows_for\(p_visitor_id, p_email\)', 'daily_rows_for(p_visitor_id)'], false);
SELECT pg_temp.rw('public.get_daily_stats(text,text)', ARRAY[
  ', p_email text DEFAULT NULL::text\)', ')',
  'AND nullif\(trim\(coalesce\(p_email, ''''\)\), ''''\) IS NULL', 'AND auth.uid() IS NULL',
  'daily_rows_for\(p_visitor_id, p_email\)', 'daily_rows_for(p_visitor_id)',
  'get_streak\(p_visitor_id, NULL, p_email\)', 'get_streak(p_visitor_id, NULL)'], false);
SELECT pg_temp.rw('public.get_daily_percentile(text,integer,text)', ARRAY[
  ', p_email text DEFAULT NULL::text\)', ')',
  'daily_rows_for\(p_visitor_id, p_email\)', 'daily_rows_for(p_visitor_id)'], false);
SELECT pg_temp.rw('public.get_daily_results(text,text)', ARRAY[', p_email text DEFAULT NULL::text\)', ')'], false);
SELECT pg_temp.rw('public.get_first_attempt(text,text,integer)', ARRAY['p_email text, ', ''], false);
SELECT pg_temp.rw('public.get_whoop_points(text,text)', ARRAY[', p_email text DEFAULT NULL::text\)', ')'], false);
SELECT pg_temp.rw('public.get_my_groups(text,text,integer)', ARRAY[
  'p_email text DEFAULT NULL::text, ', '',
  '\s*v_email text := coalesce\([^;]*\);', '',
  'daily_rows_for\(v_visitor, v_email\)', 'daily_rows_for(v_visitor)'], false);

-- Groups: store only the session email; match members by account, not email.
SELECT pg_temp.rw('public.join_daily_group(text,text,text,text)', ARRAY[
  ', p_email text DEFAULT NULL::text\)', ')',
  'v_email text := coalesce\([^;]*\);', 'v_email text := public.session_email();',
  '\s*-- Refuse to store an address[^\n]*\n[^\n]*\n\s*IF NOT public\.email_linked_to_visitor\(v_visitor, v_email\) THEN\s*v_email := NULL;\s*END IF;', '',
  'email = coalesce\(v_email, m\.email\)', 'email = coalesce(v_email, m.email), user_id = coalesce(auth.uid(), m.user_id)'], false);
SELECT pg_temp.rw('public.create_daily_group(text,text,text)', ARRAY[
  'v_email text := nullif\(lower\(btrim\(coalesce\(auth\.jwt\(\) ->> ''email'', ''''\)\)\), ''''\);', 'v_email text := public.session_email();'], false);
SELECT pg_temp.rw('public.get_group_today(uuid,integer,text)', ARRAY[
  '\s*-- An email only widens[^\n]*\n[^\n]*entirely\.', '',
  'CASE WHEN public\.email_linked_to_visitor\(m\.visitor_id, m\.email\)\s*THEN lower\(btrim\(m\.email\)\) END AS em', 'm.user_id AS uid',
  'mem\.em IS NOT NULL AND r\.email = mem\.em', 'mem.uid IS NOT NULL AND r.user_id = mem.uid'], false);
SELECT pg_temp.rw('public.get_group_season(uuid,integer,text)', ARRAY[
  'CASE WHEN public\.email_linked_to_visitor\(m\.visitor_id, m\.email\)\s*THEN lower\(btrim\(m\.email\)\) END AS em', 'm.user_id AS uid',
  'mem\.em IS NOT NULL AND r\.email = mem\.em', 'mem.uid IS NOT NULL AND r.user_id = mem.uid'], false);

-- Saving: identity from session/device link; the email bridge is grandfathered.
SELECT pg_temp.rw('public.save_daily_result(text,integer,date,integer,integer,boolean,jsonb,integer,text)', ARRAY[
  ', p_email text DEFAULT NULL::text\)', ')',
  'WHERE s\.visitor_id = v_visitor\n', E'WHERE s.visitor_id = v_visitor\n          AND s.created_at < timestamptz ''2026-09-24 13:30:00+00''\n',
  'WHERE s\.email = ANY \(v_emails\)\)', 'WHERE s.email = ANY (v_emails) AND s.created_at < timestamptz ''2026-09-24 13:30:00+00'')',
  '\(v_uid IS NOT NULL AND r\.user_id = v_uid\)', '(v_uid IS NOT NULL AND (r.user_id = v_uid OR r.visitor_id IN (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid)))'], false);
SELECT pg_temp.rw('public.link_device_and_merge(text)', ARRAY[
  'WHERE s\.email = v_email AND s\.visitor_id IS NOT NULL', 'WHERE s.email = v_email AND s.visitor_id IS NOT NULL AND s.created_at < timestamptz ''2026-09-24 13:30:00+00'''], false);
SELECT pg_temp.rw('public.delete_account_data(uuid,text)', ARRAY[
  ' OR \(v_email IS NOT NULL AND email = v_email\);', ';'], false);

-- Retire the old email-argument signatures and the email-linkage helpers.
DROP FUNCTION public.daily_rows_for(text, text);
DROP FUNCTION public.get_streak(text, integer, text);
DROP FUNCTION public.get_daily_stats(text, text);
DROP FUNCTION public.get_daily_percentile(text, integer, text);
DROP FUNCTION public.get_daily_results(text, text);
DROP FUNCTION public.get_first_attempt(text, text, integer);
DROP FUNCTION public.get_whoop_points(text, text);
DROP FUNCTION public.get_my_groups(text, text, integer);
DROP FUNCTION public.join_daily_group(text, text, text, text);
DROP FUNCTION public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer, text);
DROP FUNCTION IF EXISTS public.email_linked_to_visitor(text, text);
DROP FUNCTION IF EXISTS public.email_visitor_ids(text);

REVOKE ALL ON FUNCTION public.daily_rows_for(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_rows_for(text) TO service_role;
REVOKE ALL ON FUNCTION public.get_streak(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_streak(text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_daily_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_stats(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_daily_percentile(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_percentile(text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_daily_results(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_results(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_first_attempt(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_first_attempt(text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_whoop_points(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whoop_points(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_groups(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_groups(text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.join_daily_group(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_daily_group(text, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_daily_result(text, integer, date, integer, integer, boolean, jsonb, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid, text) TO service_role;
