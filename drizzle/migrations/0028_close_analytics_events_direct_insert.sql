DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
REVOKE INSERT ON public.analytics_events FROM anon, authenticated;