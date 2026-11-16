CREATE OR REPLACE FUNCTION public.public_preorder_proof()
RETURNS TABLE(players bigint, games bigint, dailies bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT
  (SELECT count(DISTINCT coalesce(r.user_id::text, pd.user_id::text, r.visitor_id)) FROM public.daily_results r LEFT JOIN public.player_devices pd ON pd.visitor_id = r.visitor_id),
  (SELECT count(*) FROM public.daily_results),
  (SELECT count(DISTINCT r.puzzle_date) FROM public.daily_results r);
$$;
REVOKE ALL ON FUNCTION public.public_preorder_proof() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_preorder_proof() TO anon, authenticated;