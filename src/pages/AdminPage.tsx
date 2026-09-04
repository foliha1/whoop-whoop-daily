// ============================================================================
// /admin — internal dashboard for the daily.
//
// Auth is magic-link only and exists for admins. Players never see this and the
// daily flow is untouched. Every number on this page comes from a
// security-definer RPC that checks the email allowlist server-side, so hiding
// the UI is never the protection: an unauthenticated or non-allowlisted caller
// gets nothing back from the database itself.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import AdminBackupBanner from "@/components/AdminBackupBanner";
import {

  attributionSection,
  combinedCsv,
  difficultySection,
  downloadFile,
  exportFilename,
  funnelSection,
  headlineSection,
  howtoSection,
  listSection,
  pitchSnapshot,
  sectionCsv,
  subscriberCsv,
  trendSection,
  type ExportInput,
  type ExportSection,
  type SubscriberExportRow,
} from "@/lib/adminExport";
import {
  BORDER,
  COLORS,
  FONT_FAMILY,
  FONT_FAMILY_UI,
  FONT_SIZE,
  FONT_WEIGHT_UI,
  RADIUS,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

// ---------------------------------------------------------------------------
// types mirroring the RPC row shapes
// ---------------------------------------------------------------------------

interface FunnelRow {
  ready_viewed: number;
  run_started: number;
  run_finished: number;
  run_abandoned: number;
  shared: number;
  subscribed: number;
}
interface DifficultyRow {
  round: number;
  solved: number;
  failed: number;
  solve_rate: number;
  avg_misses: number;
}
interface HowtoRow {
  opened: number;
  finished: number;
  skipped: number;
  skip_slide: number | null;
  skip_count: number | null;
}
interface AttributionRow {
  kind: string;
  source: string;
  visitors: number;
}
interface TrendRow {
  day: string;
  runs_finished: number;
  runs_started: number;
  results_saved: number;
}
interface SubscriberRow {
  source: string;
  total: number;
  synced: number;
}
/** Temporary diagnostic: why a finished run was refused by the server. */
interface RejectionRow {
  reason: string;
  rejections: number;
  visitors: number;
}

/**
 * Next-day return: of the finishers on the last fully elapsed puzzle day, how
 * many finished the day after. Distinct from `returning_pct`, which is the
 * all-time "played on more than one day" rate.
 */
interface NextDayRow {
  base_puzzle: number;
  next_puzzle: number;
  visitor_base: number;
  visitor_returned: number;
  visitor_pct: number | null;
  email_base: number;
  email_returned: number;
  email_pct: number | null;
}

interface HeadlineRow {
  total_players: number;
  dau_today: number;
  dau_avg: number;
  returning_pct: number | null;
  returning_eligible: number;
  d7_pct: number | null;
  d7_eligible: number;
  subscribers: number;
  share_rate: number | null;
  shares: number;
  runs_finished: number;
}

interface DashboardData {
  funnel: FunnelRow | null;
  difficulty: DifficultyRow[];
  howto: HowtoRow[];
  attribution: AttributionRow[];
  trend: TrendRow[];
  subscribers: SubscriberRow[];
  rejections: RejectionRow[];
  headline: HeadlineRow | null;
  nextDay: NextDayRow | null;

}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 13); // last 14 days inclusive
  return { from: isoDay(from), to: isoDay(to) };
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

// ---------------------------------------------------------------------------
// shared style atoms — dense, legible, no new colours
// ---------------------------------------------------------------------------

const mono: CSSProperties = {
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  fontVariantNumeric: "tabular-nums",
};

const cardStyle: CSSProperties = {
  boxSizing: "border-box",
  background: COLORS.surface,
  border: BORDER.standard,
  borderRadius: RADIUS.md,
  padding: SPACE[10],
  display: "flex",
  flexDirection: "column",
  gap: SPACE[6],
};

const sectionTitle: CSSProperties = {
  ...textStyle("label"),
  color: COLORS.ink,
  margin: 0,
};

const labelStyle: CSSProperties = {
  ...mono,
  fontSize: FONT_SIZE["2xs"],
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: COLORS.inkMuted,
};

const cellStyle: CSSProperties = {
  ...mono,
  fontSize: FONT_SIZE.xs,
  color: COLORS.ink,
  padding: `${SPACE[3]}px 0`,
  borderTop: `1px solid ${COLORS.panelMuted}`,
  textAlign: "right",
  whiteSpace: "nowrap",
};

