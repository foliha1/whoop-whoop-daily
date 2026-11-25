CREATE OR REPLACE FUNCTION public.admin_export_contacts()
RETURNS TABLE(email text, daily_reminders boolean, has_account boolean, source text, synced_to_ac boolean, first_seen timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY
  WITH subs AS (
    SELECT lower(trim(s.email)) e, min(s.source) src, bool_or(s.synced_to_ac) synced, min(s.created_at) at
    FROM public.daily_subscribers s GROUP BY 1
  ), accts AS (
    SELECT lower(trim(u.email)) e, min(u.created_at) at
    FROM auth.users u WHERE u.email IS NOT NULL AND u.email <> '' AND u.email_confirmed_at IS NOT NULL GROUP BY 1
  )
  SELECT coalesce(s.e, a.e), s.e IS NOT NULL, a.e IS NOT NULL,
    coalesce(s.src, 'signin'), coalesce(s.synced, false), least(s.at, a.at)
  FROM subs s FULL OUTER JOIN accts a ON a.e = s.e
  ORDER BY 6 ASC;
  INSERT INTO public.daily_events (visitor_id, event, props)
  VALUES (left('admin:' || v_email, 100), 'admin_subscriber_export', jsonb_build_object('kind', 'contacts', 'admin_email', v_email));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_export_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_contacts() TO authenticated, service_role;