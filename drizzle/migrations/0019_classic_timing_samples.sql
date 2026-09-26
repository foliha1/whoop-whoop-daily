CREATE TABLE public.classic_timing_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('tap','frames')),
  role text NOT NULL CHECK (role IN ('host','joiner')),
  browser text NOT NULL,
  in_app_instagram boolean NOT NULL DEFAULT false,
  surface text,
  tap_to_host_ms integer,
  host_to_send_ms integer,
  send_to_paint_ms integer,
  total_ms integer,
  window_ms integer,
  long_frames integer,
  dropped_frames integer
);
GRANT ALL ON public.classic_timing_samples TO service_role;
ALTER TABLE public.classic_timing_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read timing samples" ON public.classic_timing_samples
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.classic_timing_samples TO authenticated;

-- Rate-capped write path: at most 40 batches per IP per day, 50 samples per batch,
-- values clamped. No identity is stored.
CREATE OR REPLACE FUNCTION public.log_classic_timing(p_samples jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
  s jsonb;
  clamp_ms constant integer := 60000;
BEGIN
  IF p_samples IS NULL OR jsonb_typeof(p_samples) <> 'array' THEN RETURN 0; END IF;
  IF NOT public.rl_hit('classic_timing', coalesce(public.request_ip(), 'unknown'), 40) THEN RETURN 0; END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(p_samples) LIMIT 50 LOOP
    IF (s->>'kind') NOT IN ('tap','frames') OR (s->>'role') NOT IN ('host','joiner') THEN CONTINUE; END IF;
    INSERT INTO public.classic_timing_samples(kind, role, browser, in_app_instagram, surface,
      tap_to_host_ms, host_to_send_ms, send_to_paint_ms, total_ms, window_ms, long_frames, dropped_frames)
    VALUES (
      s->>'kind', s->>'role',
      CASE WHEN (s->>'browser') IN ('chrome','safari','firefox','edge','samsung','other') THEN s->>'browser' ELSE 'other' END,
      coalesce((s->>'ig')::boolean, false),
      CASE WHEN (s->>'surface') IN ('flip','pulse','roll') THEN s->>'surface' ELSE NULL END,
      least(greatest((s->>'tap_to_host_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'host_to_send_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'send_to_paint_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'total_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'window_ms')::integer, 0), clamp_ms),
      least(greatest((s->>'long_frames')::integer, 0), 10000),
      least(greatest((s->>'dropped_frames')::integer, 0), 10000)
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
EXCEPTION WHEN others THEN
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.log_classic_timing(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_classic_timing(jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_classic_timing(p_from date, p_to date)
RETURNS TABLE(kind text, surface text, role text, browser text, in_app_instagram boolean,
  samples integer, p50_ms numeric, p95_ms numeric, p50_dropped numeric, p95_dropped numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT kind, surface, role, browser, in_app_instagram, COUNT(*)::integer,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms)::numeric, 0),
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms)::numeric, 0),
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY dropped_frames)::numeric, 1),
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY dropped_frames)::numeric, 1)
  FROM public.classic_timing_samples
  WHERE public.is_admin()
    AND created_at >= p_from::timestamptz AND created_at < (p_to + 1)::timestamptz
  GROUP BY kind, surface, role, browser, in_app_instagram
  ORDER BY kind, surface, role, browser, in_app_instagram;
$$;
REVOKE ALL ON FUNCTION public.admin_classic_timing(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_classic_timing(date, date) TO authenticated, service_role;