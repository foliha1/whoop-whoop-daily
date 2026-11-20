// ============================================================================
// Admin overview (Nov 2026): the lifetime numbers Felix checks first, in plain
// questions. One RPC (admin_overview) returns everything; admin accounts, the
// browsers they signed in on, and browsers tagged "This is me" are left out
// unless "Hide my activity" is switched off. People are counted by browser, so
// one person on two devices counts twice: read it for trends, not headcounts.
// ============================================================================

import React, { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitor";
import { AppButton } from "@/components/ui/AppButton";
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
} from "@/lib/tokens";

export interface OverviewSource {
  source: string;
  visitors: number;
  played: number;
  returned: number;
  signed_up: number;
}

export interface OverviewDay {
  day: string;
  daily: number;
  solo: number;
  together: number;
  signups: number;
}

export interface Overview {
  since: string | null;
  today: string;
  hidden_browsers: number;
  this_browser_hidden: boolean;
  players: { any: number; daily: number; solo: number; together: number; all_three: number; two_plus: number };
  returning: {
    lifetime_players: number;
    lifetime_back: number;
    return_day: string;
    yesterday_players: number;
    yesterday_back: number;
  };
  list: { total: number; by_source: { source: string; n: number }[]; accounts: number; reminder_yes: number };
  shares: { lifetime: number; today: number; invites_lifetime: number; invites_today: number };
  preorder: { clicks: number; clicks_today: number; views: number };
  sources: OverviewSource[];
  trend: OverviewDay[];
}

/** Plain names for where a subscriber joined. */
export const LIST_SOURCE_NAMES: Record<string, string> = {
  daily_result: "Daily results screen",
  prelaunch: "Pre-launch list",
  home: "Home page",
  restore: "Restore streak",
  solo: "Solo results",
  unknown: "Unknown",
};

const n = (v: number) => v.toLocaleString();
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : "–");

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

// --- styles -----------------------------------------------------------------

const ui: CSSProperties = { fontFamily: FONT_FAMILY_UI, fontVariantNumeric: "tabular-nums" };
const heading: CSSProperties = { fontFamily: FONT_FAMILY, fontSize: 24, lineHeight: 1.15, fontWeight: 400, color: COLORS.ink, margin: 0 };
const sub: CSSProperties = { ...ui, fontSize: FONT_SIZE.xs, color: COLORS.inkMuted, margin: 0 };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: SPACE[5] };
const section: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE[5], minWidth: 0 };

const Tile: React.FC<{ value: string; label: string; tone?: "blue" | "orange"; wide?: boolean }> = ({ value, label, tone, wide }) => {
  const bg = tone === "blue" ? COLORS.blue : tone === "orange" ? COLORS.orange : COLORS.surface;
  const fg = tone === "blue" ? COLORS.onBlue : COLORS.ink;
  return (
    <div
      style={{
        background: bg,
        border: BORDER.standard,
        borderColor: tone === "blue" ? COLORS.ink : undefined,
        borderRadius: RADIUS.md,
        padding: `${SPACE[5]}px ${SPACE[6]}px`,
        gridColumn: wide ? "1 / -1" : undefined,
        minWidth: 0,
      }}
    >
      <div style={{ ...ui, fontSize: wide ? 40 : 30, fontWeight: 600, lineHeight: 1.1, color: fg }}>{value}</div>
      <div style={{ ...ui, fontSize: FONT_SIZE.xs, color: fg, opacity: 1, marginTop: SPACE[1] }}>{label}</div>
    </div>
  );
};

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section style={section}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: SPACE[3] }}>
      <h2 style={heading}>{title}</h2>
      {note ? <p style={sub}>{note}</p> : null}
    </div>
    {children}
  </section>
);

const table: CSSProperties = {
  ...ui,
  width: "100%",
  borderCollapse: "collapse",
  fontSize: FONT_SIZE.sm,
  background: COLORS.surface,
  border: BORDER.standard,
  borderRadius: RADIUS.md,
};
const th: CSSProperties = { textAlign: "right", fontWeight: 600, color: COLORS.inkMuted, padding: `${SPACE[3]}px ${SPACE[3]}px`, borderBottom: BORDER.standard, whiteSpace: "nowrap" };
const td: CSSProperties = { textAlign: "right", padding: `${SPACE[3]}px ${SPACE[3]}px`, borderTop: `1px solid ${COLORS.panelMuted}`, color: COLORS.ink, whiteSpace: "nowrap" };

