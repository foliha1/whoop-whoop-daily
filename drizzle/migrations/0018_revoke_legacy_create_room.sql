REVOKE EXECUTE ON FUNCTION public.create_room(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room(text, text) TO service_role;