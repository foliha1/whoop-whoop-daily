CREATE OR REPLACE FUNCTION public.start_solo_game(p_visitor_id text)
RETURNS TABLE(id uuid, started_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_visitor text := NULLIF(left(btrim(COALESCE(p_visitor_id, '')), 100), '');
BEGIN
  IF NOT public.rl_hit('solo_start_ip', public.request_ip(), 150) THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.rl_hit('solo_start_user', auth.uid()::text, 100) THEN RETURN; END IF;
  RETURN QUERY
  INSERT INTO public.solo_games AS g (visitor_id, user_id) VALUES (v_visitor, auth.uid())
  RETURNING g.id, g.started_at;
END;
$fn$;
REVOKE ALL ON FUNCTION public.start_solo_game(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_solo_game(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_solo_game(
  p_game_id uuid, p_end_reason text, p_seats jsonb, p_rounds_played integer,
  p_correct_claims integer, p_wrong_claims integer, p_app_version text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g public.solo_games%ROWTYPE;
  v_secs numeric;
  v_reason text;
BEGIN
  IF NOT public.rl_hit('classic_save_ip', public.request_ip(), 200) THEN RETURN true; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.rl_hit('classic_save_user', auth.uid()::text, 200) THEN RETURN true; END IF;
  IF p_game_id IS NULL THEN
    v_reason := 'unknown_game';
  END IF;

  IF v_reason IS NULL THEN
    UPDATE public.solo_games s SET finished_at = now()
    WHERE s.id = p_game_id AND s.finished_at IS NULL
    RETURNING * INTO g;
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.solo_games s WHERE s.id = p_game_id) THEN RETURN true; END IF;
      v_reason := 'unknown_game';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
    v_secs := EXTRACT(EPOCH FROM (g.finished_at - g.started_at));
    IF v_secs > 21600 THEN
      v_reason := 'too_long';
    ELSIF v_secs < (CASE WHEN p_end_reason = 'target' THEN 30 ELSE 10 END) THEN
      v_reason := 'too_short';
    END IF;
  END IF;
  IF v_reason IS NULL THEN
    v_reason := public.classic_score_reject_reason(p_end_reason, p_seats, 2,
                  p_rounds_played, p_correct_claims, p_wrong_claims);
  END IF;
  IF v_reason IS NULL AND ARRAY(SELECT (e->>'seat')::integer FROM jsonb_array_elements(p_seats) e ORDER BY 1) <> ARRAY[0,1] THEN
    v_reason := 'seat_mismatch';
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.analytics_events (event_type, room_code, visitor_id, metadata)
    VALUES ('classic_result_rejected', NULL, NULL,
            jsonb_build_object('reason', v_reason, 'game_id', p_game_id, 'path', 'solo'));
    RETURN true;
  END IF;

  INSERT INTO public.classic_results (
    game_id, room_code, is_solo, started_at, ended_at, duration_ms, player_count, seats,
    rounds_played, correct_claims, wrong_claims, app_version, host_visitor_id,
    seat_identities, host_user_id, end_reason, distinct_browsers, distinct_users, verified
  ) VALUES (
    g.id, NULL, true, g.started_at, g.finished_at, (v_secs * 1000)::integer, 2,
    public.classic_ranked_seats(p_seats), p_rounds_played, p_correct_claims, p_wrong_claims,
    COALESCE(NULLIF(left(p_app_version, 40), ''), 'unknown'), g.visitor_id,
    jsonb_build_array(jsonb_build_object('seat', 0, 'visitor_id', g.visitor_id, 'user_id', g.user_id),
                      jsonb_build_object('seat', 1, 'bot', true)),
    g.user_id, p_end_reason, 1, (CASE WHEN g.user_id IS NULL THEN 0 ELSE 1 END), true
  ) ON CONFLICT (game_id) DO NOTHING;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_solo_game(uuid, text, jsonb, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_solo_game(uuid, text, jsonb, integer, integer, integer, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.join_room_session(p_room_id uuid, p_visitor_id text, p_player_key text, p_sign_pubkey text)
 RETURNS TABLE(game_id uuid, seat integer, pub_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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
  INSERT INTO public.room_members (room_id, player_key, visitor_id, pub_id, sign_pubkey, user_id)
  VALUES (p_room_id, v_key, v_visitor, v_pub, v_pk, auth.uid())
  ON CONFLICT (room_id, player_key) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.room_members m
                 WHERE m.room_id = p_room_id AND m.player_key = v_key AND m.visitor_id = v_visitor) THEN
    RETURN;
  END IF;
  UPDATE public.room_members m SET pub_id = coalesce(m.pub_id, v_pub), sign_pubkey = v_pk, user_id = auth.uid()
  WHERE m.room_id = p_room_id AND m.player_key = v_key;
  SELECT m.pub_id INTO v_pub FROM public.room_members m
  WHERE m.room_id = p_room_id AND m.player_key = v_key;

  UPDATE public.rooms r SET host_key = v_key
  WHERE r.id = p_room_id AND r.host_visitor_id = v_visitor;

  UPDATE public.room_seats s SET player_key = v_key, pub_id = v_pub, user_id = auth.uid()
  WHERE s.room_id = p_room_id AND s.visitor_id = v_visitor;

  SELECT s.game_id INTO v_game FROM public.room_seats s
  WHERE s.room_id = p_room_id ORDER BY s.created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT v_game, (SELECT s.seat FROM public.room_seats s
                  WHERE s.room_id = p_room_id AND s.game_id = v_game AND s.visitor_id = v_visitor
                  LIMIT 1), v_pub;
END;
$fn$;
REVOKE ALL ON FUNCTION public.join_room_session(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_room_session(uuid, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_room_seats_by_pid(p_room_id uuid, p_game_id uuid, p_host_visitor_id text, p_seats jsonb)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_host text := btrim(coalesce(p_host_visitor_id, ''));
  v_seat jsonb;
  v_pid text;
  v_visitor text;
  v_key text;
  v_user uuid;
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
    v_visitor := NULL;
    v_key := NULL;
    v_user := NULL;
    SELECT m.visitor_id, m.player_key, m.user_id INTO v_visitor, v_key, v_user FROM public.room_members m
    WHERE m.room_id = p_room_id AND m.pub_id = v_pid;
    IF v_visitor IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.room_seats (room_id, game_id, seat, visitor_id, player_key, pub_id, user_id)
    VALUES (p_room_id, p_game_id, (v_seat ->> 'seat')::integer, v_visitor, v_key, v_pid, v_user)
    ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n > 0;
END;
$fn$;
REVOKE ALL ON FUNCTION public.register_room_seats_by_pid(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_room_seats_by_pid(uuid, uuid, text, jsonb) TO anon, authenticated, service_role;