CREATE OR REPLACE FUNCTION public.table_member(
  p_room_id uuid,
  p_visitor_id text,
  p_player_key text
)
RETURNS TABLE(pub_id text, display_name text, is_host boolean, room_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_key text := left(btrim(coalesce(p_player_key, '')), 64);
BEGIN
  IF p_room_id IS NULL OR length(v_visitor) = 0 OR length(v_key) < 16 THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.pub_id, m.display_name, (r.host_visitor_id = m.visitor_id), r.room_code
  FROM public.room_members m
  JOIN public.rooms r ON r.id = m.room_id
  WHERE m.room_id = p_room_id
    AND m.visitor_id = v_visitor
    AND m.player_key = v_key
    AND m.pub_id IS NOT NULL
    AND m.display_name IS NOT NULL
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.table_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.table_member(uuid, text, text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.table_member(uuid, text, text) IS
  'Together table server (PartyKit plan step 4): confirms a visitor holds this room''s secret player key and returns only their public id, server-resolved display name, whether they host, and the room code. Read-only; reveals nothing to a caller who does not already know the key.';