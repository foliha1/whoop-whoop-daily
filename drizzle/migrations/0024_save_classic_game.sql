CREATE OR REPLACE FUNCTION public.save_classic_game(
  p_room_id uuid, p_game_id uuid, p_visitor_id text, p_player_key text,
  p_end_reason text, p_seats jsonb, p_rounds_played integer,
  p_correct_claims integer, p_wrong_claims integer, p_app_version text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_started timestamptz;
  v_secs numeric;
  v_count integer;
  v_reason text;
  v_ids jsonb;
  v_browsers integer;
  v_users integer;
  v_host_user uuid;
BEGIN
  IF NOT public.rl_hit('classic_save_ip', public.request_ip(), 200) THEN RETURN true; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.rl_hit('classic_save_user', auth.uid()::text, 200) THEN RETURN true; END IF;
  IF p_room_id IS NULL OR p_game_id IS NULL THEN RETURN true; END IF;

  SELECT * INTO v_room FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND OR v_room.host_visitor_id IS DISTINCT FROM btrim(COALESCE(p_visitor_id, ''))
     OR v_room.host_key IS NULL OR v_room.host_key IS DISTINCT FROM btrim(COALESCE(p_player_key, '')) THEN
    v_reason := 'not_host';
  END IF;

  IF v_reason IS NULL THEN
    SELECT min(s.created_at), count(*) INTO v_started, v_count
    FROM public.room_seats s WHERE s.room_id = p_room_id AND s.game_id = p_game_id;
    IF v_count = 0 THEN v_reason := 'unknown_game'; END IF;
  END IF;

  IF v_reason IS NULL AND EXISTS (SELECT 1 FROM public.classic_results c WHERE c.game_id = p_game_id) THEN
    RETURN true;
  END IF;

  IF v_reason IS NULL THEN
    IF p_seats IS NULL OR jsonb_typeof(p_seats) <> 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_seats) e WHERE jsonb_typeof(e->'seat') <> 'number')
       OR ARRAY(SELECT s.seat FROM public.room_seats s
                WHERE s.room_id = p_room_id AND s.game_id = p_game_id ORDER BY s.seat)
          IS DISTINCT FROM
          ARRAY(SELECT (e->>'seat')::integer FROM jsonb_array_elements(p_seats) e ORDER BY 1) THEN
      v_reason := 'seat_mismatch';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
    v_secs := EXTRACT(EPOCH FROM (now() - v_started));
    IF v_secs > 21600 THEN
      v_reason := 'too_long';
    ELSIF v_secs < (CASE WHEN p_end_reason = 'target' THEN 30 ELSE 10 END) THEN
      v_reason := 'too_short';
    END IF;
  END IF;

  IF v_reason IS NULL THEN
    v_reason := public.classic_score_reject_reason(p_end_reason, p_seats, v_count,
                  p_rounds_played, p_correct_claims, p_wrong_claims);
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.analytics_events (event_type, room_code, visitor_id, metadata)
    VALUES ('classic_result_rejected', v_room.room_code, NULL,
            jsonb_build_object('reason', v_reason, 'game_id', p_game_id, 'path', 'multi'));
    RETURN true;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('seat', s.seat, 'visitor_id', s.visitor_id, 'user_id', s.user_id) ORDER BY s.seat),
         count(DISTINCT s.visitor_id), count(DISTINCT s.user_id)
    INTO v_ids, v_browsers, v_users
  FROM public.room_seats s WHERE s.room_id = p_room_id AND s.game_id = p_game_id;
  SELECT m.user_id INTO v_host_user FROM public.room_members m
  WHERE m.room_id = p_room_id AND m.player_key = v_room.host_key;

  INSERT INTO public.classic_results (
    game_id, room_code, is_solo, started_at, ended_at, duration_ms, player_count, seats,
    rounds_played, correct_claims, wrong_claims, app_version, host_visitor_id,
    seat_identities, host_user_id, end_reason, distinct_browsers, distinct_users, verified
  ) VALUES (
    p_game_id, v_room.room_code, false, v_started, now(), (v_secs * 1000)::integer, v_count,
    public.classic_ranked_seats(p_seats), p_rounds_played, p_correct_claims, p_wrong_claims,
    COALESCE(NULLIF(left(p_app_version, 40), ''), 'unknown'), v_room.host_visitor_id,
    v_ids, v_host_user, p_end_reason, v_browsers, v_users, true
  ) ON CONFLICT (game_id) DO NOTHING;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_classic_game(uuid, uuid, text, text, text, jsonb, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_classic_game(uuid, uuid, text, text, text, jsonb, integer, integer, integer, text) TO anon, authenticated, service_role;