// Test kit: a fake clock and a table whose messages are recorded per player.
import { TableGame, type Clock, type ServerMessage, type TableStateMessage } from "../src/tableGame";

export class FakeClock implements Clock {
  t = 1_800_000_000_000;
  private timers = new Map<number, { at: number; fn: () => void; n: number }>();
  private next = 1;
  now = () => this.t;
  set = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn, n: id });
    return id;
  };
  clear = (h: unknown) => {
    this.timers.delete(h as number);
  };
  get pending() {
    return this.timers.size;
  }
  /** Move time forward, firing every timer due on the way, in order. */
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let best: { id: number; at: number; n: number; fn: () => void } | null = null;
      for (const [id, x] of this.timers) {
        if (x.at <= end && (!best || x.at < best.at || (x.at === best.at && x.n < best.n))) best = { id, ...x };
      }
      if (!best) break;
      this.timers.delete(best.id);
      this.t = Math.max(this.t, best.at);
      best.fn();
    }
    this.t = end;
  }
}

export type Inbox = Map<string, ServerMessage[]>;

export function makeTable(ids?: () => string) {
  const clock = new FakeClock();
  const inbox: Inbox = new Map();
  const all: ServerMessage[] = [];
  let n = 0;
  const game = new TableGame(
    clock,
    (to, msg) => {
      all.push(msg);
      const targets = to === null ? [...inbox.keys()] : [to];
      for (const pid of targets) {
        if (!inbox.has(pid)) inbox.set(pid, []);
        inbox.get(pid)!.push(msg);
      }
    },
    ids ?? (() => `game-${++n}`),
  );
  const player = (pid: string, name = pid) => {
    inbox.set(pid, inbox.get(pid) ?? []);
    game.connect(pid);
    game.join(pid, name);
  };
  const lastState = (pid?: string): TableStateMessage | null => {
    const list = pid ? inbox.get(pid) ?? [] : all;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.t === "state") return m.state;
    }
    return null;
  };
  const acks = (pid: string) => (inbox.get(pid) ?? []).filter((m) => m.t === "ack");
  return { clock, game, inbox, all, player, lastState, acks };
}

/** Start a table of `count` players named p0..pN (pids padded to pass checks). */
export function startedTable(count = 2) {
  const t = makeTable();
  const pids = Array.from({ length: count }, (_, i) => `player-${i}-xxxx`);
  pids.forEach((p, i) => t.player(p, `P${i}`));
  t.game.start(pids[0]);
  return { ...t, pids };
}

/** Roll for whoever holds the die, and wait for it to land. */
export function rollAndSettle(t: ReturnType<typeof startedTable>) {
  const roller = t.game.state.roller;
  t.game.intent(t.pids[roller], { type: "REQUEST_ROLL" }, "roll");
  t.clock.advance(2200);
}

/** Two grid slots that match the current rule, if any. */
export function matchingPair(t: ReturnType<typeof startedTable>, seat: number): [number, number] | null {
  const s = t.game.state;
  const attr = s.rule[0];
  const key = (c: NonNullable<(typeof s.grid)[number]>) =>
    attr === "SHAPE" ? c.shape : attr === "NUMBER" ? String(c.number) : c.color;
  for (let i = 0; i < s.grid.length; i++) {
    for (let j = i + 1; j < s.grid.length; j++) {
      const a = s.grid[i];
      const b = s.grid[j];
      if (!a || !b || s.wrongBy[seat]?.has(i) || s.wrongBy[seat]?.has(j)) continue;
      if (key(a) === key(b)) return [i, j];
    }
  }
  return null;
}

export function wrongPair(t: ReturnType<typeof startedTable>, seat: number): [number, number] | null {
  const s = t.game.state;
  const attr = s.rule[0];
  const key = (c: NonNullable<(typeof s.grid)[number]>) =>
    attr === "SHAPE" ? c.shape : attr === "NUMBER" ? String(c.number) : c.color;
  for (let i = 0; i < s.grid.length; i++) {
    for (let j = i + 1; j < s.grid.length; j++) {
      const a = s.grid[i];
      const b = s.grid[j];
      if (!a || !b || s.wrongBy[seat]?.has(i) || s.wrongBy[seat]?.has(j)) continue;
      if (key(a) !== key(b)) return [i, j];
    }
  }
  return null;
}
