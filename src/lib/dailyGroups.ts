import { supabase } from "@/integrations/supabase/client";
import { DAILY_LAUNCH_UTC } from "@/lib/daily";

/**
 * Group leaderboards, data layer.
 *
 * Everything is keyed to puzzle number, never to a date: the daily seed rolls at
 * each player's local midnight, so a member in another timezone can be a puzzle
 * ahead. The ranking and points rules below mirror the SQL in the
 * `get_group_today` / `get_group_season` RPCs exactly, so the UI can reason about
 * them without a round trip.
 */

export const GROUP_MAX_MEMBERS = 20;
export const GROUP_MAX_PER_PERSON = 5;
export const GROUP_NAME_MAX = 24;
export const GROUP_CODE_LENGTH = 6;
/** No look-alike characters: no i, l, o, 0, 1. */
export const GROUP_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const MS_PER_DAY = 86_400_000;

export type GroupTodayRow = {
  visitor_id: string;
  display_name: string;
  rounds_solved: number;
  total_misses: number;
  peek_used: boolean;
  rank_position: number | null;
  not_played: boolean;
  is_me: boolean;
};

export type GroupSeasonRow = {
  visitor_id: string;
  display_name: string;
  points: number;
  puzzles_played: number;
  rank_position: number;
  is_me: boolean;
  season_start: string;
};

export type MyGroup = {
  group_id: string;
  name: string;
  code: string;
  member_count: number;
  my_position: number | null;
  my_points: number;
  puzzle_number: number | null;
};

/** A puzzle number is a pure function of its local date. */
export function puzzleDate(puzzleNumber: number): Date {
  return new Date(DAILY_LAUNCH_UTC + (Math.max(1, puzzleNumber) - 1) * MS_PER_DAY);
}

/**
 * Weekly season key, Monday-anchored, derived and never stored — same as
 * `date_trunc('week', puzzle_date)` in Postgres.
 */
export function seasonStart(puzzleNumber: number): string {
  const d = puzzleDate(puzzleNumber);
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7; // Monday = 0
  const start = new Date(d.getTime() - back * MS_PER_DAY);
  return start.toISOString().slice(0, 10);
}

export function sameSeason(a: number, b: number): boolean {
  return seasonStart(a) === seasonStart(b);
}

export type Score = { rounds_solved: number; total_misses: number };

/**
 * Ranking: rounds solved desc, then misses asc. Ties share a position, and the
 * next distinct score takes the position it would have had counting all tied
 * players. Never ranks on elapsed_ms — that number is hidden from players.
 */
export function rankScores<T extends Score>(scores: T[]): (T & { position: number })[] {
  const better = (a: Score, b: Score) =>
    a.rounds_solved > b.rounds_solved ||
    (a.rounds_solved === b.rounds_solved && a.total_misses < b.total_misses);
  return scores.map((s) => ({
    ...s,
    position: 1 + scores.filter((o) => better(o, s)).length,
  }));
}

/** 3 for 1st, 2 for 2nd, 1 for 3rd, nothing below. Not playing scores nothing. */
export function pointsForPosition(position: number): number {
  if (position === 1) return 3;
  if (position === 2) return 2;
  if (position === 3) return 1;
  return 0;
}

/** Season points for one member across a set of per-puzzle score tables. */
export function seasonPoints(
  visitorId: string,
  puzzles: { scores: (Score & { visitor_id: string })[] }[],
): { points: number; played: number } {
  let points = 0;
  let played = 0;
  for (const p of puzzles) {
    const ranked = rankScores(p.scores);
    const mine = ranked.find((r) => r.visitor_id === visitorId);
    if (!mine) continue;
    played += 1;
    points += pointsForPosition(mine.position);
  }
  return { points, played };
}

// -------------------------------------------------------------- email linkage ---

/**
 * Mirror of `public.email_linked_to_visitor`. An address only counts as a
 * member's own when the Daily already ties the two together — a result stamped
 * with it, or a subscriber row for it. Group membership emails are supplied by
 * the joiner, so an unlinked address must never widen whose results a member
 * matches; the server refuses it on write and ignores it on read.
 */
export type EmailLink = { visitorId: string; email: string };

export function isEmailLinkedToVisitor(
  visitorId: string,
  email: string | null | undefined,
  links: EmailLink[],
): boolean {
  const v = visitorId.trim();
  const e = (email ?? "").trim().toLowerCase();
  if (v.length === 0 || e.length === 0) return false;
  return links.some((l) => l.visitorId === v && l.email.trim().toLowerCase() === e);
}

/**
 * Which results belong to a group member: always their own visitor's rows, plus
 * rows under their email only when that email is linked to them.
 */
export function resultsForMember<T extends { visitor_id: string; email?: string | null }>(
  member: { visitor_id: string; email?: string | null },
  results: T[],
  links: EmailLink[],
): T[] {
  const linked = isEmailLinkedToVisitor(member.visitor_id, member.email, links)
    ? (member.email ?? "").trim().toLowerCase()
    : null;
  return results.filter(
    (r) =>
      r.visitor_id === member.visitor_id ||
      (linked !== null && (r.email ?? "").trim().toLowerCase() === linked),
  );
}

// ------------------------------------------------------------------ identity ---

/**
 * Groups use the Daily's own identity: the visitor id in local storage plus a
 * display name. Email is optional and additive — it links a standing across
 * devices — and is never required to join. This key remembers an address the
 * player chose to add here, when they are not a Daily subscriber.
 */
const GROUP_EMAIL_KEY = "ww_group_email";

