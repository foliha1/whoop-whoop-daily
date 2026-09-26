import { supabase } from "@/integrations/supabase/client";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

export function generateRoomCode(): string {
  let out = "";
  const bytes = new Uint32Array(CODE_LEN);
  try {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  } catch {
    for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== CODE_LEN) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export const ROOM_CODE_ALPHABET = ALPHABET;
export const ROOM_CODE_LENGTH = CODE_LEN;

export interface RoomRow {
  id: string;
  room_code: string;
  status: string;
  is_host: boolean;
  host_key?: string | null;
}

export async function createRoom(hostVisitorId: string): Promise<RoomRow> {
  // The server generates the code (collision-retried) and rate-caps creation.
  const { data, error } = await supabase.rpc("create_room", { p_visitor_id: hostVisitorId });
  if (!error && Array.isArray(data) && data.length > 0) return data[0] as RoomRow;
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: string }).message)
      : "Could not create a table. Please try again.";
  throw new Error(msg);
}

/**
 * Registers this tab's session player key with the server over this
 * browser's own request. Returns the seat this browser already holds in the
 * room's latest game (server-verified rejoin), or null.
 */
export async function joinRoomSession(
  roomId: string,
  visitorId: string,
  playerKey: string,
): Promise<{ game_id: string; seat: number } | null> {
  try {
    const { data, error } = await supabase.rpc("join_room_session", {
      p_room_id: roomId,
      p_visitor_id: visitorId,
      p_player_key: playerKey,
    });
    if (error) {
      console.warn("[rooms] join session failed", error.message);
      return null;
    }
    return Array.isArray(data) && data.length > 0 ? (data[0] as { game_id: string; seat: number }) : null;
  } catch (e) {
    console.warn("[rooms] join session threw", e);
    return null;
  }
}

/** Host-only: the server's current player key for each seat of a game. */
export async function fetchSeatKeys(
  roomId: string,
  gameId: string,
  hostVisitorId: string,
): Promise<Array<{ seat: number; player_key: string | null }>> {
  try {
    const { data, error } = await supabase.rpc("room_seat_keys", {
      p_room_id: roomId,
      p_game_id: gameId,
      p_host_visitor_id: hostVisitorId,
    });
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ seat: number; player_key: string | null }>;
  } catch {
    return [];
  }
}

export async function findRoomByCode(
  code: string,
  visitorId: string,
): Promise<RoomRow | null> {
  const normalized = code.toUpperCase();
  if (!isValidRoomCode(normalized)) return null;
  try {
    const { data, error } = await supabase.rpc("get_room_by_code", {
      p_code: normalized,
      p_visitor_id: visitorId,
    });
    if (error) {
      console.warn("[rooms] lookup failed", error.message);
      return null;
    }
    if (Array.isArray(data) && data.length > 0) return data[0] as RoomRow;
    return null;
  } catch (e) {
    console.warn("[rooms] lookup threw", e);
    return null;
  }
}

/**
 * Registers this tab's session key AND its per-join signing public key.
 * Returns this tab's public id (the only identity it shows on the channel).
 */
export async function joinRoomSessionSigned(
  roomId: string,
  visitorId: string,
  playerKey: string,
  signPubkey: string,
): Promise<{ pub_id: string; game_id: string | null; seat: number | null } | null> {
  try {
    const { data, error } = await supabase.rpc("join_room_session", {
      p_room_id: roomId,
      p_visitor_id: visitorId,
      p_player_key: playerKey,
      p_sign_pubkey: signPubkey,
    });
    if (error) {
      console.warn("[rooms] signed join failed", error.message);
      return null;
    }
    const row = Array.isArray(data) && data.length > 0 ? (data[0] as { pub_id: string | null; game_id: string | null; seat: number | null }) : null;
    return row?.pub_id ? { pub_id: row.pub_id, game_id: row.game_id, seat: row.seat } : null;
  } catch (e) {
    console.warn("[rooms] signed join threw", e);
    return null;
  }
}

/** Public signing keys for this room; the server only answers members. */
export async function fetchSignKeys(
  roomId: string,
  visitorId: string,
  playerKey: string,
): Promise<Array<{ role: string; seat: number | null; pub_id: string; sign_pubkey: string }> | null> {
  try {
    const { data, error } = await supabase.rpc("room_sign_keys", {
      p_room_id: roomId,
      p_visitor_id: visitorId,
      p_player_key: playerKey,
    });
    if (error || !Array.isArray(data)) return null;
    return data as Array<{ role: string; seat: number | null; pub_id: string; sign_pubkey: string }>;
  } catch {
    return null;
  }
}
