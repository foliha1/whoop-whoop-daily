// ============================================================================
// Admin dashboard exports.
//
// Everything here is pure string building over data the dashboard has already
// fetched through the allowlist-checked RPCs — no new endpoint, no new
// collection. The only browser-touching helper is `downloadFile`.
//
// Spreadsheet safety: a field that starts with `=`, `+`, `-` or `@` is prefixed
// with a single quote so Excel/Sheets treats it as text instead of a formula.
// Referrer strings are the realistic vector here.
// ============================================================================

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Quote/escape one CSV field, neutralising spreadsheet formula injection. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Rows to CSV text, CRLF terminated so Excel is happy. */
export function toCsv(head: string[], rows: CsvValue[][]): string {
  return [head, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n");
}

/** `whoop-whoop-funnel-2026-08-11_2026-08-25.csv` */
export function exportFilename(section: string, from: string, to: string, ext = "csv"): string {
  return `whoop-whoop-${section}-${from}_${to}.${ext}`;
}

export function downloadFile(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([`\uFEFF${text}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give Safari a beat before the object URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// section shapes — mirror what is rendered on screen
// ---------------------------------------------------------------------------

export interface ExportSection {
  /** Slug used in the filename. */
  id: string;
  /** Human label used as the block heading in the combined export. */
  label: string;
  head: string[];
  rows: CsvValue[][];
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export interface ExportInput {
  headline: {
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
  } | null;
  funnel: {
    ready_viewed: number;
    run_started: number;
    run_finished: number;
    run_abandoned: number;
    shared: number;
    subscribed: number;
  } | null;
  difficulty: { round: number; solved: number; failed: number; solve_rate: number; avg_misses: number }[];
  howto: { opened: number; finished: number; skipped: number; skip_slide: number | null; skip_count: number | null }[];
  attribution: { kind: string; source: string; visitors: number }[];
  trend: { day: string; runs_started: number; runs_finished: number; results_saved: number }[];
  subscribers: { source: string; total: number; synced: number }[];
}

const MIN_SAMPLE = 20; // matches the dashboard's "not enough data" threshold

export function headlineSection(d: ExportInput): ExportSection {
  const h = d.headline;
  const rate = (value: number | null, eligible: number, note: string): [string, string] =>
    value !== null && eligible >= MIN_SAMPLE
      ? [`${value}%`, note]
      : ["Not enough data", `Needs ${MIN_SAMPLE}+ · ${eligible} so far`];
  const returning = rate(
    h?.returning_pct ?? null,
    h?.returning_eligible ?? 0,
    `Of ${(h?.returning_eligible ?? 0).toLocaleString()} players`,
  );
  const d7 = rate(
    h?.d7_pct ?? null,
    h?.d7_eligible ?? 0,
    `Of ${(h?.d7_eligible ?? 0).toLocaleString()} eligible players`,
  );
  return {
    id: "headline",
    label: "Headline",
    head: ["Metric", "Value", "Note"],
    rows: h
      ? [
          ["Total players", h.total_players, "Distinct visitors, all time"],
          ["Daily active", h.dau_today, `Today · range avg ${h.dau_avg}`],
          ["Returning players", returning[0], returning[1]],
          ["Day 7 retention", d7[0], d7[1]],
          ["Email list", h.subscribers, "Total subscribers"],
          [
            "Share rate",
            h.share_rate !== null ? `${h.share_rate}%` : "Not enough data",
            h.share_rate !== null
              ? `${h.shares.toLocaleString()} of ${h.runs_finished.toLocaleString()} runs`
              : "No finished runs in range",
          ],
        ]
      : [],
  };
}

export function funnelSection(d: ExportInput): ExportSection {
  const f = d.funnel;
  return {
    id: "funnel",
    label: "Funnel",
    head: ["Step", "Count", "% of above"],
    rows: f
      ? [
          ["Ready viewed", f.ready_viewed, "—"],
          ["Run started", f.run_started, pct(f.run_started, f.ready_viewed)],
          ["Run finished", f.run_finished, pct(f.run_finished, f.run_started)],
          ["Runs abandoned", f.run_abandoned, pct(f.run_abandoned, f.run_started)],
          ["Shared", f.shared, pct(f.shared, f.run_finished)],
          ["Subscribed", f.subscribed, pct(f.subscribed, f.run_finished)],
        ]
      : [],
  };
}

export function difficultySection(d: ExportInput): ExportSection {
  return {
    id: "difficulty",
    label: "Difficulty by round",
    head: ["Round", "Solved", "Failed", "Solve rate", "Avg misses"],
    rows: d.difficulty.map((r) => [`R${r.round}`, r.solved, r.failed, `${r.solve_rate}%`, r.avg_misses]),
  };
}

export function howtoSection(d: ExportInput): ExportSection {
  const first = d.howto[0];
  const rows: CsvValue[][] = first
    ? [
        ["Opened", first.opened],
        ["Finished", first.finished],
        ["Skipped", first.skipped],
      ]
    : [];
  for (const r of d.howto) {
    if (r.skip_slide !== null) rows.push([`Skipped on slide ${r.skip_slide}`, r.skip_count ?? 0]);
  }
  return { id: "how-to-play", label: "How to Play", head: ["Step", "Count"], rows };
}

export function attributionSection(d: ExportInput): ExportSection {
  return {
    id: "attribution",
    label: "Attribution",
    head: ["Kind", "Source", "Visitors"],
    rows: d.attribution.map((r) => [r.kind === "referrer" ? "Referrer" : "utm_source", r.source, r.visitors]),
  };
}

export function trendSection(d: ExportInput): ExportSection {
  return {
    id: "daily-trend",
    label: "Daily trend",
    head: ["Day", "Started", "Finished", "Results saved"],
    rows: d.trend.map((r) => [r.day, r.runs_started, r.runs_finished, r.results_saved]),
  };
}

export function listSection(d: ExportInput): ExportSection {
  return {
    id: "list",
    label: "List",
    head: ["Source", "Subscribers", "Synced"],
    rows: d.subscribers.map((r) => [r.source, r.total, r.synced]),
  };
}

export function allSections(d: ExportInput): ExportSection[] {
  return [
    headlineSection(d),
    funnelSection(d),
    difficultySection(d),
    howtoSection(d),
    attributionSection(d),
    trendSection(d),
    listSection(d),
  ];
}

export function sectionCsv(section: ExportSection): string {
  return toCsv(section.head, section.rows);
}

/**
 * Everything in one file, one labelled block per section. Chosen over a zip:
 * no dependency, no binary assembly, and a single file opens straight into a
 * spreadsheet where the blocks read top to bottom.
 */
export function combinedCsv(d: ExportInput, from: string, to: string, generated = todayIso()): string {
  const blocks = allSections(d).map(
    (s) => `${csvField(`# ${s.label}`)}\r\n${sectionCsv(s)}`,
  );
  const header = [
    toCsv(["Whoop! Whoop! Daily — dashboard export"], []),
    toCsv(["Range", `${from} to ${to}`], []),
    toCsv(["Generated", generated], []),
  ].join("\r\n");
  return [header, ...blocks].join("\r\n\r\n");
}

// ---------------------------------------------------------------------------
// pitch snapshot — markdown, paste straight into a deck or an email
// ---------------------------------------------------------------------------

export function pitchSnapshot(d: ExportInput, from: string, to: string, generated = todayIso()): string {
  const h = d.headline;
  const line = (label: string, value: string) => `- **${label}:** ${value}`;
  const rate = (value: number | null, eligible: number) =>
    value !== null && eligible >= MIN_SAMPLE
      ? `${value}% (of ${eligible.toLocaleString()} players)`
      : `Not enough data yet (${eligible.toLocaleString()} of ${MIN_SAMPLE} players needed)`;
  return [
    "# Whoop! Whoop! Daily — snapshot",
    "",
    `Range: ${from} to ${to}`,
    `Generated: ${generated}`,
    "",
    line("Total players", h ? h.total_players.toLocaleString() : "—"),
    line(
      "Daily active players",
      h ? `${h.dau_today.toLocaleString()} today · ${h.dau_avg} range average` : "—",
    ),
    line("Returning players", h ? rate(h.returning_pct, h.returning_eligible) : "—"),
    line("Day 7 retention", h ? rate(h.d7_pct, h.d7_eligible) : "—"),
    line("Email list size", h ? h.subscribers.toLocaleString() : "—"),
    line(
      "Share rate",
      h && h.share_rate !== null
        ? `${h.share_rate}% (${h.shares.toLocaleString()} of ${h.runs_finished.toLocaleString()} finished runs)`
        : "No finished runs in range",
    ),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// subscriber list — personal data, its own path
// ---------------------------------------------------------------------------

export interface SubscriberExportRow {
  email: string;
  source: string;
  synced_to_ac: boolean;
  created_at: string;
}

export function subscriberCsv(rows: SubscriberExportRow[]): string {
  return toCsv(
    ["email", "source", "synced_to_ac", "created_at"],
    rows.map((r) => [r.email, r.source, r.synced_to_ac, r.created_at]),
  );
}
