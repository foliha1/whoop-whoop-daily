-- Admin overview (Nov 2026): one lifetime report for the redesigned /admin page,
-- with admin and test activity left out by default.
--
-- Left out when p_hide_admin is true:
--   * every signed-in admin account (admin_allowlist emails),
--   * every browser an admin account ever signed in on (player_devices),
--   * every browser an admin tagged with "This is me" (admin_excluded_browsers).
-- People are counted by browser (visitor_id), so one person on two devices
-- counts twice; the report is for trends, not exact headcounts.

CREATE TABLE IF NOT EXISTS public.admin_excluded_browsers (
  visitor_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_excluded_browsers ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER functions below touch it.

-- Visitor ids to leave out. Private helper.
CREATE OR REPLACE FUNCTION public.admin_hidden_visitors()
RETURNS TABLE(visitor_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH adm AS (
    SELECT u.id FROM auth.users u
    WHERE lower(trim(u.email)) IN (SELECT email FROM public.admin_allowlist)
  )
  SELECT pd.visitor_id FROM public.player_devices pd WHERE pd.user_id IN (SELECT id FROM adm) AND pd.visitor_id IS NOT NULL
  UNION SELECT e.visitor_id FROM public.admin_excluded_browsers e
  UNION SELECT r.visitor_id FROM public.daily_results r WHERE r.user_id IN (SELECT id FROM adm) AND r.visitor_id IS NOT NULL
  UNION SELECT s.visitor_id FROM public.solo_games s WHERE s.user_id IN (SELECT id FROM adm) AND s.visitor_id IS NOT NULL
  UNION SELECT m.visitor_id FROM public.room_members m WHERE m.user_id IN (SELECT id FROM adm) AND m.visitor_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.admin_hidden_visitors() FROM PUBLIC, anon, authenticated;

-- "This is me": leave this browser out of every overview number.
CREATE OR REPLACE FUNCTION public.admin_tag_browser(p_visitor_id text, p_hide boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN false; END IF;
  IF p_visitor_id IS NULL OR length(p_visitor_id) NOT BETWEEN 8 AND 100 THEN RETURN false; END IF;
  IF p_hide THEN
    INSERT INTO public.admin_excluded_browsers(visitor_id) VALUES (p_visitor_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.admin_excluded_browsers WHERE visitor_id = p_visitor_id;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_tag_browser(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tag_browser(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_overview(p_hide_admin boolean DEFAULT true, p_visitor_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  out jsonb;
  today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF NOT public.is_admin() THEN RETURN NULL; END IF;

  WITH hidden AS (
    SELECT visitor_id FROM public.admin_hidden_visitors() WHERE p_hide_admin
  ),
  d AS (SELECT DISTINCT visitor_id v FROM public.daily_results WHERE visitor_id IS NOT NULL AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  s AS (SELECT DISTINCT visitor_id v FROM public.solo_games WHERE visitor_id IS NOT NULL AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  t AS (SELECT DISTINCT visitor_id v FROM public.room_members WHERE visitor_id IS NOT NULL AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  anyf AS (SELECT v FROM d UNION SELECT v FROM s UNION SELECT v FROM t),
  fmt AS (
    SELECT a.v, (a.v IN (SELECT v FROM d))::int + (a.v IN (SELECT v FROM s))::int + (a.v IN (SELECT v FROM t))::int AS n
    FROM anyf a
  ),
  days AS (
    SELECT visitor_id v, count(DISTINCT puzzle_date) n FROM public.daily_results
    WHERE visitor_id NOT IN (SELECT visitor_id FROM hidden) GROUP BY 1
  ),
  -- Last full day: of people who played two days ago, how many came back
  -- yesterday. Today is still in progress, so it would read near zero.
  yday AS (SELECT DISTINCT visitor_id v FROM public.daily_results WHERE puzzle_date = today - 2 AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  tday AS (SELECT DISTINCT visitor_id v FROM public.daily_results WHERE puzzle_date = today - 1 AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  subs AS (SELECT * FROM public.daily_subscribers WHERE visitor_id IS NULL OR visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  signed AS (
    SELECT visitor_id v FROM public.daily_subscribers WHERE visitor_id IS NOT NULL
    UNION SELECT visitor_id FROM public.player_devices
  ),
  first_touch AS (
    SELECT DISTINCT ON (visitor_id) visitor_id v,
      lower(coalesce(nullif(utm_source, ''), nullif(split_part(split_part(referrer, '//', 2), '/', 1), ''), 'direct')) src
    FROM public.daily_events
    WHERE visitor_id NOT IN (SELECT visitor_id FROM hidden)
    ORDER BY visitor_id, created_at
  ),
  named AS (
    SELECT v, CASE
      WHEN src LIKE '%playlin%' THEN 'playlin.io'
      WHEN src LIKE '%sussydle%' THEN 'sussydle.com'
      WHEN src LIKE '%dailydle%' THEN 'dailydle.org'
      WHEN src LIKE '%instagram%' OR src IN ('ig', 'reels') THEN 'Instagram'
      WHEN src LIKE '%threads%' THEN 'Threads'
      WHEN src LIKE '%facebook%' OR src = 'fb' THEN 'Facebook'
      WHEN src LIKE '%google%' OR src LIKE '%bing%' THEN 'Search'
      WHEN src LIKE '%lovable%' THEN 'Lovable preview'
      WHEN src = 'direct' OR src LIKE '%whoop-whoop%' THEN 'Direct'
      ELSE 'Other' END AS source
    FROM first_touch
  ),
  ev AS (SELECT * FROM public.daily_events WHERE visitor_id NOT IN (SELECT visitor_id FROM hidden)),
  ae AS (SELECT * FROM public.analytics_events WHERE visitor_id IS NULL OR visitor_id NOT IN (SELECT visitor_id FROM hidden))
  SELECT jsonb_build_object(
    'since', (SELECT min(puzzle_date) FROM public.daily_results),
    'today', today,
    'hidden_browsers', (SELECT count(*) FROM hidden),
    'this_browser_hidden', p_visitor_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_excluded_browsers WHERE visitor_id = p_visitor_id),
    'players', jsonb_build_object(
      'any', (SELECT count(*) FROM anyf),
      'daily', (SELECT count(*) FROM d),
      'solo', (SELECT count(*) FROM s),
      'together', (SELECT count(*) FROM t),
      'all_three', (SELECT count(*) FROM fmt WHERE n = 3),
      'two_plus', (SELECT count(*) FROM fmt WHERE n >= 2)
    ),
    'returning', jsonb_build_object(
      'lifetime_players', (SELECT count(*) FROM days),
      'lifetime_back', (SELECT count(*) FROM days WHERE n >= 2),
      'return_day', today - 1,
      'yesterday_players', (SELECT count(*) FROM yday),
      'yesterday_back', (SELECT count(*) FROM yday JOIN tday USING (v))
    ),
    'list', jsonb_build_object(
      'total', (SELECT count(*) FROM subs),
      'by_source', coalesce((SELECT jsonb_agg(jsonb_build_object('source', src, 'n', n) ORDER BY n DESC)
        FROM (SELECT coalesce(source, 'unknown') src, count(*) n FROM subs GROUP BY 1) x), '[]'::jsonb),
      'accounts', (SELECT count(*) FROM public.player_profiles p
        WHERE p.user_id NOT IN (SELECT u.id FROM auth.users u WHERE p_hide_admin AND lower(trim(u.email)) IN (SELECT email FROM public.admin_allowlist))),
      'reminder_yes', (SELECT count(*) FROM public.reminder_consents WHERE consented)
    ),
    'shares', jsonb_build_object(
      'lifetime', (SELECT count(*) FROM ev WHERE event = 'share_clicked'),
      'today', (SELECT count(*) FROM ev WHERE event = 'share_clicked' AND (created_at AT TIME ZONE 'utc')::date = today),
      'invites_lifetime', (SELECT count(*) FROM ae WHERE event_type = 'invite_link_clicked'),
      'invites_today', (SELECT count(*) FROM ae WHERE event_type = 'invite_link_clicked' AND (created_at AT TIME ZONE 'utc')::date = today)
    ),
    'preorder', jsonb_build_object(
      'clicks', (SELECT count(*) FROM ae WHERE event_type = 'preorder_click'),
      'clicks_today', (SELECT count(*) FROM ae WHERE event_type = 'preorder_click' AND (created_at AT TIME ZONE 'utc')::date = today),
      'views', (SELECT count(*) FROM ae WHERE event_type = 'preorder_view')
    ),
    'sources', coalesce((SELECT jsonb_agg(row_to_json(x) ORDER BY x.visitors DESC) FROM (
      SELECT n.source,
        count(*) AS visitors,
        count(*) FILTER (WHERE n.v IN (SELECT v FROM days)) AS played,
        count(*) FILTER (WHERE n.v IN (SELECT v FROM days WHERE n >= 2)) AS returned,
        count(*) FILTER (WHERE n.v IN (SELECT v FROM signed)) AS signed_up
      FROM named n GROUP BY n.source
    ) x), '[]'::jsonb),
    'trend', (SELECT jsonb_agg(jsonb_build_object(
        'day', g.day,
        'daily', (SELECT count(DISTINCT visitor_id) FROM public.daily_results WHERE puzzle_date = g.day AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
        'solo', (SELECT count(DISTINCT visitor_id) FROM public.solo_games WHERE (started_at AT TIME ZONE 'utc')::date = g.day AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
        'together', (SELECT count(DISTINCT visitor_id) FROM public.room_members WHERE (created_at AT TIME ZONE 'utc')::date = g.day AND visitor_id NOT IN (SELECT visitor_id FROM hidden)),
        'signups', (SELECT count(*) FROM subs WHERE (created_at AT TIME ZONE 'utc')::date = g.day)
                 + (SELECT count(*) FROM public.player_profiles WHERE (created_at AT TIME ZONE 'utc')::date = g.day)
      ) ORDER BY g.day)
      FROM (SELECT generate_series(today - 29, today, interval '1 day')::date AS day) g)
  ) INTO out;

  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.admin_overview(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview(boolean, text) TO authenticated;
