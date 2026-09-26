-- Classic signed channel: per-join public ids and signing keys.
ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS pub_id text;
ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS sign_pubkey text;
ALTER TABLE public.room_seats ADD COLUMN IF NOT EXISTS pub_id text;
CREATE UNIQUE INDEX IF NOT EXISTS room_members_room_pub_id_key ON public.room_members (room_id, pub_id) WHERE pub_id IS NOT NULL;

-- Stop returning the host's secret session key to anyone who knows the code.
-- Same signature; the column is kept but always NULL.
CREATE OR REPLACE FUNCTION public.get_room_by_code(p_code text, p_visitor_id text)
 RETURNS TABLE(id uuid, room_code text, status text, is_host boolean, host_key text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.id, r.room_code, r.status, (r.host_visitor_id = p_visitor_id), NULL::text
  FROM public.rooms r
  WHERE r.room_code = upper(p_code)
  LIMIT 1;
$function$;

-- Join with a signing key. Returns this tab's public id.
CREATE OR REPLACE FUNCTION public.join_room_session(p_room_id uuid, p_visitor_id text, p_player_key text, p_sign_pubkey text)
RETURNS TABLE(game_id uuid, seat integer, pub_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_key text := left(btrim(coalesce(p_player_key, '')), 64);
  v_pk text := btrim(coalesce(p_sign_pubkey, ''));
  v_pub text;
  v_game uuid;
BEGIN
  IF p_room_id IS NULL OR length(v_visitor) = 0 OR length(v_key) < 16 THEN RETURN; END IF;
  IF length(v_pk) <> 88 OR v_pk !~ '^[A-Za-z0-9+/]+=*$' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id) THEN RETURN; END IF;
  IF NOT public.rl_hit('room_join_visitor', v_visitor, 300) THEN RETURN; END IF;

  v_pub := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.room_members (room_id, player_key, visitor_id, pub_id, sign_pubkey)
  VALUES (p_room_id, v_key, v_visitor, v_pub, v_pk)
  ON CONFLICT (room_id, player_key) DO NOTHING;
  -- A key belongs to exactly one browser; never rebind it.
  IF NOT EXISTS (SELECT 1 FROM public.room_members m
                 WHERE m.room_id = p_room_id AND m.player_key = v_key AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;
  UPDATE public.room_members m SET pub_id = coalesce(m.pub_id, v_pub), sign_pubkey = v_pk
  WHERE m.room_id = p_room_id AND m.player_key = v_key;
  SELECT m.pub_id INTO v_pub FROM public.room_members m
  WHERE m.room_id = p_room_id AND m.player_key = v_key;

  UPDATE public.rooms r SET host_key = v_key
  WHERE r.id = p_room_id AND r.host_visitor_id = v_visitor;

  -- Rejoin: rebind this browser's own seats to its new key and public id.
  UPDATE public.room_seats s SET player_key = v_key, pub_id = v_pub
  WHERE s.room_id = p_room_id AND s.visitor_id = v_visitor;

  SELECT s.game_id INTO v_game FROM public.room_seats s
  WHERE s.room_id = p_room_id ORDER BY s.created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT v_game, (SELECT s.seat FROM public.room_seats s
                  WHERE s.room_id = p_room_id AND s.game_id = v_game AND s.visitor_id = v_visitor
                  LIMIT 1), v_pub;
END;
$$;

-- Public keys for a room, readable only by a member of that room.
CREATE OR REPLACE FUNCTION public.room_sign_keys(p_room_id uuid, p_visitor_id text, p_player_key text)
RETURNS TABLE(role text, seat integer, pub_id text, sign_pubkey text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_game uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.room_members m
                 WHERE m.room_id = p_room_id
                   AND m.player_key = btrim(coalesce(p_player_key, ''))
                   AND m.visitor_id = btrim(coalesce(p_visitor_id, ''))) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT 'host'::text, NULL::integer, m.pub_id, m.sign_pubkey
  FROM public.rooms r JOIN public.room_members m
    ON m.room_id = r.id AND m.player_key = r.host_key
  WHERE r.id = p_room_id AND m.pub_id IS NOT NULL AND m.sign_pubkey IS NOT NULL;

  SELECT s.game_id INTO v_game FROM public.room_seats s
  WHERE s.room_id = p_room_id ORDER BY s.created_at DESC LIMIT 1;
  IF v_game IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'seat'::text, s.seat, m.pub_id, m.sign_pubkey
  FROM public.room_seats s JOIN public.room_members m
    ON m.room_id = s.room_id AND m.player_key = s.player_key
  WHERE s.room_id = p_room_id AND s.game_id = v_game
    AND m.pub_id IS NOT NULL AND m.sign_pubkey IS NOT NULL
  ORDER BY s.seat;
END;
$$;

-- Seat map by public id; the server resolves each id to its member row.
CREATE OR REPLACE FUNCTION public.register_room_seats_by_pid(p_room_id uuid, p_game_id uuid, p_host_visitor_id text, p_seats jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_host text := btrim(coalesce(p_host_visitor_id, ''));
  v_seat jsonb;
  v_pid text;
  v_visitor text;
  v_key text;
  v_n integer := 0;
BEGIN
  IF p_room_id IS NULL OR p_game_id IS NULL OR v_host = '' THEN RETURN false; END IF;
  IF p_seats IS NULL OR jsonb_typeof(p_seats) <> 'array'
     OR jsonb_array_length(p_seats) < 1 OR jsonb_array_length(p_seats) > 6 THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id AND r.host_visitor_id = v_host) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_seats s WHERE s.room_id = p_room_id AND s.game_id = p_game_id) THEN
    RETURN true;
  END IF;
  FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats) LOOP
    IF jsonb_typeof(v_seat -> 'seat') <> 'number' THEN CONTINUE; END IF;
    v_pid := nullif(btrim(coalesce(v_seat ->> 'pid', '')), '');
    IF v_pid IS NULL THEN CONTINUE; END IF;
    v_visitor := NULL; v_key := NULL;
    SELECT m.visitor_id, m.player_key INTO v_visitor, v_key FROM public.room_members m
    WHERE m.room_id = p_room_id AND m.pub_id = v_pid;
    IF v_visitor IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.room_seats (room_id, game_id, seat, visitor_id, player_key, pub_id)
    VALUES (p_room_id, p_game_id, (v_seat ->> 'seat')::integer, v_visitor, v_key, v_pid)
    ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_room_session(uuid, text, text, text),
  public.room_sign_keys(uuid, text, text),
  public.register_room_seats_by_pid(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_session(uuid, text, text, text),
  public.room_sign_keys(uuid, text, text),
  public.register_room_seats_by_pid(uuid, uuid, text, jsonb) TO anon, authenticated, service_role;