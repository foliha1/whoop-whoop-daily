ALTER TABLE public.classic_results ADD COLUMN IF NOT EXISTS solo_player_correct integer, ADD COLUMN IF NOT EXISTS solo_player_wrong integer, ADD COLUMN IF NOT EXISTS solo_victory_ms integer;
CREATE TABLE public.player_hosted_tables (room_id uuid PRIMARY KEY, room_code text NOT NULL, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.player_hosted_tables TO service_role;
REVOKE ALL ON public.player_hosted_tables FROM PUBLIC, anon, authenticated;
ALTER TABLE public.player_hosted_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY hosted_service ON public.player_hosted_tables FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE FUNCTION public.capture_hosted_table() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NOT NULL THEN INSERT INTO public.player_hosted_tables(room_id,room_code,user_id) VALUES(NEW.id,NEW.room_code,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.capture_hosted_table() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_hosted_table AFTER INSERT ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.capture_hosted_table();
CREATE FUNCTION public.save_solo_player_stats(p_game_id uuid,p_correct integer,p_wrong integer,p_victory_ms integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR p_correct IS NULL OR p_wrong IS NULL OR p_correct<0 OR p_wrong<0 THEN RETURN false; END IF;
 UPDATE public.classic_results c SET solo_player_correct=p_correct,solo_player_wrong=p_wrong,solo_victory_ms=CASE WHEN p_victory_ms BETWEEN 1 AND c.duration_ms AND c.end_reason='target' AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.seats) s WHERE (s->>'seat')::integer=0 AND (s->>'score')::integer>=12) THEN p_victory_ms ELSE NULL END
 WHERE c.game_id=p_game_id AND c.is_solo AND c.verified AND c.host_user_id=auth.uid() AND c.solo_player_correct IS NULL AND p_correct<=c.correct_claims AND p_wrong<=c.wrong_claims;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.save_solo_player_stats(uuid,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_solo_player_stats(uuid,integer,integer,integer) TO authenticated,service_role;
CREATE FUNCTION public.get_player_match_stats() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('games',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.game_id,'mode',CASE WHEN c.is_solo THEN 'solo' ELSE 'together' END,'won',CASE WHEN c.is_solo THEN c.end_reason='target' AND (s->>'score')::integer>=12 ELSE (s->>'position')::integer=1 END,'correct',c.solo_player_correct,'wrong',c.solo_player_wrong,'victoryMs',c.solo_victory_ms)) FROM public.classic_results c CROSS JOIN LATERAL jsonb_array_elements(c.seat_identities) i CROSS JOIN LATERAL jsonb_array_elements(c.seats) s WHERE auth.uid() IS NOT NULL AND c.verified AND i->>'user_id'=auth.uid()::text AND s->>'seat'=i->>'seat'),'[]'::jsonb),'tables',coalesce((SELECT jsonb_agg(t.code) FROM (SELECT room_code AS code FROM public.player_hosted_tables WHERE user_id=auth.uid() UNION SELECT room_code FROM public.classic_results WHERE verified AND NOT is_solo AND host_user_id=auth.uid()) t),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.get_player_match_stats() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_match_stats() TO authenticated,service_role;