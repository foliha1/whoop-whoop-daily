-- Optional sign-in: accounts replace email-as-identity.

ALTER TABLE public.daily_results ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS daily_results_user_idx ON public.daily_results (user_id, puzzle_number);
CREATE INDEX IF NOT EXISTS daily_results_email_idx ON public.daily_results (email);

CREATE TABLE IF NOT EXISTS public.player_devices (
  visitor_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.player_devices TO authenticated;
GRANT ALL ON public.player_devices TO service_role;
ALTER TABLE public.player_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own devices readable" ON public.player_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS player_devices_user_idx ON public.player_devices (user_id);

CREATE TABLE IF NOT EXISTS public.reminder_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  consented boolean NOT NULL,
  source text NOT NULL DEFAULT 'post_signin',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reminder_consents TO authenticated;
GRANT ALL ON public.reminder_consents TO service_role;
ALTER TABLE public.reminder_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own consents readable" ON public.reminder_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS reminder_consents_user_idx ON public.reminder_consents (user_id, created_at DESC);

-- The verified email of the signed-in caller, or null. The only email ever trusted.
CREATE OR REPLACE FUNCTION public.session_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL
              THEN nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '') END
$$;

-- Email linkage now means: this is the caller's verified session email.
CREATE OR REPLACE FUNCTION public.email_linked_to_visitor(p_visitor_id text, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.session_email() IS NOT NULL
     AND lower(btrim(coalesce(p_email, ''))) = public.session_email()
$$;

CREATE OR REPLACE FUNCTION public.email_visitor_ids(p_email text)
RETURNS TABLE(visitor_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pd.visitor_id FROM public.player_devices pd
  WHERE auth.uid() IS NOT NULL AND pd.user_id = auth.uid()
    AND lower(btrim(coalesce(p_email, ''))) = public.session_email()
$$;

-- Retired email lookups: reveal nothing.
CREATE OR REPLACE FUNCTION public.get_subscriber_email(p_visitor_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT NULL::text $$;
CREATE OR REPLACE FUNCTION public.email_has_history(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.backfill_result_emails(p_visitor_id text, p_email text, p_limit integer DEFAULT 500)
RETURNS TABLE(updated_rows integer, collisions integer) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 0, 0
$$;

-- Rows belonging to the caller: this browser, plus the account when signed in.
CREATE OR REPLACE FUNCTION public.daily_rows_for(p_visitor_id text, p_email text)
RETURNS TABLE(puzzle_number integer, rounds_solved integer, total_misses integer, elapsed_ms integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (d.puzzle_number) d.puzzle_number, d.rounds_solved, d.total_misses, d.elapsed_ms
  FROM public.daily_results d
  WHERE (nullif(btrim(coalesce(p_visitor_id, '')), '') IS NOT NULL AND d.visitor_id = p_visitor_id)
     OR (auth.uid() IS NOT NULL AND d.user_id = auth.uid())
  ORDER BY d.puzzle_number, d.created_at ASC, d.id ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_results(p_visitor_id text, p_email text DEFAULT NULL::text)
RETURNS TABLE(puzzle_number integer, puzzle_date date, rounds_solved integer, total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (r.puzzle_number)
         r.puzzle_number, r.puzzle_date, r.rounds_solved, r.total_misses,
         r.peek_used, r.round_events, r.elapsed_ms, r.created_at
  FROM public.daily_results r
  WHERE (nullif(btrim(coalesce(p_visitor_id, '')), '') IS NOT NULL AND r.visitor_id = p_visitor_id)
     OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
  ORDER BY r.puzzle_number ASC, r.created_at ASC, r.id ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_first_attempt(p_visitor_id text, p_email text, p_puzzle_number integer)
RETURNS TABLE(is_mine boolean, puzzle_number integer, puzzle_date date, rounds_solved integer, total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (r.visitor_id = btrim(coalesce(p_visitor_id,''))), r.puzzle_number, r.puzzle_date,
         r.rounds_solved, r.total_misses, r.peek_used, r.round_events, r.elapsed_ms, r.created_at
  FROM public.daily_results r
  WHERE r.puzzle_number = p_puzzle_number
    AND (r.visitor_id = btrim(coalesce(p_visitor_id,''))
         OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid()))
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.save_daily_result(p_visitor_id text, p_puzzle_number integer, p_puzzle_date date, p_rounds_solved integer, p_total_misses integer, p_peek_used boolean, p_round_events jsonb, p_elapsed_ms integer, p_email text DEFAULT NULL::text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_per_visitor_per_day constant integer := 10;
  c_per_ip_per_day constant integer := 40;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_date date := coalesce(p_puzzle_date, (now() AT TIME ZONE 'utc')::date);
  v_uid uuid := auth.uid();
  v_email text := public.session_email();
  v_emails text[];
  v_reason text;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN false; END IF;

  v_reason := public.daily_result_reject_reason(
    p_puzzle_number, v_date, p_rounds_solved, p_total_misses, p_round_events, p_elapsed_ms);
  IF v_reason IS NOT NULL THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number,
            jsonb_build_object('reason', v_reason, 'elapsed_ms', p_elapsed_ms));
    RETURN false;
  END IF;

  -- A browser linked to an account keeps saving to it even when signed out.
  IF v_uid IS NULL THEN
    SELECT pd.user_id INTO v_uid FROM public.player_devices pd WHERE pd.visitor_id = v_visitor;
  END IF;

  -- Emails known server-side for this browser (never taken from the client).
  SELECT array_agg(DISTINCT e) INTO v_emails FROM (
    SELECT v_email AS e
    UNION SELECT s.email FROM public.daily_subscribers s WHERE s.visitor_id = v_visitor
    UNION SELECT lower(btrim(r.email)) FROM public.daily_results r
          WHERE r.visitor_id = v_visitor AND r.email IS NOT NULL
  ) x WHERE e IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM public.daily_results r
    WHERE r.puzzle_number = p_puzzle_number AND r.visitor_id <> v_visitor
      AND ((v_uid IS NOT NULL AND r.user_id = v_uid)
           OR (v_emails IS NOT NULL AND (r.email = ANY (v_emails)
               OR r.visitor_id IN (SELECT s.visitor_id FROM public.daily_subscribers s
                                   WHERE s.email = ANY (v_emails)))))
  ) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number,
            jsonb_build_object('reason', 'duplicate_attempt'));
    RETURN false;
  END IF;

  IF NOT public.rl_hit('daily_result_visitor', v_visitor, c_per_visitor_per_day) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'rate_limit_visitor'));
    RETURN false;
  END IF;
  IF NOT public.rl_hit('daily_result_ip', public.request_ip(), c_per_ip_per_day) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'rate_limit_ip'));
    RETURN false;
  END IF;

  INSERT INTO public.daily_results (
    visitor_id, puzzle_number, puzzle_date, rounds_solved,
    total_misses, peek_used, round_events, elapsed_ms, email, user_id
  ) VALUES (
    v_visitor, p_puzzle_number, v_date, p_rounds_solved, p_total_misses,
    coalesce(p_peek_used, false), p_round_events, p_elapsed_ms, v_email, v_uid
  )
  ON CONFLICT (visitor_id, puzzle_number) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Points identity: account first, then legacy email, then browser.