export function getGroupEmail(): string | null {
  try {
    const v = window.localStorage.getItem(GROUP_EMAIL_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function rememberGroupEmail(email: string): void {
  try {
    window.localStorage.setItem(GROUP_EMAIL_KEY, email);
  } catch {
    /* private mode: the membership row still carries it server-side */
  }
}

/**
 * Plain messages for the failures the RPCs actually raise. A Postgres error
 * arrives as a plain object, not an Error, so every text field is searched —
 * the raised name lands in `message`, but details and hint carry it too.
 */
export function groupErrorMessage(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) parts.push(err.message);
  else if (err && typeof err === "object") {
    for (const key of ["message", "details", "hint", "code"]) {
      const v = (err as Record<string, unknown>)[key];
      if (typeof v === "string") parts.push(v);
    }
  } else if (err !== null && err !== undefined) parts.push(String(err));
  const raw = parts.join(" ");
  if (raw.includes("group_not_found")) return "No group with that code.";
  if (raw.includes("group_full")) return "That group is full. 20 members is the limit.";
  if (raw.includes("group_limit_reached")) {
    return `You are already in ${GROUP_MAX_PER_PERSON} groups. Leave one to join another.`;
  }
  if (raw.includes("rate_limited")) return "Too many tries today. Try again tomorrow.";
  return "That did not work. Try again in a moment.";
}

// ---------------------------------------------------------------- RPC calls ---

export async function createGroup(name: string, visitorId: string, displayName: string) {
  const { data, error } = await supabase.rpc("create_daily_group", {
    p_name: name,
    p_visitor_id: visitorId,
    p_display_name: displayName,
  });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

export async function joinGroup(
  code: string,
  visitorId: string,
  displayName: string,
  email?: string | null,
) {
  const { data, error } = await supabase.rpc("join_daily_group", {
    p_code: code,
    p_visitor_id: visitorId,
    p_display_name: displayName,
  });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

export async function leaveGroup(groupId: string, visitorId: string) {
  const { data, error } = await supabase.rpc("leave_daily_group", {
    p_group_id: groupId,
    p_visitor_id: visitorId,
  });
  if (error) throw error;
  return data === true;
}

/**
 * The optional restore path. Attaches an address to this visitor's memberships
 * and stamps their existing results with it, so their standing follows them to
 * another device. Never a gate: a member without an address still ranks.
 */
export async function linkGroupEmail(_visitorId: string, _email: string): Promise<void> {
  // Retired: a typed email never links anything. Standing follows the player
  // across devices through sign-in (the membership moves onto the account).
  throw new Error("signin_required");
}

export async function fetchMyGroups(
  visitorId: string,
  email?: string | null,
  puzzleNumber?: number | null,
): Promise<MyGroup[]> {
  const { data, error } = await supabase.rpc("get_my_groups", {
    p_visitor_id: visitorId,
    p_puzzle_number: puzzleNumber ?? undefined,
  });
  if (error) throw error;
  return (data ?? []) as MyGroup[];
}

export async function fetchGroupToday(
  groupId: string,
  puzzleNumber: number,
  visitorId: string,
): Promise<GroupTodayRow[]> {
  const { data, error } = await supabase.rpc("get_group_today", {
    p_group_id: groupId,
    p_puzzle_number: puzzleNumber,
    p_visitor_id: visitorId,
  });
  if (error) throw error;
  return (data ?? []) as GroupTodayRow[];
}

export async function fetchGroupSeason(
  groupId: string,
  puzzleNumber: number,
  visitorId: string,
): Promise<GroupSeasonRow[]> {
  const { data, error } = await supabase.rpc("get_group_season", {
    p_group_id: groupId,
    p_puzzle_number: puzzleNumber,
    p_visitor_id: visitorId,
  });
  if (error) throw error;
  return (data ?? []) as GroupSeasonRow[];
}

// ------------------------------------------------------------- presentation ---

/** 1 → "1st". Used for every standing line, so ordinals never drift. */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const rem100 = abs % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${abs}th`;
  switch (abs % 10) {
    case 1: return `${abs}st`;
    case 2: return `${abs}nd`;
    case 3: return `${abs}rd`;
    default: return `${abs}th`;
  }
}

/**
 * The one-line standing shown on the groups list and the results line.
 *
 * `get_my_groups` returns today's position (null until you have played that
 * puzzle) and this week's points — not a season position — so a member who has
 * not played today falls back to their points for the week.
 */
export function formatStanding(g: Pick<MyGroup, "my_position" | "my_points">): string {
  if (g.my_position !== null && g.my_position !== undefined) {
    return `${ordinal(g.my_position)} today`;
  }
  if (g.my_points > 0) return `${g.my_points} ${g.my_points === 1 ? "pt" : "pts"} this week`;
  return "not played yet";
}

/** The best of several standings: today's position wins, then most points. */
export function bestStanding(groups: MyGroup[]): { group: MyGroup; standing: string } | null {
  if (groups.length === 0) return null;
  const played = groups.filter((g) => g.my_position !== null && g.my_position !== undefined);
  const pool = played.length > 0 ? played : groups;
  const best = [...pool].sort((a, b) => {
    if (played.length > 0) return (a.my_position ?? 99) - (b.my_position ?? 99);
    return b.my_points - a.my_points;
  })[0];
  return { group: best, standing: formatStanding(best) };
}

/** The link handed to other people. Mirrors the invite-link shape already used. */
export function groupJoinUrl(code: string): string {
  return `https://whoop-whoop.com/groups?join=${code}`;
}

/** "Week of Mon 18 Aug" from an ISO season start date. */
export function seasonWeekLabel(seasonStartIso: string): string {
  const d = new Date(`${seasonStartIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Week of ${day} ${date}`;
}

/** Normalises a pasted or linked code: case-insensitive, alphabet only. */
export function normalizeGroupCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split("")
    .filter((c) => GROUP_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, GROUP_CODE_LENGTH);
}