/** First column can hold a long referrer host: wrap it rather than overflow. */
const rowLabelWrapStyle: CSSProperties = {
  whiteSpace: "normal",
  overflowWrap: "anywhere",
};

const rowLabelStyle: CSSProperties = {
  ...cellStyle,
  textAlign: "left",
  color: COLORS.inkMuted,
};

const inputStyle: CSSProperties = {
  ...mono,
  fontSize: FONT_SIZE.xs,
  boxSizing: "border-box",
  height: 36,
  padding: `0 ${SPACE[5]}px`,
  background: COLORS.surface,
  color: COLORS.ink,
  border: BORDER.standard,
  borderRadius: RADIUS.sm,
  minWidth: 0,
};

// ---------------------------------------------------------------------------
// signed-out gate — an email field and a button, nothing else
// ---------------------------------------------------------------------------

const SignInGate: React.FC = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    const value = email.trim();
    if (!value) {
      setError("Add your email first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("That doesn't look like an email.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setBusy(false);
    if (err) {
      setError("Could not send the link. Try again.");
      return;
    }
    setSent(true);
  }, [email]);

  return (
    <main
      style={{
        minHeight: "var(--ww-vh, 100vh)",
        background: COLORS.panel,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: SPACE[10],
      }}
    >
      <div style={{ ...cardStyle, width: "100%", maxWidth: 360, gap: SPACE[8] }}>
        <h1 style={{ ...textStyle("subhead"), color: COLORS.ink, margin: 0 }}>Sign in</h1>
        {sent ? (
          <p style={{ ...labelStyle, textTransform: "none", letterSpacing: 0, fontSize: FONT_SIZE.xs }}>
            Check your email for the link.
          </p>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder="you@example.com"
              aria-label="Email"
              autoComplete="email"
              style={{ ...inputStyle, width: "100%" }}
            />
            {error ? (
              <span style={{ ...labelStyle, textTransform: "none", letterSpacing: 0, color: COLORS.red }}>
                {error}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              style={buttonStyle("primary", "sm", { fullWidth: true, disabled: busy })}
            >
              Send Link
            </button>
          </>
        )}
      </div>
    </main>
  );
};

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

/** Small secondary control: never competes with the numbers next to it. */
const exportButtonStyle: CSSProperties = {
  ...mono,
  fontSize: FONT_SIZE["2xs"],
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  background: "transparent",
  color: COLORS.inkMuted,
  border: `1px solid ${COLORS.panelMuted}`,
  borderRadius: RADIUS.sm,
  padding: `${SPACE[2]}px ${SPACE[5]}px`,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

const ExportButton: React.FC<{ onClick: () => void; label?: string; title?: string }> = ({
  onClick,
  label = "CSV",
  title,
}) => (
  <button type="button" onClick={onClick} style={exportButtonStyle} title={title}>
    ↓ {label}
  </button>
);


const Card: React.FC<{
  title: string;
  children: React.ReactNode;
  span?: boolean;
  action?: React.ReactNode;
}> = ({ title, children, span, action }) => (
  <section style={{ ...cardStyle, gridColumn: span ? "1 / -1" : undefined }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACE[5],
      }}
    >
      <h2 style={sectionTitle}>{title}</h2>
      {action}
    </div>
    {children}
  </section>
);


/**
 * Headline tile. Deliberately heavier and larger than anything below it: this
 * band is the licensing pitch, the sections underneath are diagnostics.
 * `note` carries the "not enough data" story so a tile never shows a
 * misleading zero.
 */
const Stat: React.FC<{ label: string; value: string; note?: string; muted?: boolean }> = ({
  label,
  value,
  note,
  muted,
}) => (
  <div
    style={{
      boxSizing: "border-box",
      background: COLORS.surface,
      border: BORDER.standard,
      borderRadius: RADIUS.md,
      padding: SPACE[8],
      display: "flex",
      flexDirection: "column",
      gap: SPACE[3],
      minWidth: 0,
    }}
  >
    <span style={labelStyle}>{label}</span>
    <span
      style={{
        ...mono,
        // A short number gets the full headline size; the "not enough data"
        // sentence steps down so a tile never dwarfs its neighbours.
        fontSize: value.length > 10 ? 20 : 34,
        lineHeight: 1,
        fontWeight: 600,
        color: muted ? COLORS.inkMuted : COLORS.ink,
        overflowWrap: "anywhere",
      }}
    >
      {value}
    </span>
    {note ? (
      <span style={{ ...mono, fontSize: FONT_SIZE["2xs"], color: COLORS.inkMuted }}>{note}</span>
    ) : null}
  </div>
);



const Table: React.FC<{ head: string[]; rows: (string | number)[][] }> = ({ head, rows }) => (
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        {head.map((h, i) => (
          <th
            key={h}
            style={{
              ...labelStyle,
              textAlign: i === 0 ? "left" : "right",
              padding: `0 ${i === 0 ? 0 : SPACE[2]}px ${SPACE[3]}px`,
              whiteSpace: "normal",
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={head.length} style={{ ...rowLabelStyle }}>
            No data in range
          </td>
        </tr>
      ) : (
        rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td
                key={ci}
                style={
                  ci === 0
                    ? { ...rowLabelStyle, ...rowLabelWrapStyle }
                    : { ...cellStyle, paddingLeft: SPACE[2] }
                }
              >
                {c}
              </td>
            ))}
          </tr>
        ))
      )}
    </tbody>
  </table>
);

