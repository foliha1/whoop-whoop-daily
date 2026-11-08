CREATE TABLE public.subscriber_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 email_hint text NOT NULL,
 source text NOT NULL,
 puzzle_number integer,
 ac_status text NOT NULL CHECK (ac_status IN ('pending','succeeded','failed','skipped')),
 seed_status text NOT NULL CHECK (seed_status IN ('pending','succeeded','failed','skipped')),
 seeded_at timestamptz,
 completed_at timestamptz
);
GRANT SELECT ON public.subscriber_activity TO authenticated;
GRANT ALL ON public.subscriber_activity TO service_role;
ALTER TABLE public.subscriber_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriber_activity_admin_read ON public.subscriber_activity FOR SELECT TO authenticated USING (public.is_admin());
CREATE INDEX subscriber_activity_created_at_idx ON public.subscriber_activity (created_at DESC);
CREATE FUNCTION public.admin_subscriber_activity(p_from date, p_to date)
RETURNS SETOF public.subscriber_activity
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT a.* FROM public.subscriber_activity a
 WHERE public.is_admin()
 AND a.created_at >= p_from::timestamptz
 AND a.created_at < (p_to + 1)::timestamptz
 ORDER BY a.created_at DESC, a.id DESC LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.admin_subscriber_activity(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscriber_activity(date,date) TO authenticated;
COMMENT ON TABLE public.subscriber_activity IS 'Server-written saved signup attempts; masked email only; pending means no completion was recorded. Not historical backfill.';