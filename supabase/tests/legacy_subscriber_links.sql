-- Live checks for the frozen legacy subscriber links. Run: psql -v ON_ERROR_STOP=1 -f <this file>
-- Everything runs inside a transaction that is rolled back.
BEGIN;
DO $$
DECLARE
  v_old text := '6c74af2d-fd9f-4c17-af71-a96bde19e76f';
  v_new text := gen_random_uuid()::text;
  v_email text;
  r record;
BEGIN
  -- 1. The subscriber-linked first browser resolves to the same player as its stamped browsers.
  SELECT * INTO r FROM public.whoop_points_for(public.legacy_email_for(v_old));
  IF r.total <> 46 OR r.games_played <> 19 THEN
    RAISE EXCEPTION 'check 1 failed: % pts / % games', r.total, r.games_played;
  END IF;

  -- 2. A brand-new browser has no link and no score.
  IF public.legacy_email_for(v_new) IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.whoop_points_rows() w WHERE w.identity = v_new) THEN
    RAISE EXCEPTION 'check 2 failed: new browser resolved to someone';
  END IF;

  -- 3. Subscribing an existing email from a new browser links nothing:
  --    the snapshot is frozen, and no resolver reads live daily_subscribers.
  SELECT email INTO v_email FROM public.legacy_subscriber_links WHERE visitor_id = v_old;
  BEGIN
    INSERT INTO public.legacy_subscriber_links(visitor_id, email, subscribed_at) VALUES (v_new, v_email, now());
    RAISE EXCEPTION 'check 3 failed: snapshot accepted a new link';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'check 3%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.legacy_subscriber_links SET visitor_id = v_new WHERE visitor_id = v_old;
    RAISE EXCEPTION 'check 3 failed: snapshot accepted an update';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'check 3%' THEN RAISE; END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('legacy_email_for', 'whoop_points_rows', 'get_whoop_points', 'whoop_points_for', 'daily_rows_for')
      AND pg_get_functiondef(p.oid) ILIKE '%daily_subscribers%') THEN
    RAISE EXCEPTION 'check 3 failed: a resolver reads live daily_subscribers';
  END IF;
  IF public.legacy_email_for(v_new) IS NOT NULL THEN
    RAISE EXCEPTION 'check 3 failed: new browser linked';
  END IF;

  RAISE NOTICE 'legacy subscriber link checks passed';
END $$;
ROLLBACK;