CREATE OR REPLACE FUNCTION public.whoop_points_rows()
RETURNS TABLE(identity text, puzzle_number integer, puzzle_date date, game_points integer, used_fallback boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH emails AS (
    SELECT d.visitor_id, min(lower(trim(d.email))) AS email
    FROM public.daily_results d
    WHERE nullif(trim(coalesce(d.email, '')), '') IS NOT NULL
    GROUP BY d.visitor_id
  ),
  mapped AS (
    SELECT coalesce(d.user_id::text, e.email, d.visitor_id) AS identity,
           d.puzzle_number, d.puzzle_date, d.created_at, d.id,
           public.whoop_points_game(d.round_events, d.rounds_solved, d.total_misses, d.peek_used) AS game_points,
           (jsonb_typeof(d.round_events) IS DISTINCT FROM 'array') AS used_fallback
    FROM public.daily_results d
    LEFT JOIN emails e ON e.visitor_id = d.visitor_id
  )
  SELECT DISTINCT ON (m.identity, m.puzzle_number)
         m.identity, m.puzzle_number, m.puzzle_date, m.game_points, m.used_fallback
  FROM mapped m
  ORDER BY m.identity, m.puzzle_number, m.created_at ASC, m.id ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_whoop_points(p_visitor_id text, p_email text DEFAULT NULL::text)
RETURNS TABLE(total integer, tier text, today_points integer, total_before_today integer, points_to_next_tier integer, next_tier_threshold integer, peak_total integer, highest_tier_ever text, badges jsonb, days_away integer, decay_applied integer, games_played integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg jsonb := public.whoop_points_config();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_visitor text := nullif(trim(coalesce(p_visitor_id, '')), '');
  v_identity text;
  v_me record;
  v_next integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    v_identity := auth.uid()::text;
  ELSIF v_visitor IS NOT NULL THEN
    SELECT coalesce(
      (SELECT pd.user_id::text FROM public.player_devices pd WHERE pd.visitor_id = v_visitor),
      (SELECT min(lower(trim(d.email))) FROM public.daily_results d
        WHERE d.visitor_id = v_visitor AND d.user_id IS NULL
          AND nullif(trim(coalesce(d.email, '')), '') IS NOT NULL),
      v_visitor) INTO v_identity;
  END IF;

  IF v_identity IS NOT NULL THEN
    SELECT f.* INTO v_me FROM public.whoop_points_for(v_identity, v_today) f;
  END IF;

  IF v_me IS NULL THEN
    RETURN QUERY SELECT 0, 'rookie', NULL::int, NULL::int, 25, 25, 0, 'rookie', '[]'::jsonb,
                        NULL::int, 0, 0;
    RETURN;
  END IF;

  SELECT min(f.floor) INTO v_next
  FROM (SELECT (e.value)::int AS floor FROM jsonb_each_text(cfg->'tiers') e) f
  WHERE f.floor > v_me.total;

  RETURN QUERY SELECT v_me.total, v_me.tier, v_me.today_points, v_me.total_before_today,
    CASE WHEN v_next IS NULL THEN NULL ELSE greatest(0, v_next - v_me.total) END,
    v_next, v_me.peak_total, v_me.highest_tier_ever, v_me.badges,
    v_me.days_away, v_me.decay_applied, v_me.games_played;
END;
$$;

-- First (and every) sign-in: link this browser and merge history.
CREATE OR REPLACE FUNCTION public.link_device_and_merge(p_visitor_id text)
RETURNS TABLE(first_signin boolean, games integer, was_subscriber boolean, reminder_answered boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := public.session_email();
  v_visitor text := nullif(left(btrim(coalesce(p_visitor_id, '')), 100), '');
  v_first boolean;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL THEN RETURN; END IF;

  v_first := NOT EXISTS (SELECT 1 FROM public.player_devices WHERE user_id = v_uid)
         AND NOT EXISTS (SELECT 1 FROM public.daily_results WHERE user_id = v_uid);

  -- This browser always follows the account that signs in on it.
  IF v_visitor IS NOT NULL THEN
    INSERT INTO public.player_devices (visitor_id, user_id) VALUES (v_visitor, v_uid)
    ON CONFLICT (visitor_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = now();
  END IF;

  -- Browsers tied to this email by results or the subscriber record, unless
  -- they already belong to another account.
  INSERT INTO public.player_devices (visitor_id, user_id)
  SELECT DISTINCT x.visitor_id, v_uid FROM (
    SELECT r.visitor_id FROM public.daily_results r WHERE r.email = v_email
    UNION SELECT s.visitor_id FROM public.daily_subscribers s
          WHERE s.email = v_email AND s.visitor_id IS NOT NULL
  ) x
  ON CONFLICT (visitor_id) DO NOTHING;

  UPDATE public.daily_results r
     SET user_id = v_uid, email = coalesce(r.email, v_email)
   WHERE r.user_id IS NULL
     AND (r.email = v_email
          OR r.visitor_id IN (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid));

  UPDATE public.daily_group_members m SET user_id = v_uid
   WHERE m.user_id IS NULL
     AND m.visitor_id IN (SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id = v_uid);

  RETURN QUERY SELECT v_first,
    (SELECT count(DISTINCT r.puzzle_number)::int FROM public.daily_results r WHERE r.user_id = v_uid),
    EXISTS (SELECT 1 FROM public.daily_subscribers s WHERE s.email = v_email),
    EXISTS (SELECT 1 FROM public.reminder_consents c WHERE c.user_id = v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_reminder_consent(p_consented boolean, p_source text DEFAULT 'post_signin')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.session_email() IS NULL OR p_consented IS NULL THEN RETURN false; END IF;
  INSERT INTO public.reminder_consents (user_id, email, consented, source)
  VALUES (auth.uid(), public.session_email(), p_consented,
          CASE WHEN p_source IN ('post_signin','settings') THEN p_source ELSE 'post_signin' END);
  RETURN true;
END;
$$;

-- Reminder state: latest recorded answer, else an existing list signup counts as On.
CREATE OR REPLACE FUNCTION public.get_reminder_status()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE coalesce(
    (SELECT c.consented FROM public.reminder_consents c WHERE c.user_id = auth.uid()
      ORDER BY c.created_at DESC LIMIT 1),
    EXISTS (SELECT 1 FROM public.daily_subscribers s WHERE s.email = public.session_email())) END
$$;

-- Account deletion data wipe; service role only (called by the delete-account function).
CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid, p_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_visitors text[];
  v_n integer;
BEGIN
  SELECT array_agg(visitor_id) INTO v_visitors FROM public.player_devices WHERE user_id = p_user_id;
  v_visitors := coalesce(v_visitors, ARRAY[]::text[]);
  DELETE FROM public.daily_results
   WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors) OR (v_email IS NOT NULL AND email = v_email);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.daily_subscribers WHERE visitor_id = ANY (v_visitors) OR (v_email IS NOT NULL AND email = v_email);
  DELETE FROM public.daily_group_members WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  DELETE FROM public.daily_events WHERE visitor_id = ANY (v_visitors);
  DELETE FROM public.reminder_consents WHERE user_id = p_user_id;
  DELETE FROM public.player_devices WHERE user_id = p_user_id;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.link_device_and_merge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reminder_consent(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reminder_status() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.link_device_and_merge(text) FROM anon;

-- Events: sign-in funnel and account lifecycle.
CREATE OR REPLACE FUNCTION public.log_daily_events(p_visitor_id text, p_events jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allowed constant text[] := ARRAY[
    'ready_viewed','howto_opened','howto_skipped','howto_finished','run_started',
    'round_solved','round_failed','peek_used','run_finished','run_abandoned',
    'share_clicked','subscribe_shown','subscribe_submitted',
    'invite_sent','invite_landed',
    'announcement_shown','announcement_primary_tapped','announcement_dismissed',
    'signin_started','signin_code_sent','signin_verified','signin_failed',
    'account_deleted','reminder_opt_in'
  ];
  c_per_visitor_per_day constant integer := 400;
  c_per_ip_per_day constant integer := 2000;
  v_written integer := 0;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_ip text;
  e jsonb;
  v_event text;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN 0; END IF;
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN RETURN 0; END IF;
  v_ip := public.request_ip();
  FOR e IN SELECT * FROM jsonb_array_elements(p_events) LIMIT 50 LOOP
    v_event := nullif(btrim(coalesce(e->>'event', '')), '');
    IF v_event IS NULL OR NOT (v_event = ANY (v_allowed)) THEN CONTINUE; END IF;
    IF NOT public.rl_hit('daily_events_visitor', v_visitor, c_per_visitor_per_day) THEN EXIT; END IF;
    IF NOT public.rl_hit('daily_events_ip', v_ip, c_per_ip_per_day) THEN EXIT; END IF;
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props, referrer, utm_source)
    VALUES (
      v_visitor, v_event,
      CASE WHEN jsonb_typeof(e->'puzzle_number') = 'number' THEN (e->>'puzzle_number')::integer ELSE NULL END,
      CASE WHEN jsonb_typeof(e->'props') = 'object' THEN e->'props' ELSE NULL END,
      left(nullif(btrim(coalesce(e->>'referrer', '')), ''), 120),
      left(nullif(btrim(coalesce(e->>'utm_source', '')), ''), 60)
    );
    v_written := v_written + 1;
  END LOOP;
  RETURN v_written;
END;
$$;

-- Admin: retention for signed-in players vs anonymous visitors.
CREATE OR REPLACE FUNCTION public.admin_retention_split()
RETURNS TABLE(segment text, players integer, d1_base integer, d1_returned integer, d7_base integer, d7_returned integer, d30_base integer, d30_returned integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY
  WITH ids AS (
    SELECT CASE WHEN r.user_id IS NOT NULL THEN 'signed_in' ELSE 'anonymous' END AS seg,
           coalesce(r.user_id::text, r.visitor_id) AS id, r.puzzle_date
    FROM public.daily_results r
  ), firsts AS (
    SELECT seg, id, min(puzzle_date) AS first_date FROM ids GROUP BY seg, id
  ), agg AS (
    SELECT f.seg, f.id, f.first_date,
      EXISTS (SELECT 1 FROM ids i WHERE i.seg=f.seg AND i.id=f.id AND i.puzzle_date >= f.first_date + 1) AS r1,
      EXISTS (SELECT 1 FROM ids i WHERE i.seg=f.seg AND i.id=f.id AND i.puzzle_date >= f.first_date + 7) AS r7,
      EXISTS (SELECT 1 FROM ids i WHERE i.seg=f.seg AND i.id=f.id AND i.puzzle_date >= f.first_date + 30) AS r30
    FROM firsts f
  )
  SELECT a.seg, count(*)::int,
    count(*) FILTER (WHERE a.first_date <= v_today - 1)::int,
    count(*) FILTER (WHERE a.first_date <= v_today - 1 AND a.r1)::int,
    count(*) FILTER (WHERE a.first_date <= v_today - 7)::int,
    count(*) FILTER (WHERE a.first_date <= v_today - 7 AND a.r7)::int,
    count(*) FILTER (WHERE a.first_date <= v_today - 30)::int,
    count(*) FILTER (WHERE a.first_date <= v_today - 30 AND a.r30)::int
  FROM agg a GROUP BY a.seg ORDER BY a.seg DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_signin_funnel(p_days integer DEFAULT 30)
RETURNS TABLE(event text, total integer, visitors integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY SELECT e.event, count(*)::int, count(DISTINCT e.visitor_id)::int
  FROM public.daily_events e
  WHERE e.event IN ('signin_started','signin_code_sent','signin_verified','signin_failed','account_deleted','reminder_opt_in')
    AND e.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days,30),1),365))
  GROUP BY e.event ORDER BY 2 DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_retention_split() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_signin_funnel(integer) TO authenticated;