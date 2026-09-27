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
  IF v_pub_id IS NULL THEN v_pub_id := replace(gen_random_uuid()::text, '-', ''); END IF;

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

REVOKE ALL ON FUNCTION public.join_room_session(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_session(uuid,text,text,text,text) TO anon, authenticated, service_role;