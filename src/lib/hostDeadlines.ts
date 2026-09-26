// ============================================================================
// Host deadlines — every load-bearing Classic host timer is an absolute
// deadline. setTimeout is only a wake-up: when it fires, the deadline runs.
// A backgrounded host throttles those wake-ups; on resume the host drains
// every overdue deadline in `at` order (see planResume in classicResponsiveness).
//
// Liveness (away / disconnect skips) is deliberately NOT a deadline here: it is
// derived from heartbeat ages, and on resume those ages are reset rather than
// drained, so a host that was away never skips players who stayed.
// ============================================================================

export type DeadlineKind =
  | "flip_complete"
  | "settle_complete"
  | "claim_window_expire"
  | "claim_abandon"
  | "roll_start"
  | "roll_land"
  | "roll_settle";

export interface Deadline {
  key: string;
  kind: DeadlineKind;
  at: number; // local epoch ms
  seq: number; // insertion order, breaks ties
  run: () => void;
}

type TimerFns = {
  now: () => number;
  set: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
};

const defaultFns: TimerFns = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class DeadlineQueue {
  private items = new Map<string, Deadline & { handle: unknown }>();
  private seq = 0;
  private paused = false;
  constructor(private fns: TimerFns = defaultFns) {}

  now(): number {
    return this.fns.now();
  }

  schedule(key: string, kind: DeadlineKind, at: number, run: () => void): void {
    this.cancel(key);
    const d = { key, kind, at, seq: ++this.seq, run, handle: null as unknown };
    this.items.set(key, d);
    this.arm(d);
  }

  /** Schedule relative to now. */
  after(key: string, kind: DeadlineKind, ms: number, run: () => void): void {
    this.schedule(key, kind, this.fns.now() + ms, run);
  }

  cancel(key: string): void {
    const d = this.items.get(key);
    if (!d) return;
    if (d.handle !== null) this.fns.clear(d.handle);
    this.items.delete(key);
  }

  atOf(key: string): number | null {
    return this.items.get(key)?.at ?? null;
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  /** Wake-ups stop running deadlines while a resume drain is in progress. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    for (const d of this.items.values()) this.arm(d);
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Overdue deadlines, oldest first. Does not remove them. */
  due(now = this.fns.now()): Deadline[] {
    return [...this.items.values()]
      .filter((d) => d.at <= now)
      .sort((a, b) => a.at - b.at || a.seq - b.seq);
  }

  /** Run one deadline now (if still scheduled). */
  runNow(key: string): boolean {
    const d = this.items.get(key);
    if (!d) return false;
    if (d.handle !== null) this.fns.clear(d.handle);
    this.items.delete(key);
    d.run();
    return true;
  }

  clearAll(): void {
    for (const d of this.items.values()) if (d.handle !== null) this.fns.clear(d.handle);
    this.items.clear();
  }

  private arm(d: Deadline & { handle: unknown }): void {
    if (d.handle !== null) this.fns.clear(d.handle);
    const ms = Math.max(0, d.at - this.fns.now());
    d.handle = this.fns.set(() => {
      d.handle = null;
      if (this.paused) return; // the resume drain owns it
      if (this.items.get(d.key) !== d) return;
      this.items.delete(d.key);
      d.run();
    }, ms);
  }
}
