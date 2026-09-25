-- 1. Rooms and seat tables are server-only.
REVOKE ALL ON public.rooms, public.room_seats, public.claim_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rooms, public.room_seats, public.claim_locks TO service_role;

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS host_key text;
ALTER TABLE public.room_seats ADD COLUMN IF NOT EXISTS player_key text;

-- Per-session player keys -> browser ids. Never readable by clients.
CREATE TABLE IF NOT EXISTS public.room_members (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_key text NOT NULL,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, player_key)
);
GRANT ALL ON public.room_members TO service_role;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS room_members_visitor_idx ON public.room_members (room_id, visitor_id);

-- 2. Room creation: server-generated code, IP rate cap.
CREATE OR REPLACE FUNCTION public.create_room(p_visitor_id text)
RETURNS TABLE(id uuid, room_code text, status text, is_host boolean, host_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN; END IF;
  IF NOT public.rl_hit('room_create_ip', public.request_ip(), 30) THEN
    RAISE EXCEPTION 'Too many tables created. Try again tomorrow.' USING ERRCODE = 'P0001';
  END IF;
  FOR attempt IN 1..8 LOOP
    v_code := '';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    END LOOP;
    BEGIN
      RETURN QUERY
      INSERT INTO public.rooms (room_code, host_visitor_id)
      VALUES (v_code, v_visitor)
      RETURNING rooms.id, rooms.room_code, rooms.status, true, rooms.host_key;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- try another code
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not create a table. Please try again.';
END;
$$;

-- Legacy two-argument form (still used by the published build) gets the same cap.
CREATE OR REPLACE FUNCTION public.create_room(p_code text, p_visitor_id text)
RETURNS TABLE(id uuid, room_code text, status text, is_host boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.rl_hit('room_create_ip', public.request_ip(), 30) THEN
    RAISE EXCEPTION 'Too many tables created. Try again tomorrow.' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  INSERT INTO public.rooms (room_code, host_visitor_id)
  VALUES (upper(p_code), p_visitor_id)
  RETURNING public.rooms.id, public.rooms.room_code, public.rooms.status, true;
END;
$$;

DROP FUNCTION IF EXISTS public.get_room_by_code(text, text);
CREATE FUNCTION public.get_room_by_code(p_code text, p_visitor_id text)
RETURNS TABLE(id uuid, room_code text, status text, is_host boolean, host_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.id, r.room_code, r.status, (r.host_visitor_id = p_visitor_id), r.host_key
  FROM public.rooms r
  WHERE r.room_code = upper(p_code)
  LIMIT 1;
$$;

-- 3. A player registers its own session key over its own request.
-- Returns the seat this browser already holds in the room's latest game
-- (server-verified rejoin), or null.
CREATE OR REPLACE FUNCTION public.join_room_session(p_room_id uuid, p_visitor_id text, p_player_key text)
RETURNS TABLE(game_id uuid, seat integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_key text := left(btrim(coalesce(p_player_key, '')), 64);
  v_game uuid;
BEGIN
  IF p_room_id IS NULL OR length(v_visitor) = 0 OR length(v_key) < 16 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id) THEN RETURN; END IF;
  IF NOT public.rl_hit('room_join_visitor', v_visitor, 300) THEN RETURN; END IF;

  INSERT INTO public.room_members (room_id, player_key, visitor_id)
  VALUES (p_room_id, v_key, v_visitor)
  ON CONFLICT (room_id, player_key) DO NOTHING;
  -- A key belongs to exactly one browser; never rebind it.
  IF NOT EXISTS (SELECT 1 FROM public.room_members m
                 WHERE m.room_id = p_room_id AND m.player_key = v_key AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;

  UPDATE public.rooms r SET host_key = v_key
  WHERE r.id = p_room_id AND r.host_visitor_id = v_visitor;

  -- Rejoin: rebind this browser's own seats to its new key.
  UPDATE public.room_seats s SET player_key = v_key
  WHERE s.room_id = p_room_id AND s.visitor_id = v_visitor;

  SELECT s.game_id INTO v_game FROM public.room_seats s
  WHERE s.room_id = p_room_id ORDER BY s.created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT s.game_id, s.seat FROM public.room_seats s
  WHERE s.room_id = p_room_id AND s.game_id = v_game AND s.visitor_id = v_visitor
  LIMIT 1;
END;
$$;

-- 4. Host-only: current player key for each seat (server's say-so for rejoin).
CREATE OR REPLACE FUNCTION public.room_seat_keys(p_room_id uuid, p_game_id uuid, p_host_visitor_id text)
RETURNS TABLE(seat integer, player_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.seat, s.player_key FROM public.room_seats s
  WHERE s.room_id = p_room_id AND s.game_id = p_game_id
    AND EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id
                AND r.host_visitor_id = btrim(coalesce(p_host_visitor_id, '')))
  ORDER BY s.seat;
$$;

-- 5. Seat map: entries carry player keys; the server resolves browser ids.
-- Entries with a raw visitor_id are still accepted from the published build.
CREATE OR REPLACE FUNCTION public.register_room_seats(p_room_id uuid, p_game_id uuid, p_host_visitor_id text, p_seats jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_host text := btrim(coalesce(p_host_visitor_id, ''));
  v_seat jsonb;
  v_key text;
  v_visitor text;
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
    v_key := nullif(btrim(coalesce(v_seat ->> 'player_key', '')), '');
    IF v_key IS NOT NULL THEN
      SELECT m.visitor_id INTO v_visitor FROM public.room_members m
      WHERE m.room_id = p_room_id AND m.player_key = v_key;
    ELSE
      v_visitor := nullif(left(btrim(coalesce(v_seat ->> 'visitor_id', '')), 100), '');
    END IF;
    IF v_visitor IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.room_seats (room_id, game_id, seat, visitor_id, player_key)
    VALUES (p_room_id, p_game_id, (v_seat ->> 'seat')::integer, v_visitor, v_key)
    ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_room_session(uuid, text, text), public.room_seat_keys(uuid, uuid, text),
  public.create_room(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_room_session(uuid, text, text), public.room_seat_keys(uuid, uuid, text),
  public.create_room(text), public.get_room_by_code(text, text) TO anon, authenticated, service_role;

-- 6. Signed-out saves into an account-linked browser are refused.
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.save_daily_result(text,integer,date,integer,integer,boolean,jsonb,integer)'::regprocedure) INTO v_def;
  IF position('visitor_linked_needs_session' in v_def) = 0 THEN
    v_def := replace(v_def, '  -- Emails known server-side for this browser',
$ins$  IF v_uid IS NULL AND EXISTS (
    SELECT 1 FROM public.player_devices pd WHERE pd.visitor_id = v_visitor
  ) THEN
    INSERT INTO public.daily_events (visitor_id, event, puzzle_number, props)
    VALUES (v_visitor, 'result_rejected', p_puzzle_number, jsonb_build_object('reason', 'visitor_linked_needs_session'));
    RETURN false;
  END IF;

  -- Emails known server-side for this browser$ins$);
    IF position('visitor_linked_needs_session' in v_def) = 0 THEN
      RAISE EXCEPTION 'save_daily_result anchor not found';
    END IF;
    EXECUTE v_def;
  END IF;
END
$do$;