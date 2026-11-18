-- Generate private table and group invite codes from cryptographic random bytes.
-- Function signatures, code alphabets, code lengths, grants, and retry behavior stay unchanged.

CREATE OR REPLACE FUNCTION public.create_room(p_visitor_id text)
RETURNS TABLE(id uuid, room_code text, status text, is_host boolean, host_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
BEGIN
  IF length(v_visitor) = 0 THEN RETURN; END IF;
  IF NOT public.rl_hit('room_create_ip', public.request_ip(), 30) THEN
    RAISE EXCEPTION 'Too many tables created. Try again tomorrow.' USING ERRCODE = 'P0001';
  END IF;
  FOR attempt IN 1..8 LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alpha, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_alpha)), 1);
    END LOOP;
    BEGIN
      RETURN QUERY
      INSERT INTO public.rooms (room_code, host_visitor_id)
      VALUES (v_code, v_visitor)
      RETURNING rooms.id, rooms.room_code, rooms.status, true, rooms.host_key;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not create a table. Please try again.';
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_daily_group_code()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public'
AS $$
DECLARE
  c_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code text := '';
  i integer;
BEGIN
  FOR i IN 1 .. 6 LOOP
    v_code := v_code || substr(c_alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(c_alphabet)), 1);
  END LOOP;
  RETURN v_code;
END;
$$;
