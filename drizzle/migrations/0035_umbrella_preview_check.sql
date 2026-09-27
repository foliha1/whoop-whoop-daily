-- One launch switch, server side: lets a signed-in admin preview the
-- umbrella (Parts 1-3) ON version on the live site. Returns is_admin();
-- authenticated only, never anon or PUBLIC, so players and crawlers can
-- never turn the preview on.
CREATE OR REPLACE FUNCTION public.can_preview_umbrella()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.is_admin()
$function$;

REVOKE ALL ON FUNCTION public.can_preview_umbrella() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_preview_umbrella() TO authenticated, service_role;