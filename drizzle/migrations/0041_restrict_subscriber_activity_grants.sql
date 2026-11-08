REVOKE ALL ON TABLE public.subscriber_activity FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscriber_activity TO authenticated;
GRANT ALL ON TABLE public.subscriber_activity TO service_role;