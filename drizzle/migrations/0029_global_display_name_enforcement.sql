CREATE TABLE public.player_profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_profiles_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 6)
);
GRANT ALL ON public.player_profiles TO service_role;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.player_profiles IS 'Account-persistent player display names; client access is through authenticated RPCs only.';

CREATE TABLE public.blocked_display_names (
  normalized_name text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.blocked_display_names TO service_role;
ALTER TABLE public.blocked_display_names ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.blocked_display_names IS 'High-confidence whole-name denylist used only by server-side display-name validation.';

ALTER TABLE public.room_members ADD COLUMN display_name text;
ALTER TABLE public.room_seats ADD COLUMN display_name text;

CREATE OR REPLACE FUNCTION public.normalized_display_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT translate(
    regexp_replace(lower(normalize(btrim(coalesce(p_name, '')), NFKC)), '[^a-z0-9]+', '', 'g'),
    '013457', 'oieast'
  )
$function$;

CREATE OR REPLACE FUNCTION public.display_name_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT char_length(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g')) BETWEEN 1 AND 6
    AND coalesce(p_name, '') !~ '[[:cntrl:]]'
    AND public.normalized_display_name(p_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_display_names b
      WHERE b.normalized_name = public.normalized_display_name(p_name)
    )
$function$;

CREATE OR REPLACE FUNCTION public.resolve_display_name(p_candidate text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_candidate, '')), '[[:space:]]+', ' ', 'g');
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT p.display_name INTO v_name
    FROM public.player_profiles p
    WHERE p.user_id = v_uid;
    IF FOUND THEN RETURN v_name; END IF;
    v_name := regexp_replace(btrim(coalesce(p_candidate, '')), '[[:space:]]+', ' ', 'g');
  END IF;

  IF NOT public.display_name_allowed(v_name) THEN
    RAISE EXCEPTION 'display_name_rejected' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.player_profiles (user_id, display_name)
    VALUES (v_uid, v_name)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT p.display_name INTO v_name FROM public.player_profiles p WHERE p.user_id = v_uid;
  END IF;
  RETURN v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_display_name(p_seed text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.resolve_display_name(p_seed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_display_name(p_display_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '[[:space:]]+', ' ', 'g');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.display_name_allowed(v_name) THEN
    RAISE EXCEPTION 'display_name_rejected' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.player_profiles (user_id, display_name, updated_at)
  VALUES (v_uid, v_name, now())
  ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now();
  UPDATE public.room_members SET display_name = v_name WHERE user_id = v_uid;
  UPDATE public.daily_group_members SET display_name = v_name WHERE user_id = v_uid;
  RETURN v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_room_session(
  p_room_id uuid, p_visitor_id text, p_player_key text, p_sign_pubkey text, p_display_name text
)
RETURNS TABLE(game_id uuid, seat integer, pub_id text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_key text := btrim(coalesce(p_player_key, ''));
  v_pubkey text := btrim(coalesce(p_sign_pubkey, ''));
  v_pub_id text;
  v_game uuid;
  v_seat integer;
  v_name text;
BEGIN
  IF p_room_id IS NULL OR v_visitor = '' OR length(v_key) < 16 OR length(v_key) > 200
     OR length(v_pubkey) < 40 OR length(v_pubkey) > 500 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id) THEN RETURN; END IF;
  v_name := public.resolve_display_name(p_display_name);

  SELECT m.pub_id INTO v_pub_id FROM public.room_members m
  WHERE m.room_id = p_room_id AND m.visitor_id = v_visitor AND m.player_key = v_key;
  IF v_pub_id IS NULL THEN v_pub_id := encode(gen_random_bytes(16), 'hex'); END IF;

  INSERT INTO public.room_members (room_id, player_key, visitor_id, pub_id, sign_pubkey, user_id, display_name)
  VALUES (p_room_id, v_key, v_visitor, v_pub_id, v_pubkey, auth.uid(), v_name)
  ON CONFLICT (room_id, visitor_id) DO UPDATE SET
    player_key = EXCLUDED.player_key, pub_id = EXCLUDED.pub_id,
    sign_pubkey = EXCLUDED.sign_pubkey, user_id = EXCLUDED.user_id,
    display_name = EXCLUDED.display_name;

  SELECT s.game_id, s.seat INTO v_game, v_seat
  FROM public.room_seats s
  WHERE s.room_id = p_room_id AND s.visitor_id = v_visitor
  ORDER BY s.created_at DESC LIMIT 1;
  RETURN QUERY SELECT v_game, v_seat, v_pub_id, v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.room_member_names(
  p_room_id uuid, p_visitor_id text, p_player_key text
)
RETURNS TABLE(pub_id text, display_name text, is_host boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members mine
    WHERE mine.room_id = p_room_id
      AND mine.visitor_id = left(btrim(coalesce(p_visitor_id, '')), 100)
      AND mine.player_key = btrim(coalesce(p_player_key, ''))
  ) THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.pub_id, coalesce(m.display_name, 'Player'), m.visitor_id = r.host_visitor_id
  FROM public.room_members m
  JOIN public.rooms r ON r.id = m.room_id
  WHERE m.room_id = p_room_id AND m.pub_id IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_room_seats_by_pid(p_room_id uuid, p_game_id uuid, p_host_visitor_id text, p_seats jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_host text := btrim(coalesce(p_host_visitor_id, ''));
  v_seat jsonb;
  v_pid text;
  v_visitor text;
  v_key text;
  v_user uuid;
  v_name text;
  v_n integer := 0;
BEGIN
  IF p_room_id IS NULL OR p_game_id IS NULL OR v_host = '' THEN RETURN false; END IF;
  IF p_seats IS NULL OR jsonb_typeof(p_seats) <> 'array'
     OR jsonb_array_length(p_seats) < 1 OR jsonb_array_length(p_seats) > 6 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id AND r.host_visitor_id = v_host) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.room_seats s WHERE s.room_id = p_room_id AND s.game_id = p_game_id) THEN RETURN true; END IF;
  FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats) LOOP
    IF jsonb_typeof(v_seat -> 'seat') <> 'number' THEN CONTINUE; END IF;
    v_pid := nullif(btrim(coalesce(v_seat ->> 'pid', '')), '');
    IF v_pid IS NULL THEN CONTINUE; END IF;
    v_visitor := NULL; v_key := NULL; v_user := NULL; v_name := NULL;
    SELECT m.visitor_id, m.player_key, m.user_id, m.display_name
      INTO v_visitor, v_key, v_user, v_name
    FROM public.room_members m WHERE m.room_id = p_room_id AND m.pub_id = v_pid;
    IF v_visitor IS NULL OR v_name IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.room_seats (room_id, game_id, seat, visitor_id, player_key, pub_id, user_id, display_name)
    VALUES (p_room_id, p_game_id, (v_seat ->> 'seat')::integer, v_visitor, v_key, v_pid, v_user, v_name)
    ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_daily_group(p_name text, p_visitor_id text, p_display_name text)
