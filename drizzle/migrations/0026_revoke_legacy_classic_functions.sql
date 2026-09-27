REVOKE EXECUTE ON FUNCTION public.save_classic_result(uuid, text, boolean, timestamptz, timestamptz, integer, jsonb, integer, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.join_room_session(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_room_seats(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.room_seat_keys(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.save_classic_result(uuid, text, boolean, timestamptz, timestamptz, integer, jsonb, integer, integer, integer, text, text) IS 'DEPRECATED: replaced by save_classic_game / save_solo_game';
COMMENT ON FUNCTION public.join_room_session(uuid, text, text) IS 'DEPRECATED: replaced by 4-arg join_room_session';
COMMENT ON FUNCTION public.register_room_seats(uuid, uuid, text, jsonb) IS 'DEPRECATED: replaced by register_room_seats_by_pid';
COMMENT ON FUNCTION public.room_seat_keys(uuid, uuid, text) IS 'DEPRECATED: replaced by room_sign_keys';