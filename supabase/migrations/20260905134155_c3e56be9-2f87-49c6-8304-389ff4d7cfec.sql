CREATE TABLE public.classic_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL UNIQUE,
  room_code text,
  is_solo boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  player_count integer NOT NULL DEFAULT 0,
  seats jsonb NOT NULL DEFAULT '[]'::jsonb,
  rounds_played integer NOT NULL DEFAULT 0,
  correct_claims integer NOT NULL DEFAULT 0,
  wrong_claims integer NOT NULL DEFAULT 0,
  app_version text NOT NULL DEFAULT 'unknown',
  host_visitor_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.classic_results TO service_role;
GRANT SELECT ON public.classic_results TO authenticated;

ALTER TABLE public.classic_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read classic results"
  ON public.classic_results
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE TRIGGER classic_results_touch_updated_at
  BEFORE UPDATE ON public.classic_results
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX classic_results_created_at_idx ON public.classic_results (created_at DESC);

-- Server-side plausibility gate. Mirrors the daily's approach: nothing the
-- client sends is trusted, and a rejection is invisible to the player.
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

-- The only write path. Host-only in the client, idempotent per game id, and
-- always success-shaped so a real player never sees a failure.
CREATE OR REPLACE FUNCTION public.save_classic_result(
  p_game_id uuid,
  p_room_code text,
  p_is_solo boolean,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_player_count integer,
  p_seats jsonb,
  p_rounds_played integer,
  p_correct_claims integer,
  p_wrong_claims integer,
  p_app_version text,
  p_host_visitor_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
BEGIN
  IF p_game_id IS NULL THEN RETURN true; END IF;

  -- Cheap abuse ceiling per host, same helper the daily uses.
  IF NOT public.rl_hit('classic_result', COALESCE(p_host_visitor_id, public.request_ip()), 200) THEN
    RETURN true;
  END IF;

  -- Clock skew: never trust the client's idea of "now".
  IF p_ended_at > now() + interval '5 minutes' OR p_started_at < now() - interval '1 day' THEN
    INSERT INTO public.analytics_events (event_type, room_code, visitor_id, metadata)
    VALUES ('classic_result_rejected', p_room_code, p_host_visitor_id,
            jsonb_build_object('reason', 'bad_clock', 'game_id', p_game_id));
    RETURN true;
  END IF;

  v_reason := public.classic_result_reject_reason(
    p_started_at, p_ended_at, p_player_count, p_seats,
    p_rounds_played, p_correct_claims, p_wrong_claims, COALESCE(p_is_solo, false)
  );

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.analytics_events (event_type, room_code, visitor_id, metadata)
    VALUES ('classic_result_rejected', p_room_code, p_host_visitor_id,
            jsonb_build_object('reason', v_reason, 'game_id', p_game_id));
    RETURN true;
  END IF;

  INSERT INTO public.classic_results (
    game_id, room_code, is_solo, started_at, ended_at, duration_ms,
    player_count, seats, rounds_played, correct_claims, wrong_claims,
    app_version, host_visitor_id
  ) VALUES (
    p_game_id,
    NULLIF(upper(COALESCE(p_room_code, '')), ''),
    COALESCE(p_is_solo, false),
    p_started_at,
    p_ended_at,
    GREATEST(0, (EXTRACT(EPOCH FROM (p_ended_at - p_started_at)) * 1000)::integer),
    p_player_count,
    p_seats,
    p_rounds_played,
    p_correct_claims,
    p_wrong_claims,
    COALESCE(NULLIF(p_app_version, ''), 'unknown'),
    p_host_visitor_id
  )
  ON CONFLICT (game_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_classic_result(uuid, text, boolean, timestamptz, timestamptz, integer, jsonb, integer, integer, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_classic_result(uuid, text, boolean, timestamptz, timestamptz, integer, jsonb, integer, integer, integer, text, text) TO anon, authenticated, service_role;

-- Admin dashboard summary.
CREATE OR REPLACE FUNCTION public.admin_classic(p_from date, p_to date)
RETURNS TABLE(
  games_completed integer,
  median_seconds numeric,
  avg_players numeric,
  solo_games integer,
  multiplayer_games integer,
  avg_correct_claims numeric,
  avg_wrong_claims numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::integer,
    ROUND(COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) / 1000.0, 0)::numeric, 1),
    ROUND(COALESCE(AVG(player_count), 0)::numeric, 2),
    COUNT(*) FILTER (WHERE is_solo)::integer,
    COUNT(*) FILTER (WHERE NOT is_solo)::integer,
    ROUND(COALESCE(AVG(correct_claims), 0)::numeric, 2),
    ROUND(COALESCE(AVG(wrong_claims), 0)::numeric, 2)
  FROM public.classic_results
  WHERE public.is_admin()
    AND created_at >= p_from::timestamptz
    AND created_at < (p_to + 1)::timestamptz;
$$;

GRANT EXECUTE ON FUNCTION public.admin_classic(date, date) TO authenticated, service_role;