RETURNS TABLE(group_id uuid, name text, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_max_groups constant integer := 5;
  c_per_visitor_per_day constant integer := 10;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_name text := left(btrim(coalesce(p_name, '')), 24);
  v_dn text;
  v_email text := public.session_email();
  v_code text;
  v_id uuid;
  v_try integer := 0;
BEGIN
  IF length(v_visitor) = 0 OR length(v_name) = 0 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  v_dn := public.resolve_display_name(p_display_name);
  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.visitor_id = v_visitor) >= c_max_groups THEN
    RAISE EXCEPTION 'group_limit_reached';
  END IF;
  IF NOT public.rl_hit('daily_group_create', v_visitor, c_per_visitor_per_day) THEN RAISE EXCEPTION 'rate_limited'; END IF;
  LOOP
    v_try := v_try + 1; v_code := public.gen_daily_group_code();
    BEGIN
      INSERT INTO public.daily_groups (code, name, created_by) VALUES (v_code, v_name, v_visitor)
      RETURNING public.daily_groups.id INTO v_id; EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 20 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
    END;
  END LOOP;
  INSERT INTO public.daily_group_members (group_id, visitor_id, display_name, email, user_id)
  VALUES (v_id, v_visitor, v_dn, v_email, auth.uid());
  RETURN QUERY SELECT v_id, v_name, v_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_daily_group(p_code text, p_visitor_id text, p_display_name text)