const Dashboard: React.FC<{ session: Session }> = ({ session }) => {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [trendAll, setTrendAll] = useState(false);
  const [confirmList, setConfirmList] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [failures, setFailures] = useState<string[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    setFailures([]);
    const args = { p_from: from, p_to: to };

    // One report failing must never blank the rest of the page, so every RPC is
    // called in its own isolated wrapper that resolves instead of throwing.
    // `supabase.rpc` needs its receiver: calling a detached reference throws.
    const failed: string[] = [];
    const call = async <T,>(name: string, a?: unknown): Promise<T[]> => {
      try {
        const { data: rows, error: err } = await (
          supabase.rpc as unknown as (
            n: string,
            b?: unknown,
          ) => Promise<{ data: unknown; error: { message: string } | null }>
        ).call(supabase, name, a);
        if (err) throw new Error(err.message);
        return (rows as T[] | null) ?? [];
      } catch (e) {
        console.error(`admin: ${name} failed`, e);
        failed.push(name);
        return [];
      }
    };

    const [funnel, difficulty, howto, attribution, trend, subscribers, headline, rejections, nextDay] =
      await Promise.all([
        call<FunnelRow>("admin_funnel", args),
        call<DifficultyRow>("admin_difficulty", args),
        call<HowtoRow>("admin_howto", args),
        call<AttributionRow>("admin_attribution", args),
        call<TrendRow>("admin_trend", args),
        call<SubscriberRow>("admin_subscribers"),
        call<HeadlineRow>("admin_headline", args),
        call<RejectionRow>("admin_rejections", args),
        call<NextDayRow>("admin_next_day_return"),
      ]);

    setFailures(failed);

    // Every report failing means the fetch itself is broken, not an empty range.
    if (failed.length === 9) {
      setState("error");
      return;
    }

    const funnelRow = funnel[0] ?? null;
    // The allowlist check lives in the RPC: a non-allowlisted signed-in user
    // gets zero rows back from every one of them. Only treat that as "denied"
    // when the call actually succeeded.
    if (!funnelRow && !failed.includes("admin_funnel")) {
      setState("denied");
      return;
    }

    setData({
      funnel: funnelRow,
      difficulty,
      howto,
      attribution,
      trend,
      subscribers,
      rejections,
      headline: headline[0] ?? null,
      nextDay: nextDay[0] ?? null,
    });

    setState("ready");
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- exports ------------------------------------------------------------
  // Every CSV is built in the browser from data these RPCs already returned,
  // so no new surface is exposed and nothing extra is collected.
  const exportInput = useMemo<ExportInput>(
    () => ({
      headline: data?.headline ?? null,
      funnel: data?.funnel ?? null,
      difficulty: data?.difficulty ?? [],
      howto: data?.howto ?? [],
      attribution: data?.attribution ?? [],
      trend: data?.trend ?? [],
      subscribers: data?.subscribers ?? [],
    }),
    [data],
  );

  const exportSection = useCallback(
    (build: (d: ExportInput) => ExportSection) => {
      const section = build(exportInput);
      downloadFile(exportFilename(section.id, from, to), sectionCsv(section));
    },
    [exportInput, from, to],
  );

  const exportHeadline = useCallback(() => exportSection(headlineSection), [exportSection]);

  const exportAll = useCallback(() => {
    downloadFile(exportFilename("all", from, to), combinedCsv(exportInput, from, to));
  }, [exportInput, from, to]);

  const exportPitch = useCallback(() => {
    downloadFile(
      exportFilename("snapshot", from, to, "md"),
      pitchSnapshot(exportInput, from, to),
      "text/markdown;charset=utf-8",
    );
  }, [exportInput, from, to]);

  const exportSubscribers = useCallback(async () => {
    setListBusy(true);
    setListError(null);
    const { data: rows, error } = await supabase.rpc("admin_export_subscribers");
    setListBusy(false);
    if (error) {
      setListError("Could not fetch the list. Try again.");
      return;
    }
    const list = (rows as SubscriberExportRow[] | null) ?? [];
    if (list.length === 0) {
      setListError("No subscribers returned.");
      return;
    }
    downloadFile(exportFilename("subscribers", from, to), subscriberCsv(list));
    setConfirmList(false);
  }, [from, to]);

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);


  const header = (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: SPACE[6],
        justifyContent: "space-between",
      }}
    >
      <div>
        <h1 style={{ ...textStyle("title"), color: COLORS.ink, margin: 0, fontFamily: FONT_FAMILY }}>
          Daily Dashboard
        </h1>
        <span style={labelStyle}>{session.user.email}</span>
      </div>
      <button type="button" onClick={signOut} style={buttonStyle("ink", "sm")}>
        Sign out
      </button>
    </header>
  );

  if (state === "denied") {
    return (
      <main style={pageStyle}>
        {header}
        <div style={cardStyle}>
          <h2 style={sectionTitle}>No access</h2>
          <p style={{ ...mono, fontSize: FONT_SIZE.xs, color: COLORS.ink, margin: 0 }}>
            You're signed in as {session.user.email}, but that address isn't on the admin list. Ask
            for access, or sign out and use a different address.
          </p>
        </div>
      </main>
    );
  }

  const f = data?.funnel;

  return (
    <main style={pageStyle}>
      {/* Backup heartbeat first: a failure has to be the thing you see. */}
      <AdminBackupBanner />

      {header}


      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE[5] }}>
        <span style={labelStyle}>Range</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          style={inputStyle}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          style={inputStyle}
        />
        <button type="button" onClick={() => void load()} style={buttonStyle("secondary", "sm")}>
          {state === "loading" ? "Loading…" : "Refresh"}
        </button>
      </div>

      {state === "error" ? (
        <div style={{ ...cardStyle, borderColor: COLORS.red }}>
          <h2 style={{ ...sectionTitle, color: COLORS.red }}>Could not load</h2>
          <p style={{ ...mono, fontSize: FONT_SIZE.xs, color: COLORS.ink, margin: 0 }}>
            Every dashboard query failed, so nothing below is current. Try refreshing.
          </p>
        </div>
      ) : null}

      {/* A partial failure is named rather than shown as an empty section, so a
          broken report can never be mistaken for a quiet day. */}
      {state !== "error" && failures.length > 0 ? (
        <div style={{ ...cardStyle, borderColor: COLORS.red }}>
          <h2 style={{ ...sectionTitle, color: COLORS.red }}>Some reports failed to load</h2>
          <p style={{ ...mono, fontSize: FONT_SIZE.xs, color: COLORS.ink, margin: 0 }}>
            {failures.join(", ")} — those sections are blank because the query failed, not because
            there is no data. Everything else below is current.
          </p>
        </div>
      ) : null}


      {/* Export controls. The pitch snapshot leads because it is the thing a
          publisher conversation actually needs; the subscriber list is kept
          apart because it is personal data and asks before it downloads. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE[5] }}>
        <span style={labelStyle}>Export</span>
        <ExportButton
          onClick={exportPitch}
          label="Pitch snapshot (.md)"
          title="One-page headline summary to paste into a deck or an email"
        />
        <ExportButton onClick={exportAll} label="Everything (.csv)" />
        <ExportButton onClick={exportHeadline} label="Headline (.csv)" />
        <span style={{ flex: "1 1 0", minWidth: 0 }} />
        <button
          type="button"
          onClick={() => setConfirmList(true)}
          style={{ ...exportButtonStyle, color: COLORS.red, borderColor: COLORS.red }}
        >
          ↓ Subscriber list (emails)
        </button>
      </div>

      {confirmList ? (
        <div style={{ ...cardStyle, gap: SPACE[6] }}>
          <h2 style={sectionTitle}>Export subscriber emails?</h2>
          <p style={{ ...mono, fontSize: FONT_SIZE.xs, color: COLORS.ink, margin: 0 }}>
            This downloads every subscriber's email address, source, ActiveCampaign sync state and
            signup time. It is personal data — handle it accordingly. The export is recorded against{" "}
            {session.user.email}.
          </p>
          {listError ? (
            <span style={{ ...mono, fontSize: FONT_SIZE["2xs"], color: COLORS.red }}>{listError}</span>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE[5] }}>
            <button
              type="button"
              onClick={() => void exportSubscribers()}
              disabled={listBusy}
              style={buttonStyle("primary", "sm", { disabled: listBusy })}
            >
              {listBusy ? "Preparing…" : "Download the list"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmList(false);
                setListError(null);
              }}
              style={buttonStyle("secondary", "sm")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}



      {(() => {
        const h = data?.headline;
        const n = (v: number | null | undefined) =>
          typeof v === "number" ? v.toLocaleString() : "—";
        const MIN = 20; // below this a rate is noise, not a signal
        return (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: SPACE[6],
            }}
          >
            <Stat
              label="Total players"
              value={n(h?.total_players)}
              note="Distinct visitors, all time"
            />
            <Stat
              label="Daily active"
              value={n(h?.dau_today)}
              note={`Today · range avg ${h ? h.dau_avg : "—"}`}
            />
            {h && h.returning_pct !== null && h.returning_eligible >= MIN ? (
              <Stat
                label="Returning players (all-time)"
                value={`${h.returning_pct}%`}
                note={`Played on more than one day · of ${h.returning_eligible.toLocaleString()} players`}
              />
            ) : (
              <Stat
                label="Returning players (all-time)"
                value="Not enough data"
                note={`Needs ${MIN}+ players · ${h ? h.returning_eligible : 0} so far`}
                muted
              />
            )}
            {(() => {
              const nd = data?.nextDay;
              if (!nd) {
                return (
                  <Stat
                    label="Next-day return"
                    value="No completed pair yet"
                    note="Needs two fully elapsed puzzle days"
                    muted
                  />
                );
              }
              const v =
                nd.visitor_pct === null ? "—" : `${nd.visitor_pct}%`;
              const e = nd.email_pct === null ? "—" : `${nd.email_pct}%`;
              return (
                <Stat
                  label="Next-day return"
                  value={`${v} · ${e}`}
                  note={`#${nd.base_puzzle} → #${nd.next_puzzle} · by device ${nd.visitor_returned}/${nd.visitor_base} · by email ${nd.email_returned}/${nd.email_base} (more reliable)`}
                />
              );
            })()}

            {h && h.d7_pct !== null && h.d7_eligible >= MIN ? (
              <Stat
                label="Day 7 retention"
                value={`${h.d7_pct}%`}
                note={`Of ${h.d7_eligible.toLocaleString()} eligible players`}
              />
            ) : (
              <Stat
                label="Day 7 retention"
                value="Not enough data"
                note={`Needs ${MIN}+ players 7+ days old · ${h ? h.d7_eligible : 0} so far`}
                muted
              />
            )}
            <Stat label="Email list" value={n(h?.subscribers)} note="Total subscribers" />
            {h && h.share_rate !== null ? (
              <Stat
                label="Share rate"
                value={`${h.share_rate}%`}
                note={`${h.shares.toLocaleString()} of ${h.runs_finished.toLocaleString()} runs`}
              />
            ) : (
              <Stat label="Share rate" value="Not enough data" note="No finished runs in range" muted />
            )}
          </div>
        );
      })()}


      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: SPACE[8],
          alignItems: "start",
        }}
      >
        <Card title="Funnel" action={<ExportButton onClick={() => exportSection(funnelSection)} />}>
          <Table
            head={["Step", "Count", "% of above"]}
            rows={
              f
                ? [
                    ["Ready viewed", f.ready_viewed, "—"],
                    ["Run started", f.run_started, pct(f.run_started, f.ready_viewed)],
                    ["Run finished", f.run_finished, pct(f.run_finished, f.run_started)],
                    ["Runs abandoned", f.run_abandoned, pct(f.run_abandoned, f.run_started)],
                    ["Shared", f.shared, pct(f.shared, f.run_finished)],
                    ["Subscribed", f.subscribed, pct(f.subscribed, f.run_finished)],
                  ]
                : []
            }
          />
        </Card>

        <Card
          title="Difficulty"
          action={<ExportButton onClick={() => exportSection(difficultySection)} />}
        >
          <Table
            head={["Round", "Solved", "Failed", "Solve rate", "Avg misses"]}
            rows={(data?.difficulty ?? []).map((r) => [
              `R${r.round}`,
              r.solved,
              r.failed,
              `${r.solve_rate}%`,
              r.avg_misses,
            ])}
          />
        </Card>

        <Card
          title="How to Play"
          action={<ExportButton onClick={() => exportSection(howtoSection)} />}
        >
          <Table
            head={["Step", "Count"]}
            rows={
              data?.howto?.[0]
                ? [
                    ["Opened", data.howto[0].opened],
                    ["Finished", data.howto[0].finished],
                    ["Skipped", data.howto[0].skipped],
                  ]
                : []
            }
          />
          <Table
            head={["Skipped on slide", "Count"]}
            rows={(data?.howto ?? [])
              .filter((r) => r.skip_slide !== null)
              .map((r) => [`Slide ${r.skip_slide}`, r.skip_count ?? 0])}
          />
        </Card>

        <Card
          title="Attribution"
          action={<ExportButton onClick={() => exportSection(attributionSection)} />}
        >
          <Table
            head={["Referrer", "Visitors"]}
            rows={(data?.attribution ?? [])
              .filter((r) => r.kind === "referrer")
              .map((r) => [r.source, r.visitors])}
          />
          <Table
            head={["utm_source / ref", "Visitors"]}
            rows={(data?.attribution ?? [])
              .filter((r) => r.kind === "utm_source")
              .map((r) => [r.source, r.visitors])}
          />
        </Card>

        <Card title="List" action={<ExportButton onClick={() => exportSection(listSection)} />}>
          <Table
            head={["Source", "Subscribers", "Synced"]}
            rows={(data?.subscribers ?? []).map((r) => [r.source, r.total, r.synced])}
          />
          <span style={labelStyle}>
            Total {(data?.subscribers ?? []).reduce((n, r) => n + r.total, 0)} · synced{" "}
            {(data?.subscribers ?? []).reduce((n, r) => n + r.synced, 0)}
          </span>
        </Card>

        {/* Diagnostic: a refused save is silent to the player by design, so the
            reason surfaces here instead. Empty is the healthy state. */}
        <Card title="Refused results">
          {(data?.rejections ?? []).length === 0 ? (
            <span style={labelStyle}>None refused in this range.</span>
          ) : (
            <Table
              head={["Reason", "Refused", "Players"]}
              rows={(data?.rejections ?? []).map((r) => [r.reason, r.rejections, r.visitors])}
            />
          )}
        </Card>



        {/* Collapsed to the most recent seven days by default: on a phone an
            inner scroll area inside a page that already scrolls is a trap. */}
        <Card
          title="Daily trend"
          span
          action={<ExportButton onClick={() => exportSection(trendSection)} />}
        >
          {(() => {
            const all = [...(data?.trend ?? [])].reverse(); // newest first
            const rows = (trendAll ? all : all.slice(0, 7)).map((r) => [
              r.day,
              r.runs_started,
              r.runs_finished,
              r.results_saved,
            ]);
            return (
              <>
                <Table head={["Day", "Started", "Finished", "Results saved"]} rows={rows} />
                {all.length > 7 ? (
                  <button
                    type="button"
                    onClick={() => setTrendAll((v) => !v)}
                    style={buttonStyle("secondary", "sm")}
                  >
                    {trendAll ? "Show last 7 days" : `Show all ${all.length} days`}
                  </button>
                ) : null}
              </>
            );
          })()}
        </Card>

      </div>
    </main>
  );
};

const pageStyle: CSSProperties = {
  minHeight: "var(--ww-vh, 100vh)",
  background: COLORS.panel,
  padding: SPACE[10],
  display: "flex",
  flexDirection: "column",
  gap: SPACE[10],
};

// ---------------------------------------------------------------------------
// route entry — session gate only; the real gate is server-side
// ---------------------------------------------------------------------------

const AdminPage: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecked(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) {
    return <main style={{ ...pageStyle, alignItems: "center", justifyContent: "center" }} />;
  }
  return session ? <Dashboard session={session} /> : <SignInGate />;
};

export default AdminPage;
