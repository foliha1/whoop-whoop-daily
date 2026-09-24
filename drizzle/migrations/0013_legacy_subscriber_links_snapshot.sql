CREATE TABLE public.legacy_subscriber_links (
  visitor_id text PRIMARY KEY,
  email text NOT NULL,
  subscribed_at timestamptz NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.legacy_subscriber_links FROM anon, authenticated;
GRANT ALL ON public.legacy_subscriber_links TO service_role;
ALTER TABLE public.legacy_subscriber_links ENABLE ROW LEVEL SECURITY;

-- One-time snapshot: subscriber rows created before the session-only identity cleanup.
INSERT INTO public.legacy_subscriber_links (visitor_id, email, subscribed_at)
SELECT DISTINCT ON (s.visitor_id) s.visitor_id, lower(btrim(s.email)), s.created_at
FROM public.daily_subscribers s
WHERE nullif(btrim(coalesce(s.visitor_id, '')), '') IS NOT NULL
  AND nullif(btrim(coalesce(s.email, '')), '') IS NOT NULL
  AND s.created_at < '2026-09-24 13:30:00+00'
ORDER BY s.visitor_id, s.created_at ASC;

-- Write-once: no inserts or updates after the snapshot. Deletes allowed (account deletion).
CREATE OR REPLACE FUNCTION public.legacy_links_frozen()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'legacy_subscriber_links is a frozen snapshot';
END;
$$;
CREATE TRIGGER legacy_links_no_insert_update
BEFORE INSERT OR UPDATE ON public.legacy_subscriber_links
FOR EACH ROW EXECUTE FUNCTION public.legacy_links_frozen();

-- Legacy email for a browser: stamped results first, then the frozen snapshot.
CREATE OR REPLACE FUNCTION public.legacy_email_for(p_visitor_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT min(lower(trim(d.email))) FROM public.daily_results d
      WHERE d.visitor_id = p_visitor_id AND nullif(trim(coalesce(d.email, '')), '') IS NOT NULL),
    (SELECT l.email FROM public.legacy_subscriber_links l WHERE l.visitor_id = p_visitor_id));
$$;
REVOKE ALL ON FUNCTION public.legacy_email_for(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.whoop_points_rows()
 RETURNS TABLE(identity text, puzzle_number integer, puzzle_date date, game_points integer, used_fallback boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH stamped AS (
    SELECT d.visitor_id, min(lower(trim(d.email))) AS email
    FROM public.daily_results d
    WHERE nullif(trim(coalesce(d.email, '')), '') IS NOT NULL
    GROUP BY d.visitor_id
  ),
  emails AS (
    SELECT visitor_id, email FROM stamped
    UNION ALL
    SELECT l.visitor_id, l.email FROM public.legacy_subscriber_links l
    WHERE NOT EXISTS (SELECT 1 FROM stamped s WHERE s.visitor_id = l.visitor_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_whoop_points(p_visitor_id text)
 RETURNS TABLE(total integer, tier text, today_points integer, total_before_today integer, points_to_next_tier integer, next_tier_threshold integer, peak_total integer, highest_tier_ever text, badges jsonb, days_away integer, decay_applied integer, games_played integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
      (SELECT l.email FROM public.legacy_subscriber_links l WHERE l.visitor_id = v_visitor),
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid, p_email text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_visitors text[];
  v_n integer;
BEGIN
  SELECT array_agg(visitor_id) INTO v_visitors FROM public.player_devices WHERE user_id = p_user_id;
  v_visitors := coalesce(v_visitors, ARRAY[]::text[]);
  DELETE FROM public.daily_results
   WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.daily_subscribers WHERE visitor_id = ANY (v_visitors);
  DELETE FROM public.legacy_subscriber_links
   WHERE visitor_id = ANY (v_visitors) OR (v_email IS NOT NULL AND email = v_email);
  DELETE FROM public.daily_group_members WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  DELETE FROM public.daily_events WHERE visitor_id = ANY (v_visitors);
  DELETE FROM public.reminder_consents WHERE user_id = p_user_id;
  DELETE FROM public.player_devices WHERE user_id = p_user_id;
  RETURN v_n;
END;
$function$;