const TREND_SERIES: { key: keyof OverviewDay; label: string; color: string; bar?: boolean }[] = [
  { key: "daily", label: "Daily players", color: COLORS.blue },
  { key: "solo", label: "Solo players", color: COLORS.orange },
  { key: "together", label: "Together players", color: COLORS.red },
  { key: "signups", label: "New signups", color: COLORS.ink, bar: true },
];

/** Small multiples: each line gets its own scale, so one spike day never flattens the rest. */
const TrendChart: React.FC<{ days: OverviewDay[] }> = ({ days }) => (
  <div style={{ ...grid, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
    {TREND_SERIES.map((s) => {
      const total = days.reduce((sum, d) => sum + Number(d[s.key] ?? 0), 0);
      const last = days.length ? Number(days[days.length - 1][s.key] ?? 0) : 0; // yesterday: today is left off
      const data = days.map((d) => ({ day: shortDate(d.day), v: Number(d[s.key] ?? 0) }));
      return (
        <div key={s.key} style={{ background: COLORS.surface, border: BORDER.standard, borderRadius: RADIUS.md, padding: SPACE[5], minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SPACE[3] }}>
            <span style={{ ...ui, fontSize: FONT_SIZE.sm, fontWeight: 600, color: COLORS.ink }}>
              <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: s.color, marginRight: 6 }} />
              {s.label}
            </span>
            <span style={sub}>{n(last)} yesterday · {n(total)} in 30 days</span>
          </div>
          <div style={{ height: 90, marginTop: SPACE[3] }}>
            <ResponsiveContainer width="100%" height="100%">
              {s.bar ? (
                <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: COLORS.inkMuted }} interval={9} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: COLORS.inkMuted }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [n(v), s.label]} />
                  <Bar dataKey="v" fill={s.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              ) : (
                <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: COLORS.inkMuted }} interval={9} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: COLORS.inkMuted }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [n(v), s.label]} />
                  <Line dataKey="v" stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      );
    })}
  </div>
);

