import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/account", () => ({ getSessionUserId: () => null }));
import { emptyHistory, rememberMatch, rememberHostedTable, localMatchHistory, mergeHistory, summarizeMatches, formatVictory, type MatchRecord } from "@/lib/playerStats";
const game = (overrides: Partial<MatchRecord> = {}): MatchRecord => ({ id: "g1", mode: "solo", won: true, correct: 6, wrong: 2, victoryMs: 78000, ...overrides });
beforeEach(() => localStorage.clear());
describe("selected match statistics", () => {
  it("separates Daily-free Solo and Together match totals", () => {
    const history = { games: [game(), game({ id: "g2", mode: "together", won: false })], tables: [] };
    expect(summarizeMatches(history, "solo").played).toBe(1);
    expect(summarizeMatches(history, "together").played).toBe(1);
  });
  it("counts wins and calculates wins / completed matches", () => {
    expect(summarizeMatches({ games: [game(), game({ id: "g2", won: false })], tables: [] }, "solo")).toMatchObject({ wins: 1, winRate: 50 });
  });
  it("calculates claim accuracy from player claims and total pairs from correct claims, not final score", () => {
    expect(summarizeMatches({ games: [game()], tables: [] }, "solo")).toMatchObject({ accuracy: 75, pairs: 6 });
  });
  it("uses only winning match timings for quickest victory", () => {
    expect(summarizeMatches({ games: [game(), game({ id: "loss", won: false, victoryMs: 10000 })], tables: [] }, "solo").quickest).toBe(78000);
    expect(formatVictory(78000)).toBe("1m 18s");
  });
  it("does not invent precision measurements for older games", () => {
    expect(summarizeMatches({ games: [game({ correct: null, wrong: null, victoryMs: null })], tables: [] }, "solo")).toMatchObject({ accuracy: null, pairs: null, quickest: null });
  });
  it("does not divide by zero before the first match", () => {
    expect(summarizeMatches(emptyHistory(), "solo")).toMatchObject({ played: 0, wins: 0, winRate: null, accuracy: null });
  });
  it("deduplicates completed games on repeated GAME_OVER observations and server reads", () => {
    rememberMatch(game()); rememberMatch(game());
    expect(mergeHistory({ games: [game()], tables: [] }, localMatchHistory()).games).toHaveLength(1);
  });
  it("counts created tables once, never once per rematch", () => {
    rememberHostedTable("ABC123"); rememberHostedTable("ABC123"); rememberHostedTable("DEF456");
    expect(summarizeMatches(localMatchHistory(), "together").hosted).toBe(2);
  });
});