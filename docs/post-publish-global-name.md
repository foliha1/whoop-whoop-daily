# Global name publish-day checklist

1. Confirm the published bundle calls the five-argument `join_room_session` with `p_display_name` and calls `room_member_names`.
2. Confirm the published bundle no longer relies on Realtime presence `display_name` or `is_host` fields.
3. Revoke `EXECUTE` on `join_room_session(uuid,text,text,text)` from `PUBLIC`, `anon`, and `authenticated`; preserve `service_role` only if operationally needed.
4. Run a published two-browser Classic game. Spoof a presence name and host flag; confirm neither changes the lobby or frozen seat names.
5. Confirm blocked names return `Try another name.`, a signed-in name follows the account to a second browser, and a normal Classic result saves with canonical seat names.
6. Delete only rows whose room codes, visitor IDs, user IDs, and timestamps were recorded for this check.