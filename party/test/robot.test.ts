// The robot: plays thousands of random Together games against the table
// server on a fake clock, with players tapping at random, claiming right and
// wrong, leaving, hiding their tab and coming back. After every step it checks
// that nothing broke and that the table never gets stuck.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRng } from "@/lib/rng";
import type { State } from "@/lib/gameEngine";
import { makeTable, matchingPair, wrongPair } from "./harness";

const GAMES = Number(process.env.ROBOT_GAMES ?? 1000);
const DECK = 48;
/** No real game lasts this long; hitting it means the table got stuck. */
const GAME_CAP_MS = 3 * 60 * 60 * 1000;
/** Longest the board may sit with no change while players keep tapping. */
const STALL_MS = 90_000;

const realRandom = Math.random;
beforeAll(() => {
  // Same seed, same games: a failure can be replayed exactly.
  Math.random = createRng("whoop-robot-v1");
});
afterAll(() => {
  Math.random = realRandom;
});

function cardsAccountedFor(s: State): number {
  const onGrid = s.grid.filter((c) => c !== null).length;
  const inPiles = s.piles.reduce((n, p) => n + p.length, 0);
  // During a match hold the pair is in the pile AND still on the grid. That
  // holds too if the table empties mid-hold and the game ends right there.
  const doubled = s.settleKind === "MATCH" ? s.matchedCards.size : 0;
  return onGrid + s.deck.length + inPiles - doubled;
}

function checkInvariants(t: ReturnType<typeof makeTable>, label: string) {
  const s = t.game.state;
  const where = `${label} phase=${s.phase} round=${s.roundNum}`;
  expect(cardsAccountedFor(s), `cards lost or made up (${where})`).toBe(DECK);
  s.scores.forEach((v, i) => {
    expect(v, `negative score (${where})`).toBeGreaterThanOrEqual(0);
    expect(s.piles[i].length, `pile and score differ (${where})`).toBe(v);
  });
  // Hidden faces: a card face may only travel when everyone may see it.
  const pub = t.game.publicState();
  const exposed = new Set<number>();
  if (s.peekingCard !== null) exposed.add(s.peekingCard);
  s.matchedCards.forEach((i) => exposed.add(i));
  if (s.selectedCards.length >= 2) s.selectedCards.forEach((i) => exposed.add(i));
  s.wrongBy.forEach((set) => set.forEach((i) => exposed.add(i)));
  pub.grid.forEach((slot, i) => {
    if (slot.card) expect(exposed.has(i), `face leaked at slot ${i} (${where})`).toBe(true);
    expect(slot.occupied, `slot ${i} occupancy (${where})`).toBe(s.grid[i] !== null);
  });
  expect(pub.deckCount).toBe(s.deck.length);
  expect(JSON.stringify(pub)).not.toContain('"deck"');
}

