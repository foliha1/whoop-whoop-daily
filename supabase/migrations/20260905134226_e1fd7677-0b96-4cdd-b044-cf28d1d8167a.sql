CREATE OR REPLACE FUNCTION public.classic_result_reject_reason(
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_player_count integer,
  p_seats jsonb,
  p_rounds_played integer,
  p_correct_claims integer,
  p_wrong_claims integer,
  p_is_solo boolean
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_seconds numeric;
  v_seat jsonb;
BEGIN
  IF p_started_at IS NULL OR p_ended_at IS NULL THEN RETURN 'missing_times'; END IF;
  IF p_ended_at <= p_started_at THEN RETURN 'ended_before_started'; END IF;
  v_seconds := EXTRACT(EPOCH FROM (p_ended_at - p_started_at));
  IF v_seconds < 10 THEN RETURN 'too_short'; END IF;
  IF v_seconds > 21600 THEN RETURN 'too_long'; END IF;
  IF p_player_count < 2 OR p_player_count > 6 THEN RETURN 'bad_player_count'; END IF;
  IF p_is_solo AND p_player_count <> 2 THEN RETURN 'bad_solo_players'; END IF;
  IF p_rounds_played < 1 OR p_rounds_played > 400 THEN RETURN 'bad_rounds'; END IF;
  IF p_correct_claims < 0 OR p_correct_claims > 400 THEN RETURN 'bad_correct_claims'; END IF;
  IF p_wrong_claims < 0 OR p_wrong_claims > 400 THEN RETURN 'bad_wrong_claims'; END IF;
  IF p_seats IS NULL OR jsonb_typeof(p_seats) <> 'array' THEN RETURN 'bad_seats'; END IF;
  IF jsonb_array_length(p_seats) <> p_player_count THEN RETURN 'seat_count_mismatch'; END IF;
  FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats) LOOP
    IF jsonb_typeof(v_seat) <> 'object' THEN RETURN 'bad_seat_shape'; END IF;
    IF (v_seat->>'seat') IS NULL OR (v_seat->>'score') IS NULL OR (v_seat->>'position') IS NULL THEN
      RETURN 'bad_seat_fields';
    END IF;
    IF (v_seat->>'score')::numeric < 0 OR (v_seat->>'score')::numeric > 60 THEN RETURN 'bad_score'; END IF;
    IF (v_seat->>'position')::numeric < 1 OR (v_seat->>'position')::numeric > p_player_count THEN
      RETURN 'bad_position';
    END IF;
    IF char_length(COALESCE(v_seat->>'name', '')) > 24 THEN RETURN 'bad_name'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;