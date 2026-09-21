-- An email counts as this visitor's only when the Daily already ties the two
-- together: a result row stamped with it, or a subscriber row for it.
CREATE OR REPLACE FUNCTION public.email_linked_to_visitor(p_visitor_id text, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT nullif(btrim(coalesce(p_visitor_id, '')), '') IS NOT NULL
     AND nullif(lower(btrim(coalesce(p_email, ''))), '') IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.daily_results r
               WHERE r.visitor_id = btrim(p_visitor_id)
                 AND r.email = lower(btrim(p_email)))
       OR EXISTS (SELECT 1 FROM public.daily_subscribers s
                  WHERE s.visitor_id = btrim(p_visitor_id)
                    AND s.email = lower(btrim(p_email)))
     );
$function$;

GRANT EXECUTE ON FUNCTION public.email_linked_to_visitor(text, text) TO anon, authenticated, service_role;

-- Existing rows: never trust an email that is not linked.
UPDATE public.daily_group_members m
SET email = NULL
WHERE m.email IS NOT NULL
  AND NOT public.email_linked_to_visitor(m.visitor_id, m.email);

-- ------------------------------------------------------------------- reads ---

CREATE OR REPLACE FUNCTION public.daily_rows_for(p_visitor_id text, p_email text)
RETURNS TABLE(puzzle_number integer, rounds_solved integer, total_misses integer, elapsed_ms integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.puzzle_number, d.rounds_solved, d.total_misses, d.elapsed_ms
  FROM public.daily_results d
  WHERE (nullif(trim(coalesce(p_visitor_id, '')), '') IS NOT NULL
         AND d.visitor_id = p_visitor_id)
     OR (public.email_linked_to_visitor(p_visitor_id, p_email)
         AND d.email = lower(trim(p_email)));
$function$;

CREATE OR REPLACE FUNCTION public.get_group_today(p_group_id uuid, p_puzzle_number integer, p_visitor_id text)
RETURNS TABLE(visitor_id text, display_name text, rounds_solved integer, total_misses integer, peek_used boolean, rank_position integer, not_played boolean, is_me boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
BEGIN
  IF length(v_visitor) = 0 OR p_group_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_group_members m
                 WHERE m.group_id = p_group_id AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mem AS (
    -- An email only widens a member's match when it is linked to their own
    -- visitor id; otherwise it is ignored entirely.
    SELECT m.visitor_id AS vid, m.display_name AS dn,
           CASE WHEN public.email_linked_to_visitor(m.visitor_id, m.email)
                THEN lower(btrim(m.email)) END AS em
    FROM public.daily_group_members m WHERE m.group_id = p_group_id
  ),
  scored AS (
    SELECT mem.vid, mem.dn, b.rounds_solved AS rs, b.total_misses AS tm, b.peek_used AS pk
    FROM mem
    LEFT JOIN LATERAL (
      SELECT r.rounds_solved, r.total_misses, r.peek_used
      FROM public.daily_results r
      WHERE r.puzzle_number = p_puzzle_number
        AND (r.visitor_id = mem.vid
             OR (mem.em IS NOT NULL AND r.email = mem.em))
      ORDER BY r.rounds_solved DESC, r.total_misses ASC, r.created_at ASC
      LIMIT 1
    ) b ON true
  )
  SELECT s.vid, s.dn,
         coalesce(s.rs, 0)::integer,
         coalesce(s.tm, 0)::integer,
         coalesce(s.pk, false),
         CASE WHEN s.rs IS NULL THEN NULL ELSE (
           1 + (SELECT count(*) FROM scored o
                WHERE o.rs IS NOT NULL
                  AND (o.rs, -o.tm) > (s.rs, -s.tm))
         )::integer END,
         (s.rs IS NULL),
         (s.vid = v_visitor)
  FROM scored s
  ORDER BY (s.rs IS NULL), s.rs DESC NULLS LAST, s.tm ASC, s.dn ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_season(p_group_id uuid, p_puzzle_number integer, p_visitor_id text)
RETURNS TABLE(visitor_id text, display_name text, points integer, puzzles_played integer, rank_position integer, is_me boolean, season_start date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_week date := public.daily_season_start(p_puzzle_number);
  v_first integer := greatest(1, (public.daily_season_start(p_puzzle_number) - date '2026-08-11') + 1);
BEGIN
  IF length(v_visitor) = 0 OR p_group_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_group_members m
                 WHERE m.group_id = p_group_id AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mem AS (
    SELECT m.visitor_id AS vid, m.display_name AS dn,
           CASE WHEN public.email_linked_to_visitor(m.visitor_id, m.email)
                THEN lower(btrim(m.email)) END AS em
    FROM public.daily_group_members m WHERE m.group_id = p_group_id
  ),
  nums AS (SELECT n FROM generate_series(v_first, p_puzzle_number) AS n),
  rows_ AS (
    SELECT mem.vid, nums.n, b.rounds_solved AS rs, b.total_misses AS tm
    FROM mem CROSS JOIN nums
    LEFT JOIN LATERAL (
      SELECT r.rounds_solved, r.total_misses
      FROM public.daily_results r
      WHERE r.puzzle_number = nums.n
        AND (r.visitor_id = mem.vid
             OR (mem.em IS NOT NULL AND r.email = mem.em))
      ORDER BY r.rounds_solved DESC, r.total_misses ASC, r.created_at ASC
      LIMIT 1
    ) b ON true
  ),
  placed AS (
    SELECT x.vid, x.n,
           1 + (SELECT count(*) FROM rows_ o
                WHERE o.n = x.n AND o.rs IS NOT NULL
                  AND (o.rs, -o.tm) > (x.rs, -x.tm)) AS pos
    FROM rows_ x WHERE x.rs IS NOT NULL
  ),
  pts AS (
    SELECT mem.vid, mem.dn,
           coalesce(sum(CASE placed.pos WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1
                                        ELSE 0 END), 0)::integer AS points,
           count(placed.n)::integer AS played
    FROM mem LEFT JOIN placed ON placed.vid = mem.vid
    GROUP BY mem.vid, mem.dn
  )
  SELECT p.vid, p.dn, p.points, p.played,
         (1 + (SELECT count(*) FROM pts o WHERE o.points > p.points))::integer,
         (p.vid = v_visitor),
         v_week
  FROM pts p
  ORDER BY p.points DESC, p.played DESC, p.dn ASC;
END;
$function$;

-- ------------------------------------------------------------------ writes ---

CREATE OR REPLACE FUNCTION public.join_daily_group(p_code text, p_visitor_id text, p_display_name text, p_email text DEFAULT NULL::text)
RETURNS TABLE(group_id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_max_members constant integer := 20;
  c_max_groups constant integer := 5;
  c_per_visitor_per_day constant integer := 20;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_dn text := left(btrim(coalesce(p_display_name, '')), 6);
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_email text := coalesce(
    nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), ''),
    nullif(lower(btrim(coalesce(p_email, ''))), '')
  );
  v_id uuid;
  v_name text;
BEGIN
  IF length(v_visitor) = 0 OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF length(v_dn) = 0 THEN v_dn := 'Player'; END IF;

  -- Refuse to store an address this visitor is not already linked to: an
  -- unverified email must never widen whose results a membership matches.
  IF NOT public.email_linked_to_visitor(v_visitor, v_email) THEN
    v_email := NULL;
  END IF;

  IF NOT public.rl_hit('daily_group_join', v_visitor, c_per_visitor_per_day) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT g.id, g.name INTO v_id, v_name
  FROM public.daily_groups g WHERE lower(g.code) = v_code LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.daily_group_members m
             WHERE m.group_id = v_id AND m.visitor_id = v_visitor) THEN
    UPDATE public.daily_group_members m
    SET display_name = v_dn,
        email = coalesce(v_email, m.email)
    WHERE m.group_id = v_id AND m.visitor_id = v_visitor;
    RETURN QUERY SELECT v_id, v_name;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.group_id = v_id)
     >= c_max_members THEN
    RAISE EXCEPTION 'group_full';
  END IF;
  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.visitor_id = v_visitor)
     >= c_max_groups THEN
    RAISE EXCEPTION 'group_limit_reached';
  END IF;

  INSERT INTO public.daily_group_members (group_id, visitor_id, display_name, email, user_id)
  VALUES (v_id, v_visitor, v_dn, v_email, auth.uid());

  RETURN QUERY SELECT v_id, v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_group_email(p_visitor_id text, p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
BEGIN
  IF length(v_visitor) = 0 OR v_email IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.rl_hit('daily_group_link_email', v_visitor, 20) THEN
    RETURN false;
  END IF;
  -- Same rule as the join path: only an already-linked address may be stored.
  IF NOT public.email_linked_to_visitor(v_visitor, v_email) THEN
    RETURN false;
  END IF;

  UPDATE public.daily_group_members m
  SET email = v_email
  WHERE m.visitor_id = v_visitor
    AND (m.email IS NULL OR m.email <> v_email);

  RETURN true;
END;
$function$;