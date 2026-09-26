REVOKE ALL ON public.classic_timing_samples FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.classic_timing_samples TO service_role;