CREATE OR REPLACE FUNCTION public.admin_contact_totals()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.is_admin() THEN RETURN NULL; END IF;
  WITH confirmed AS (
    SELECT lower(trim(email)) e FROM auth.users WHERE email IS NOT NULL AND email_confirmed_at IS NOT NULL
    UNION SELECT lower(trim(email)) FROM public.daily_subscribers WHERE email IS NOT NULL
  ), c AS (SELECT e FROM confirmed WHERE e NOT IN (SELECT email FROM public.admin_allowlist)),
  pending AS (
    SELECT lower(trim(email)) e FROM auth.users WHERE email IS NOT NULL AND email_confirmed_at IS NULL
    AND lower(trim(email)) NOT IN (SELECT email FROM public.admin_allowlist)
    AND lower(trim(email)) NOT IN (SELECT e FROM c)
  )
  SELECT jsonb_build_object('total', (SELECT count(*) FROM c), 'unconfirmed', (SELECT count(DISTINCT e) FROM pending)) INTO res;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.admin_contact_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contact_totals() TO authenticated;