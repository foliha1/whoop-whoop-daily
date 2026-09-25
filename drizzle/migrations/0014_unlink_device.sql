CREATE OR REPLACE FUNCTION public.unlink_device(p_visitor_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (
    DELETE FROM public.player_devices
    WHERE user_id = auth.uid() AND visitor_id = p_visitor_id
    RETURNING 1
  )
  SELECT auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.unlink_device(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unlink_device(text) TO authenticated;