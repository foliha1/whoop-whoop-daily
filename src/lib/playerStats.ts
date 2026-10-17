import { supabase } from "@/integrations/supabase/client";
import { getSessionUserId } from "@/lib/account";
import { getVisitorId } from "@/lib/visitor";

export interface MatchRecord {
  id: string;
  mode: "solo" | "together";
  won: boolean;
  correct: number | null;
  wrong: number | null;
  victoryMs: number | null;
}
export interface MatchHistory { games: MatchRecord[]; tables: string[] }
export const emptyHistory = (): MatchHistory => ({ games: [], tables: [] });
const key = () => `ww_match_stats:${getSessionUserId() ?? getVisitorId()}`;
export function localMatchHistory(): MatchHistory {
  try { return JSON.parse(localStorage.getItem(key()) ?? "null") ?? emptyHistory(); }
  catch { return emptyHistory(); }
}
export function rememberMatch(record: MatchRecord): void {
  const history = localMatchHistory();
  history.games = [...history.games.filter((g) => g.id !== record.id), record];
  try { localStorage.setItem(key(), JSON.stringify(history)); } catch { /* storage unavailable */ }
}
export function rememberHostedTable(code: string): void {
  const history = localMatchHistory();
  history.tables = [...new Set([...history.tables, code])];
  try { localStorage.setItem(key(), JSON.stringify(history)); } catch { /* storage unavailable */ }
}
export function replaceLocalMatchId(previous: string, next: string): void {
  const history = localMatchHistory();
  const record = history.games.find((g) => g.id === previous);
  if (!record) return;
  history.games = history.games.filter((g) => g.id !== previous && g.id !== next);
  history.games.push({ ...record, id: next });
  try { localStorage.setItem(key(), JSON.stringify(history)); } catch { /* storage unavailable */ }
}
export function mergeHistory(remote: MatchHistory, local: MatchHistory): MatchHistory {
  const games = new Map(local.games.map((g) => [g.id, g]));
  for (const game of remote.games) {
    const cached = games.get(game.id);
    games.set(game.id, { ...game, correct: game.correct ?? cached?.correct ?? null,
      wrong: game.wrong ?? cached?.wrong ?? null, victoryMs: game.victoryMs ?? cached?.victoryMs ?? null });
  }
  return { games: [...games.values()], tables: [...new Set([...remote.tables, ...local.tables])] };
}
export async function fetchMatchHistory(): Promise<MatchHistory> {
  if (!getSessionUserId()) return localMatchHistory();
  const { data, error } = await supabase.rpc("get_player_match_stats");
  if (error) throw new Error("Match stats unavailable");
  return mergeHistory(data as unknown as MatchHistory, localMatchHistory());
}
export function summarizeMatches(history: MatchHistory, mode: MatchRecord["mode"]) {
  const games = history.games.filter((g) => g.mode === mode);
  const wins = games.filter((g) => g.won).length;
  const measured = games.filter((g) => g.correct !== null && g.wrong !== null);
  const correct = measured.reduce((n, g) => n + (g.correct ?? 0), 0);
  const wrong = measured.reduce((n, g) => n + (g.wrong ?? 0), 0);
  const victories = games.filter((g) => g.won && g.victoryMs !== null).map((g) => g.victoryMs ?? Infinity);
  return { played: games.length, wins, winRate: games.length ? Math.round(wins / games.length * 100) : null,
    accuracy: correct + wrong ? Math.round(correct / (correct + wrong) * 100) : null,
    pairs: measured.length ? correct : null, quickest: victories.length ? Math.min(...victories) : null,
    hosted: history.tables.length };
}
export function formatVictory(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}