RETURNS TABLE(group_id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_max_members constant integer := 20;
  c_max_groups constant integer := 5;
  c_per_visitor_per_day constant integer := 20;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_dn text;
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_email text := public.session_email();
  v_id uuid;
  v_name text;
BEGIN
  IF length(v_visitor) = 0 OR length(v_code) = 0 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  v_dn := public.resolve_display_name(p_display_name);
  IF NOT public.rl_hit('daily_group_join', v_visitor, c_per_visitor_per_day) THEN RAISE EXCEPTION 'rate_limited'; END IF;
  SELECT g.id, g.name INTO v_id, v_name FROM public.daily_groups g WHERE lower(g.code) = v_code LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'group_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_group_members m WHERE m.group_id = v_id AND m.visitor_id = v_visitor) THEN
    UPDATE public.daily_group_members m SET display_name = v_dn,
      email = coalesce(v_email, m.email), user_id = coalesce(auth.uid(), m.user_id)
    WHERE m.group_id = v_id AND m.visitor_id = v_visitor;
    RETURN QUERY SELECT v_id, v_name; RETURN;
  END IF;
  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.group_id = v_id) >= c_max_members THEN RAISE EXCEPTION 'group_full'; END IF;
  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.visitor_id = v_visitor) >= c_max_groups THEN RAISE EXCEPTION 'group_limit_reached'; END IF;
  INSERT INTO public.daily_group_members (group_id, visitor_id, display_name, email, user_id)
  VALUES (v_id, v_visitor, v_dn, v_email, auth.uid());
  RETURN QUERY SELECT v_id, v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_account_data(p_user_id uuid, p_email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_visitors text[];
  v_n integer;
BEGIN
  SELECT array_agg(visitor_id) INTO v_visitors FROM public.player_devices WHERE user_id = p_user_id;
  v_visitors := coalesce(v_visitors, ARRAY[]::text[]);
  DELETE FROM public.daily_results WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.daily_subscribers WHERE visitor_id = ANY (v_visitors);
  DELETE FROM public.legacy_subscriber_links WHERE visitor_id = ANY (v_visitors) OR (v_email IS NOT NULL AND email = v_email);
  DELETE FROM public.daily_group_members WHERE user_id = p_user_id OR visitor_id = ANY (v_visitors);
  DELETE FROM public.daily_events WHERE visitor_id = ANY (v_visitors);
  DELETE FROM public.reminder_consents WHERE user_id = p_user_id;
  DELETE FROM public.player_devices WHERE user_id = p_user_id;
  DELETE FROM public.player_profiles WHERE user_id = p_user_id;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.normalized_display_name(text), public.display_name_allowed(text), public.resolve_display_name(text),
  public.get_my_display_name(text), public.set_my_display_name(text),
  public.join_room_session(uuid,text,text,text,text), public.room_member_names(uuid,text,text),
  public.register_room_seats_by_pid(uuid,uuid,text,jsonb), public.create_daily_group(text,text,text),
  public.join_daily_group(text,text,text), public.delete_account_data(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalized_display_name(text), public.display_name_allowed(text), public.resolve_display_name(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_display_name(text), public.set_my_display_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_room_session(uuid,text,text,text,text), public.room_member_names(uuid,text,text),
  public.register_room_seats_by_pid(uuid,uuid,text,jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_daily_group(text,text,text), public.join_daily_group(text,text,text),
  public.delete_account_data(uuid,text) TO service_role;