function playOne(game: number, rnd: () => number) {
  const t = makeTable();
  const count = 2 + Math.floor(rnd() * 5); // 2 to 6 players
  const pids = Array.from({ length: count }, (_, i) => `robot-${game}-${i}`);
  pids.forEach((p) => t.player(p));
  t.game.start(pids[0]);
  const away = new Map<number, number>(); // seat -> time it comes back
  const hiddenSeats = new Set<number>();
  // Most games run clean; some get the full chaos of leaving and hiding.
  const chaos = rnd() < 0.3;
  let lastChange = t.clock.now();
  let lastState = t.game.state;
  let steps = 0;
  let refillGap = false;

  while (t.game.state.phase !== "GAME_OVER") {
    steps++;
    const now = t.clock.now();
    if (now >= 1_800_000_000_000 + GAME_CAP_MS) {
      const st = t.game.state;
      // Before v7.3 the refill gap could make a game drag on for hours. Counted
      // so the summary can show it; the summary requires zero.
      if (refillGap) return { steps, refillGap, dragged: true, endedEmpty: false, players: count, minutes: GAME_CAP_MS / 60000 };
      throw new Error(
        `game ${game}: no winner after 3 hours (${count} players, phase ${st.phase}, chaos ${chaos}, ` +
          `round ${st.roundNum}, scores ${st.scores.join("/")}, deck ${st.deck.length}, ` +
          `grid ${st.grid.filter((c) => c).length}, wrongCalls ${st.wrongCalls})`,
      );
    }

    // Players come back.
    for (const [seat, back] of away) {
      if (now >= back) {
        away.delete(seat);
        t.game.connect(pids[seat]);
      }
    }

    const s = t.game.state;
    const seat = Math.floor(rnd() * count);
    const pid = pids[seat];
    const r = rnd();

    if (chaos && r < 0.004 && !away.has(seat)) {
      away.set(seat, now + 1000 + Math.floor(rnd() * 90_000));
      t.game.disconnect(pid);
    } else if (chaos && r < 0.008) {
      const hide = !hiddenSeats.has(seat);
      if (hide) hiddenSeats.add(seat);
      else hiddenSeats.delete(seat);
      t.game.visibility(pid, hide);
    } else if (away.has(seat)) {
      // An absent player does nothing.
    } else if (s.phase === "AWAITING_ROLL") {
      t.game.intent(pids[rnd() < 0.8 ? s.roller : seat], { type: "REQUEST_ROLL" }, "r");
    } else if (s.phase === "CLAIM_SELECTING" && s.claimBy !== null) {
      const by = s.claimBy;
      if (away.has(by)) {
        // The claimant left; the abandon timer will clear it.
      } else if (rnd() < 0.05) {
        t.game.intent(pids[by], { type: "CANCEL_CLAIM" });
      } else if (s.selectedCards.length === 2) {
        t.game.intent(pids[by], { type: "PLAYER_RESOLVE_MATCH" });
      } else {
        // Usually pick a planned pair, sometimes a random (even illegal) slot.
        // Players are right about 3 times in 4, like real tables.
        const plan = rnd() < 0.75 ? matchingPair(t as never, by) ?? wrongPair(t as never, by) : wrongPair(t as never, by);
        const idx =
          plan && rnd() < 0.9
            ? plan[s.selectedCards.length] ?? plan[0]
            : Math.floor(rnd() * 11) - 1;
        t.game.intent(pids[by], { type: "PLAYER_SELECT_CARD", idx });
      }
    } else if ((s.phase === "FLIPPING" || s.phase === "CLAIM_WINDOW") && r < 0.12) {
      // Someone presses WHOOP! WHOOP!, mostly when they think a pair is there.
      // Sometimes two press at once.
      if (matchingPair(t as never, seat) || rnd() < 0.2) {
        t.game.intent(pid, { type: "CLAIM" });
        if (rnd() < 0.2) t.game.intent(pids[(seat + 1) % count], { type: "CLAIM" });
      }
    } else if (s.phase === "FLIPPING") {
      const flipper = rnd() < 0.85 ? s.flipper : seat;
      t.game.intent(pids[flipper], { type: "FLIP_START", idx: Math.floor(rnd() * 10) });
    } else {
      // Taps at the wrong moment must be refused harmlessly.
      const junk = [
        { type: "FLIP_START", idx: 3 },
        { type: "PLAYER_RESOLVE_MATCH" },
        { type: "REQUEST_ROLL" },
        { type: "NEW_GAME" },
      ] as const;
      t.game.intent(pid, junk[Math.floor(rnd() * junk.length)]);
    }

    checkInvariants(t, `game ${game} step ${steps}`);
    // v7.3 guard: a round must never start with empty spaces while the pile
    // has cards (returned by wrong claims after it ran dry).
    const ns = t.game.state;
    if (ns.phase === "AWAITING_ROLL" && ns.deck.length > 0 && ns.grid.some((c) => c === null)) refillGap = true;

    if (t.game.state !== lastState) {
      lastState = t.game.state;
      lastChange = t.clock.now();
    } else if (t.clock.now() - lastChange > STALL_MS && away.size === 0 && hiddenSeats.size === 0) {
      throw new Error(`game ${game}: stuck in ${t.game.state.phase} for 90 s with everyone present`);
    }

    t.clock.advance(80 + Math.floor(rnd() * 600));
  }
  checkInvariants(t, `game ${game} end`);
  const endedEmpty = t.game.state.message.startsWith("Game ended");
  return { steps, refillGap, dragged: false, endedEmpty, players: count, minutes: (t.clock.now() - 1_800_000_000_000) / 60000 };
}

describe("robot", () => {
  const BATCH = 40;
  const rnd = createRng("whoop-robot-actions-v1");
  const tally = { finished: 0, emptied: 0, longest: 0, gaps: 0, dragged: 0 };
  // Batches keep the test runner responsive between long stretches of play.
  for (let from = 0; from < GAMES; from += BATCH) {
    const to = Math.min(GAMES, from + BATCH);
    it(`games ${from + 1} to ${to}: nothing breaks, nothing gets stuck`, async () => {
      for (let g = from; g < to; g++) {
        // Let the test runner breathe between games.
        await new Promise((r) => setImmediate(r));
        const r = playOne(g, rnd);
        if (r.refillGap) tally.gaps++;
        if (r.dragged) {
          tally.dragged++;
          continue;
        }
        if (r.endedEmpty) tally.emptied++;
        else tally.finished++;
        tally.longest = Math.max(tally.longest, r.minutes);
      }
    }, 600_000);
  }
  it("summary", () => {
    const { finished, emptied, longest, gaps, dragged } = tally;
    console.log(
      `robot: ${GAMES} games, ${finished} won by a player, ${emptied} ended as an empty table, ` +
        `longest ${longest.toFixed(1)} min, ${gaps} had empty slots while the pile had cards, ` +
        `${dragged} dragged past 3 hours because of it`,
    );
    expect(finished + emptied + dragged).toBe(GAMES);
    expect(finished).toBeGreaterThan(GAMES * 0.8);
    // v7.3 fills empty spaces before every roll, so neither may happen.
    expect(gaps).toBe(0);
    expect(dragged).toBe(0);
  });
});
