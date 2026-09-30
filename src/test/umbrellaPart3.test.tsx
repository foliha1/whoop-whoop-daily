import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { setUmbrellaPreviewForTests } from "@/lib/launch";
import { dailyShareUrl, formatDailyShare, formatDailyShareCaption, getDailySeed, loadDailyResult } from "@/lib/daily";
import { initDailyState } from "@/lib/dailyEngine";
import { buildForfeitResult, runInProgress } from "@/lib/dailyForfeit";
import { hasCompletedAnyDaily, homeSignupEligible } from "@/lib/homeSignup";
import HomeControl from "@/components/HomeControl";
import DailyLeaveDialog, { DAILY_LEAVE_BODY, DAILY_LEAVE_TITLE } from "@/components/DailyLeaveDialog";
import HomeEmailSignup from "@/components/HomeEmailSignup";
import DailyEmailModal, { dailyEmailModalBody } from "@/components/DailyEmailModal";
import DailyStartDialog from "@/components/DailyStartDialog";
import DailyShapeRule from "@/components/DailyShapeRule";
import { useDailyGame } from "@/hooks/useDailyGame";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

afterEach(() => {
  cleanup();
  setUmbrellaPreviewForTests(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

/** Mirrors daily_result_reject_reason's shape checks (server is authoritative). */
function serverShapeOk(r: ReturnType<typeof buildForfeitResult>): boolean {
  if (r.roundEvents.length !== 3) return false;
  let solves = 0, misses = 0, events = 0;
  for (const round of r.roundEvents) {
    if (round.length < 1 || round.length > 2) return false;
    const s = round.filter((m) => m === "SOLVE").length;
    const m = round.filter((x) => x === "MISS").length;
    if (s > 1 || (s === 1 && round[round.length - 1] !== "SOLVE") || (s === 0 && m !== 2)) return false;
    solves += s; misses += m; events += round.length;
  }
  return solves === r.roundsSolved && misses === r.totalMisses && r.elapsedMs >= events * 250;
}

describe("Part 3 destinations", () => {
  it("points share link, caption and text at /daily only when ON", () => {
    const result = buildForfeitResult({ ...initDailyState("whoop-2026-09-29"), phase: "PLAY" }, "whoop-2026-09-29", 50);
    expect(dailyShareUrl()).toBe("https://whoop-whoop.com");
    expect(formatDailyShareCaption(50)).toMatch(/\nwhoop-whoop\.com$/);
    expect(formatDailyShare(result)).toMatch(/\nhttps:\/\/whoop-whoop\.com$/);
    setUmbrellaPreviewForTests(true);
    expect(dailyShareUrl()).toBe("https://whoop-whoop.com/daily");
    expect(formatDailyShareCaption(50)).toMatch(/\nwhoop-whoop\.com\/daily$/);
    expect(formatDailyShare(result)).toMatch(/\nhttps:\/\/whoop-whoop\.com\/daily$/);
  });

  it("gates every other Daily destination behind the switch", () => {
    expect(src("src/pages/DailyPage.tsx")).toContain("umbrellaOn() ? `https://whoop-whoop.com/daily?i=${code}` : `https://whoop-whoop.com/?i=${code}`");
    expect(src("src/components/ClassicResultScreen.tsx")).toContain('href={umbrellaOn() ? "/daily" : "/"}');
    expect(src("src/components/MultiplayerWindow.tsx")).toContain('href={umbrella ? "/daily" : "/"}');
    expect(src("src/pages/SupportPage.tsx")).toContain('to={umbrella ? "/daily" : "/"}');
    expect(src("src/components/LegalPage.tsx")).toContain('to={umbrella ? "/daily" : "/"}');
    expect(src("src/pages/GroupsPage.tsx")).toContain('to={umbrella ? "/daily" : "/"}');
    expect(src("src/pages/YouPage.tsx")).toContain('to={umbrella ? "/daily" : "/"}');
    expect(src("scripts/umbrellaHead.mjs")).toContain("${ORIGIN}/daily</loc>");
    expect(src("public/sitemap.xml")).not.toContain("/daily");
  });

  it("shows the Classic lobby Your Stats chip only while ON (OFF build renders today's site)", () => {
    const w = src("src/components/MultiplayerWindow.tsx");
    // The chip must not appear before launch: its condition must include the
    // umbrella flag, not only account (a signed-in OFF player sees today's site).
    expect(w).toContain("{umbrella && account ? (");
    const gated = w.slice(w.indexOf("{umbrella && account ? ("), w.indexOf('Your Stats', w.indexOf("{umbrella && account ? (") + 1));
    expect(gated).toContain('navigate("/you")');
  });
});

describe("Part 3 Home control", () => {
  it("is a 44x44 top-left button with a hidden Home label", () => {
    render(<MemoryRouter><HomeControl /></MemoryRouter>);
    const b = screen.getByRole("button", { name: "Home" });
    expect(b.style.width).toBe("44px");
    expect(b.style.height).toBe("44px");
    expect(b.style.position).toBe("fixed");
    expect(src("src/components/HomeControl.tsx")).toContain(`left: "calc(env(safe-area-inset-left) + 12px)"`);
    expect(b.textContent).toBe("Home");
  });

  it("uses the same slot for the Daily's leave X", () => {
    const onLeave = vi.fn();
    render(<MemoryRouter><HomeControl kind="leave" onLeave={onLeave} /></MemoryRouter>);
    const b = screen.getByRole("button", { name: "Leave today's Daily" });
    expect(b.style.width).toBe("44px");
    fireEvent.click(b);
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("only mounts Home controls when ON", () => {
    const daily = src("src/pages/DailyPage.tsx");
    expect(daily).toContain('{umbrella && (ready || finished || phase === "READY") ? <HomeControl /> : null}');
    expect(daily).toContain("umbrella && !ready && !finished && daily.result === null && runInProgress(state)");
    expect(src("src/components/MultiplayerWindow.tsx")).toContain("umbrella && !home && opts.homeControl !== false ? <HomeControl /> : null");
    expect(src("src/components/SiteHeader.tsx")).toContain("umbrella && !onLeave ?");
  });

  it("moves the Classic in-game exit left only when ON", () => {
    const view = src("src/components/MultiplayerGameView.tsx");
    expect(view).toContain("{umbrella ? leaveButton : null}");
    expect(view).toContain("{umbrella ? null : leaveButton}");
    expect(view.indexOf("{umbrella ? leaveButton : null}")).toBeLessThan(view.indexOf("Round: {round}"));
    expect(view.indexOf("{umbrella ? null : leaveButton}")).toBeGreaterThan(view.indexOf('aria-label="Settings"'));
    expect(view).toContain('data-testid="classic-game-leave"');
  });

  it("keeps the ON-only pattern clear of the shared control on whole shapes", () => {
    render(<DailyShapeRule clearStart={64} />);
    expect(document.querySelector('[data-clear-start="true"]')).toBeTruthy();
    expect(src("src/components/DailyFrame.tsx")).toContain("12 + 44 + SPACE[4] - pad");
    expect(src("src/components/LegalPage.tsx")).toContain("topControl={umbrella}");
    expect(src("src/pages/YouPage.tsx")).toContain("topControl={umbrella}");
  });
});

describe("ON Daily direct start", () => {
  it("announces the puzzle, focuses Start, and cannot dismiss from Escape or backdrop", () => {
    const start = vi.fn();
    render(<DailyStartDialog puzzleNumber={123} onStart={start} />);
    const dialog = screen.getByRole("dialog", { name: "Daily #123" });
    expect(screen.getByText("10 seconds to study. The die rolls after.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Start" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(dialog);
    expect(start).not.toHaveBeenCalled();
  });

  it("uses the shared exit motion before starting exactly once", async () => {
    vi.useFakeTimers();
    const start = vi.fn();
    render(<DailyStartDialog puzzleNumber={123} onStart={start} />);
    const button = screen.getByRole("button", { name: "Start" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(start).not.toHaveBeenCalled();
    await act(async () => { vi.runAllTimers(); });
    expect(start).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("keeps pre-start in READY, with a face-down noninteractive nine-card board", () => {
    const daily = src("src/pages/DailyPage.tsx");
    expect(daily).toContain('const startDialogOpen = directStart && phase === "READY"');
    expect(daily).toContain("interactive={cardsTappable}");
    expect(daily).toContain('phase === "PLAY" &&');
    const state = initDailyState("whoop-2026-09-29");
    expect(state.phase).toBe("READY");
    expect(state.grid).toHaveLength(9);
    expect(state.faceUp).toBe(false);
    expect(runInProgress(state)).toBe(false);
  });
});

describe("Part 3 Daily leave", () => {
  it("asks with the exact copy, Keep Playing focused first", () => {
    const keep = vi.fn();
    const leave = vi.fn();
    render(<DailyLeaveDialog onKeepPlaying={keep} onLeave={leave} />);
    expect(screen.getByRole("alertdialog", { name: DAILY_LEAVE_TITLE })).toBeTruthy();
    expect(DAILY_LEAVE_TITLE).toBe("Leave today's Daily?");
    expect(screen.getByText(DAILY_LEAVE_BODY)).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Keep Playing");
    expect((screen.getByText("Keep Playing").closest("button") as HTMLButtonElement).style.background).toBe("rgb(0, 114, 178)");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(keep).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Leave"));
    expect(leave).toHaveBeenCalled();
  });

  it("counts every unfinished round as unsolved in a server-valid shape", () => {
    const base = initDailyState("whoop-2026-09-29");
    const cases = [
      { ...base, phase: "DEAL" as const },
      { ...base, phase: "PLAY" as const, roundEvents: [["MISS"], [], []] as never, totalMisses: 1 },
      { ...base, phase: "PLAY" as const, roundIndex: 2, roundsSolved: 1, roundEvents: [["MISS", "SOLVE"], [], []] as never, accumulatedMs: 4000 },
      { ...base, phase: "PLAY" as const, roundIndex: 3, roundsSolved: 2, roundEvents: [["SOLVE"], ["SOLVE"], ["MISS"]] as never },
    ];
    const out = cases.map((s) => buildForfeitResult(s, "whoop-2026-09-29", 50));
    expect(out.map((r) => r.roundsSolved)).toEqual([0, 0, 1, 2]);
    expect(out[0].roundEvents).toEqual([["MISS", "MISS"], ["MISS", "MISS"], ["MISS", "MISS"]]);
    expect(out[2].roundEvents).toEqual([["MISS", "SOLVE"], ["MISS", "MISS"], ["MISS", "MISS"]]);
    expect(out[0].failed).toBe(true);
    expect(out.every(serverShapeOk)).toBe(true);
    expect(runInProgress({ ...base, phase: "READY" })).toBe(false);
    expect(runInProgress({ ...base, phase: "STUDY" })).toBe(true);
  });

  it("saves the first attempt locally on leave, which keeps the streak day and the played tile", async () => {
    setUmbrellaPreviewForTests(true);
    const { result } = renderHook(() => useDailyGame());
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).not.toBe("READY"), { timeout: 4000 });
    let saved = false;
    act(() => { saved = result.current.forfeit(); });
    expect(saved).toBe(true);
    const stored = loadDailyResult(getDailySeed());
    expect(stored?.roundsSolved).toBe(0);
    expect(stored?.roundEvents).toEqual([["MISS", "MISS"], ["MISS", "MISS"], ["MISS", "MISS"]]);
    expect(result.current.alreadyPlayed).toBe(true);
    // A second leave never writes again.
    act(() => { saved = result.current.forfeit(); });
    expect(saved).toBe(false);
  });

  it("closing the tab mid-run (pagehide) saves the same way when ON, nothing when OFF", async () => {
    const off = renderHook(() => useDailyGame());
    act(() => off.result.current.start());
    await waitFor(() => expect(off.result.current.phase).not.toBe("READY"), { timeout: 4000 });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(loadDailyResult(getDailySeed())).toBeNull();
    off.unmount();

    setUmbrellaPreviewForTests(true);
    const on = renderHook(() => useDailyGame());
    act(() => on.result.current.start());
    await waitFor(() => expect(on.result.current.phase).not.toBe("READY"), { timeout: 4000 });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(loadDailyResult(getDailySeed())?.roundsSolved).toBe(0);
  });

  it("does not save anything before Tap to Start", () => {
    setUmbrellaPreviewForTests(true);
    const { result } = renderHook(() => useDailyGame());
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(result.current.forfeit()).toBe(false);
    expect(loadDailyResult(getDailySeed())).toBeNull();
  });
});

describe("Part 3 Home email signup", () => {
  it("pins restore, Daily-result subscribe, and Home subscribe copy", () => {
    expect(dailyEmailModalBody("restore", "daily_result")).toBe(
      "Enter the address you used before and your streak and history come back.",
    );
    expect(dailyEmailModalBody("subscribe", "daily_result")).toBe(
      "A new game every morning. Nothing else.",
    );
    expect(dailyEmailModalBody("subscribe", "home")).toBe(
      "A new game every morning. Nothing else.",
    );
  });

  it("is for players who finished a Daily and are not subscribed", () => {
    expect(hasCompletedAnyDaily()).toBe(false);
    expect(homeSignupEligible(hasCompletedAnyDaily(), false)).toBe(false); // new visitor
    localStorage.setItem("ww_daily_whoop-2026-09-28", JSON.stringify({ elapsedMs: 9000 }));
    expect(hasCompletedAnyDaily()).toBe(true);
    expect(homeSignupEligible(true, true)).toBe(false); // subscriber
    expect(homeSignupEligible(true, false)).toBe(true); // played, not subscribed
    localStorage.clear();
    localStorage.setItem("ww_daily_subscribed", "1");
    expect(hasCompletedAnyDaily()).toBe(false);
  });

  it("opens the shared accessible modal with source home and returns focus", async () => {
    render(<HomeEmailSignup />);
    const trigger = screen.getByRole("button", { name: "Get a reminder for tomorrow's Daily" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Get tomorrow's grid" })).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toBe(document.activeElement);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("writes through the shared signup path with source home, ON Home only", () => {
    expect(src("src/components/HomeEmailSignup.tsx")).toContain('source="home"');
    expect(src("src/components/DailyEmailCapture.tsx")).toContain('source === "home"');
    expect(src("src/components/MultiplayerWindow.tsx")).toContain("const showHomeSignup = umbrella && home &&");
    expect(src("supabase/functions/ac-subscribe/index.ts")).toContain('body.source === "home"');
  });
});

describe("Part 3 analytics allowlist", () => {
  it("adds exactly the four home events and fires them from Home", () => {
    const dir = resolve(process.cwd(), "drizzle/migrations");
    const file = readdirSync(dir).find((f) => f.includes("home_analytics_and_signup_source"))!;
    const sql = readFileSync(resolve(dir, file), "utf8");
    const list = sql.match(/v_allowed constant text\[\] := ARRAY\[([\s\S]*?)\]/)![1].match(/'([a-z_]+)'/g)!;
    expect(list.map((x) => x.slice(1, -1))).toEqual([
      "classic_demo_opened", "classic_demo_finished", "classic_demo_skipped",
      "room_created", "room_joined", "invite_link_clicked", "game_started", "game_completed",
      "home_viewed", "home_daily_tapped", "home_solo_tapped", "home_peeps_tapped",
    ]);
    expect(sql).toContain("c_per_ip_per_day constant integer := 2000");
    expect(sql).toContain("c_per_user_per_day constant integer := 500");
    expect(sql).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
    const w = src("src/components/MultiplayerWindow.tsx");
    for (const e of ["home_viewed", "home_daily_tapped", "home_solo_tapped", "home_peeps_tapped"]) expect(w).toContain(`"${e}"`);
  });
});
