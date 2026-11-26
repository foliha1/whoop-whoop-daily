// The phone's link to the table server, against a fake socket.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTableServer, toTableIntent } from "@/hooks/useTableServer";
import { getServerOffset, setServerOffset } from "@/hooks/useServerClock";
import { ALL_CARDS } from "@/cardData";
import { hydrateCards, offsetFromPong, tableSocketUrl } from "@/lib/tableServer";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  private listeners = new Map<string, ((e: { data?: string }) => void)[]>();
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  addEventListener(type: string, fn: (e: { data?: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
  emit(type: string, data?: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(data === undefined ? {} : { data: JSON.stringify(data) });
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  receive(msg: unknown) {
    this.emit("message", msg);
  }
}

const ROOM = "22222222-2222-4222-8222-222222222222";
const card = ALL_CARDS[5];

function baseState(over: Record<string, unknown> = {}) {
  return {
    phase: "FLIPPING",
    settleKind: null,
    seatCount: 2,
    roller: 0,
    flipper: 0,
    scores: [0, 0],
    rule: ["SHAPE"],
    dieValues: ["SHAPE"],
    claimBy: null,
    roundNum: 1,
    allFaceUp: false,
    selectedCards: [],
    matchedCards: [],
    peekingCard: 0,
    message: "",
    messageType: "info",
    drawEmpty: false,
    deckCount: 39,
    grid: [{ occupied: true, card: { ...card, svgPath: "" } }, { occupied: true, card: null }],
    rolling: false,
    wrongBy: [[], []],
    missesThisRound: [0, 0],
    seatMap: [
      { seat: 0, pid: "host-pub", display_name: "Ana" },
      { seat: 1, pid: "me-pub", display_name: "Ben" },
    ],
    claimWindow: 3,
    gameId: "g1",
    disconnectedSeats: [],
    awaySeats: [],
    serverNow: 1_800_000_000_000,
    paused: false,
    waitingFor: [],
    pauseEndsAt: null,
    ...over,
  };
}

function setup() {
  const factory = (url: string) => new FakeSocket(url) as unknown as WebSocket;
  const hook = renderHook(() =>
    useTableServer({
      enabled: true,
      roomCode: "whoop1",
      roomId: ROOM,
      pid: "me-pub",
      visitorId: "browser-1",
      playerKey: "k".repeat(32),
      socketFactory: factory,
    }),
  );
  const ws = FakeSocket.all.at(-1)!;
  act(() => {
    ws.open();
    ws.receive({ t: "hello", v: 1, serverNow: Date.now() });
  });
  return { hook, ws };
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setServerOffset(0);
});

describe("table server link", () => {
  it("connects to the table by code and checks in with the secret seat key", () => {
    const { ws } = setup();
    expect(ws.url).toBe(tableSocketUrl("WHOOP1", "me-pub"));
    expect(ws.sent[0]).toEqual({ t: "join", roomId: ROOM, visitorId: "browser-1", playerKey: "k".repeat(32) });
    expect(ws.sent[1]).toMatchObject({ t: "visibility" });
  });

  it("shows server state with card art restored and finds my seat", () => {
    const { hook, ws } = setup();
    act(() => ws.receive({ t: "state", seq: 1, state: baseState() }));
    expect(hook.result.current.state?.grid[0].card?.svgPath).toBe(card.svgPath);
    expect(hook.result.current.mySeat).toBe(1);
    expect(hook.result.current.started).toBe(true);
    // An older state never replaces a newer one.
    act(() => ws.receive({ t: "state", seq: 0, state: baseState({ roundNum: 99 }) }));
    expect(hook.result.current.state?.roundNum).toBe(1);
  });

  it("sends taps as intents, without seats", () => {
    const { hook, ws } = setup();
    act(() => {
      hook.result.current.sendIntent({ type: "FLIP_START", by: 1, idx: 4, token: 9 });
      hook.result.current.sendIntent({ type: "PLAYER_ENTER_CLAIM", by: 1 });
      hook.result.current.sendIntent({ type: "NEW_GAME" });
    });
    const intents = ws.sent.filter((m) => m.t === "intent").map((m) => m.action);
    expect(intents).toEqual([{ type: "FLIP_START", idx: 4 }, { type: "NEW_GAME" }]);
  });

  it("WHOOP! WHOOP! answers won, lost or unknown like the old referee", async () => {
    const { hook, ws } = setup();
    act(() => ws.receive({ t: "state", seq: 1, state: baseState({ claimBy: 0 }) }));

    let won: unknown;
    act(() => void hook.result.current.claim(3).then((r) => (won = r)));
    const id1 = ws.sent.at(-1)!.id as string;
    await act(async () => ws.receive({ t: "ack", id: id1, accepted: true, recvAt: 1 }));
    expect(won).toMatchObject({ outcome: "won", won: true });

    let lost: unknown;
    act(() => void hook.result.current.claim(3).then((r) => (lost = r)));
    const id2 = ws.sent.at(-1)!.id as string;
    await act(async () => ws.receive({ t: "ack", id: id2, accepted: false, reason: "too_slow", recvAt: 1 }));
    expect(lost).toMatchObject({ outcome: "lost", winner_seat: 0 });

    let unknown: unknown;
    act(() => void hook.result.current.claim(3).then((r) => (unknown = r)));
    await act(async () => vi.advanceTimersByTime(4000));
    expect(unknown).toMatchObject({ outcome: "unknown" });
  });

  it("the host starts with the frozen lobby", () => {
    const { hook, ws } = setup();
    act(() => {
      hook.result.current.start([
        { seat: 0, pid: "host-pub", display_name: "Ana" },
        { seat: 1, pid: "me-pub", display_name: "Ben" },
      ]);
    });
    expect(ws.sent.at(-1)).toEqual({
      t: "start",
      seats: [
        { pid: "host-pub", name: "Ana" },
        { pid: "me-pub", name: "Ben" },
      ],
    });
  });

  it("sets the game clock from the cleanest ping", () => {
    const { ws } = setup();
    const now = Date.now();
    act(() => ws.receive({ t: "pong", id: 1, sentAt: now - 40, serverNow: now + 980 }));
    expect(getServerOffset()).toBe(1000);
  });

  it("reconnects after the link drops, and checks in again", () => {
    const { hook } = setup();
    act(() => FakeSocket.all[0].close());
    expect(hook.result.current.status).toBe("error");
    act(() => vi.advanceTimersByTime(600));
    const again = FakeSocket.all.at(-1)!;
    expect(again).not.toBe(FakeSocket.all[0]);
    act(() => {
      again.open();
      again.receive({ t: "hello", v: 1, serverNow: Date.now() });
    });
    expect(again.sent[0]).toMatchObject({ t: "join", roomId: ROOM });
    expect(hook.result.current.status).toBe("connected");
  });
});

describe("helpers", () => {
  it("maps view taps to server intents", () => {
    expect(toTableIntent({ type: "REQUEST_ROLL" })).toEqual({ type: "REQUEST_ROLL" });
    expect(toTableIntent({ type: "PLAYER_SELECT_CARD", by: 2, idx: 1 })).toEqual({ type: "PLAYER_SELECT_CARD", idx: 1 });
    expect(toTableIntent({ type: "DEBUG_DRAIN_DECK" })).toBeNull();
  });

  it("restores art only for real card ids", () => {
    const st = hydrateCards({ grid: [{ occupied: true, card: { ...card, svgPath: "" } }, { occupied: true, card: { ...card, id: "nope", svgPath: "" } }] });
    expect(st.grid[0].card?.svgPath).toBe(card.svgPath);
    expect(st.grid[1].card?.svgPath).toBe("");
  });

  it("computes the clock offset from a ping", () => {
    expect(offsetFromPong(1000, 1100, 5050)).toEqual({ offset: 4000, rtt: 100 });
  });
});
