ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.room_seats ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.classic_results
  ADD COLUMN IF NOT EXISTS seat_identities jsonb,
  ADD COLUMN IF NOT EXISTS host_user_id uuid,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS distinct_browsers integer,
  ADD COLUMN IF NOT EXISTS distinct_users integer,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.solo_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  visitor_id text,
  user_id uuid,
  finished_at timestamptz
);
REVOKE ALL ON public.solo_games FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.solo_games TO service_role;
ALTER TABLE public.solo_games ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.classic_score_reject_reason(
  p_end_reason text, p_seats jsonb, p_expected_count integer,
  p_rounds_played integer, p_correct_claims integer, p_wrong_claims integer
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE
  v_seat jsonb;
  v_score numeric;
  v_sum numeric := 0;
  v_top integer := 0;
BEGIN
  IF p_end_reason IS NULL OR p_end_reason NOT IN ('target','table_empty','stalled') THEN RETURN 'bad_end_reason'; END IF;
  IF p_seats IS NULL OR jsonb_typeof(p_seats) <> 'array' THEN RETURN 'bad_seats'; END IF;
  IF jsonb_array_length(p_seats) <> p_expected_count THEN RETURN 'seat_mismatch'; END IF;
  IF p_rounds_played IS NULL OR p_rounds_played < 1 OR p_rounds_played > 400 THEN RETURN 'bad_rounds'; END IF;
  IF p_correct_claims IS NULL OR p_correct_claims < 0 OR p_correct_claims > 400 THEN RETURN 'bad_correct_claims'; END IF;
  IF p_wrong_claims IS NULL OR p_wrong_claims < 0 OR p_wrong_claims > 400 THEN RETURN 'bad_wrong_claims'; END IF;
  FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats) LOOP
    IF jsonb_typeof(v_seat) <> 'object' OR jsonb_typeof(v_seat->'seat') <> 'number'
       OR jsonb_typeof(v_seat->'score') <> 'number' THEN RETURN 'bad_seat_fields'; END IF;
    IF char_length(COALESCE(v_seat->>'name', '')) > 24 THEN RETURN 'bad_name'; END IF;
    v_score := (v_seat->>'score')::numeric;
    IF v_score <> trunc(v_score) OR v_score < 0 OR v_score > 13 THEN RETURN 'bad_score'; END IF;
    v_sum := v_sum + v_score;
    IF v_score >= 12 THEN v_top := v_top + 1; END IF;
  END LOOP;
  IF v_sum > 48 THEN RETURN 'bad_score_sum'; END IF;
  IF p_end_reason = 'target' AND v_top <> 1 THEN RETURN 'bad_winner'; END IF;
  IF p_end_reason <> 'target' AND v_top <> 0 THEN RETURN 'bad_early_end'; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.classic_score_reject_reason(text, jsonb, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classic_score_reject_reason(text, jsonb, integer, integer, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.classic_ranked_seats(p_seats jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'seat', (e->>'seat')::integer,
    'name', left(COALESCE(e->>'name', ''), 24),
    'score', (e->>'score')::integer,
    'position', 1 + (SELECT count(*) FROM jsonb_array_elements(p_seats) o
                     WHERE (o->>'score')::numeric > (e->>'score')::numeric)
  ) ORDER BY (e->>'seat')::integer), '[]'::jsonb)
  FROM jsonb_array_elements(p_seats) e
$fn$;
REVOKE ALL ON FUNCTION public.classic_ranked_seats(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classic_ranked_seats(jsonb) TO service_role;