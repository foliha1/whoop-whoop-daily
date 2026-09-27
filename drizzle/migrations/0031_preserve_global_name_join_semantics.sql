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
  v_key text := left(btrim(coalesce(p_player_key, '')), 64);
  v_pk text := btrim(coalesce(p_sign_pubkey, ''));
  v_pub text;
  v_game uuid;
  v_seat integer;
  v_name text;
BEGIN
  IF p_room_id IS NULL OR length(v_visitor) = 0 OR length(v_key) < 16 THEN RETURN; END IF;
  IF length(v_pk) <> 88 OR v_pk !~ '^[A-Za-z0-9+/]+=*$' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id) THEN RETURN; END IF;
  IF NOT public.rl_hit('room_join_visitor', v_visitor, 300) THEN RETURN; END IF;
  v_name := public.resolve_display_name(p_display_name);

  v_pub := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.room_members (room_id, player_key, visitor_id, pub_id, sign_pubkey, user_id, display_name)
  VALUES (p_room_id, v_key, v_visitor, v_pub, v_pk, auth.uid(), v_name)
  ON CONFLICT (room_id, player_key) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.room_members m
                 WHERE m.room_id = p_room_id AND m.player_key = v_key AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;
  UPDATE public.room_members m SET pub_id = coalesce(m.pub_id, v_pub), sign_pubkey = v_pk,
    user_id = auth.uid(), display_name = v_name
  WHERE m.room_id = p_room_id AND m.player_key = v_key;
  SELECT m.pub_id INTO v_pub FROM public.room_members m
  WHERE m.room_id = p_room_id AND m.player_key = v_key;

  UPDATE public.rooms r SET host_key = v_key
  WHERE r.id = p_room_id AND r.host_visitor_id = v_visitor;

  UPDATE public.room_seats s SET player_key = v_key, pub_id = v_pub, user_id = auth.uid(), display_name = v_name
  WHERE s.room_id = p_room_id AND s.visitor_id = v_visitor;

  SELECT s.game_id INTO v_game FROM public.room_seats s
  WHERE s.room_id = p_room_id ORDER BY s.created_at DESC LIMIT 1;
  SELECT s.seat INTO v_seat FROM public.room_seats s
  WHERE s.room_id = p_room_id AND s.game_id = v_game AND s.visitor_id = v_visitor LIMIT 1;
  RETURN QUERY SELECT v_game, v_seat, v_pub, v_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_room_session(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_session(uuid,text,text,text,text) TO anon, authenticated, service_role;