/** Pure view, so it can be tested and previewed without the database. */
export const AdminOverviewView: React.FC<{
  data: Overview;
  hideMine: boolean;
  onHideMineChange: (hide: boolean) => void;
  onTagBrowser: (hide: boolean) => void;
  busy?: boolean;
}> = ({ data, hideMine, onHideMineChange, onTagBrowser, busy = false }) => {
  const p = data.players;
  const r = data.returning;
  return (
    <div data-testid="admin-overview" style={{ display: "flex", flexDirection: "column", gap: SPACE[12], minWidth: 0 }}>
      {/* Whose activity counts */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE[5], ...ui, fontSize: FONT_SIZE.sm, color: COLORS.ink }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: SPACE[3], cursor: "pointer" }}>
          <input type="checkbox" checked={hideMine} onChange={(e) => onHideMineChange(e.target.checked)} />
          Hide my activity
        </label>
        <span style={sub}>
          {hideMine ? `${n(data.hidden_browsers)} admin and test browsers left out` : "Showing everyone, including admins"}
        </span>
        <AppButton
          type="button"
          disabled={busy}
          onClick={() => onTagBrowser(!data.this_browser_hidden)}
          style={{ ...buttonStyle("quiet", "sm"), fontFamily: FONT_FAMILY_UI, fontWeight: FONT_WEIGHT_UI }}
        >
          {data.this_browser_hidden ? "Count This Browser Again" : "This Is Me"}
        </AppButton>
      </div>

      <Section title="Players" note={data.since ? `Lifetime, since ${shortDate(data.since)}` : "Lifetime"}>
        <div style={grid}>
          <Tile wide tone="blue" value={n(p.any)} label="people have played Whoop! Whoop!" />
          <Tile value={n(p.daily)} label="played the Daily" />
          <Tile value={n(p.solo)} label="played Solo" />
          <Tile value={n(p.together)} label="played Together" />
          <Tile tone="orange" value={n(p.all_three)} label={`played all three · ${n(p.two_plus)} played 2 or more`} />
        </div>
      </Section>

      <Section title="Coming back" note="Daily">
        <div style={grid}>
          <Tile value={pct(r.lifetime_back, r.lifetime_players)} label={`lifetime · ${n(r.lifetime_back)} of ${n(r.lifetime_players)} played on 2 or more days`} />
          <Tile
            value={pct(r.yesterday_back, r.yesterday_players)}
            label={`yesterday · ${n(r.yesterday_back)} of ${n(r.yesterday_players)} came back on ${shortDate(r.return_day)}`}
          />
        </div>
      </Section>

      <Section title="Email list" note="Lifetime · everyone goes to one ActiveCampaign list">
        <div style={grid}>
          <Tile wide tone="blue" value={n(data.list.total)} label="subscribers" />
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Where they joined</th>
              <th style={th}>People</th>
            </tr>
          </thead>
          <tbody>
            {data.list.by_source.map((s) => (
              <tr key={s.source}>
                <td style={{ ...td, textAlign: "left" }}>{LIST_SOURCE_NAMES[s.source] ?? s.source}</td>
                <td style={td}>{n(s.n)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, textAlign: "left", color: COLORS.inkMuted }}>Signed-in accounts · said yes to reminder</td>
              <td style={{ ...td, color: COLORS.inkMuted }}>{n(data.list.accounts)} · {n(data.list.reminder_yes)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Sharing and sales">
        <div style={grid}>
          <Tile value={n(data.shares.lifetime)} label={`Daily shares lifetime · ${n(data.shares.today)} today`} />
          <Tile value={n(data.shares.invites_lifetime)} label={`Together invite links opened · ${n(data.shares.invites_today)} today`} />
          <Tile value={n(data.preorder.clicks)} label={`pre-order cart clicks · ${n(data.preorder.clicks_today)} today`} />
          <Tile value={n(data.preorder.views)} label="pre-order page views" />
        </div>
      </Section>

      <Section title="Where players come from" note="Lifetime · first visit to the Daily">
        <div style={{ overflowX: "auto", minWidth: 0 }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Source</th>
                <th style={th}>Visitors</th>
                <th style={th}>Signed up</th>
                <th style={th}>Came back</th>
                <th style={th}>Played</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.source}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{s.source}</td>
                  <td style={td}>{n(s.visitors)}</td>
                  <td style={{ ...td, fontWeight: 600, color: s.visitors >= 50 && s.signed_up === 0 ? COLORS.redText : COLORS.ink }}>
                    {n(s.signed_up)} · {pct(s.signed_up, s.visitors)}
                  </td>
                  <td style={td}>{n(s.returned)} · {pct(s.returned, s.played)}</td>
                  <td style={td}>{n(s.played)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={sub}>"Signed up" is the share of visitors who joined the list or signed in. "Came back" is the share of players who played on 2 or more days.</p>
      </Section>

      <Section title="Last 30 days" note="People per day · today is left off until it ends">
        <TrendChart days={data.trend.filter((d) => d.day !== data.today)} />
      </Section>
    </div>
  );
};

const AdminOverview: React.FC = () => {
  const [hideMine, setHideMine] = useState(true);
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (hide: boolean) => {
    setState((s) => (s === "ready" ? s : "loading"));
    const { data: out, error } = await (
      supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }>
    ).call(supabase, "admin_overview", { p_hide_admin: hide, p_visitor_id: getVisitorId() });
    // A missing or malformed report reads as an error, never as zeros.
    const valid = !!out && typeof out === "object" && "players" in (out as object) && Array.isArray((out as Overview).trend);
    if (error || !valid) {
      console.error("admin: admin_overview failed", error);
      setState("error");
      return;
    }
    setData(out as Overview);
    setState("ready");
  }, []);

  useEffect(() => {
    void load(hideMine);
  }, [hideMine, load]);

  const tagBrowser = async (hide: boolean) => {
    setBusy(true);
    await (
      supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }>
    ).call(supabase, "admin_tag_browser", { p_visitor_id: getVisitorId(), p_hide: hide });
    await load(hideMine);
    setBusy(false);
  };

  if (state === "error") {
    return (
      <div style={{ background: COLORS.surface, border: BORDER.standard, borderColor: COLORS.red, borderRadius: RADIUS.md, padding: SPACE[8] }}>
        <h2 style={{ ...heading, color: COLORS.redText }}>Overview could not load</h2>
        <p style={{ ...sub, color: COLORS.ink, marginTop: SPACE[3] }}>The detailed reports below may still work. Try refreshing.</p>
      </div>
    );
  }
  if (!data) return <p style={sub}>Loading overview…</p>;
  return (
    <AdminOverviewView
      data={data}
      hideMine={hideMine}
      onHideMineChange={setHideMine}
      onTagBrowser={(hide) => void tagBrowser(hide)}
      busy={busy}
    />
  );
};

export default AdminOverview;
