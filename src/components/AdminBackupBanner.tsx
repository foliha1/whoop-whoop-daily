// ============================================================================
// AdminBackupBanner — the backup heartbeat, on the page instead of in an inbox.
//
// Healthy: one quiet muted line. Failed or stale: loud red block naming what
// broke and when. Everything comes from the allowlist-checked
// admin_backup_status() RPC — no raw table access from the client.
// ============================================================================

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BORDER,
  COLORS,
  FONT_FAMILY_UI,
  FONT_SIZE,
  FONT_WEIGHT_UI,
  RADIUS,
  SPACE,
} from "@/lib/tokens";

interface NightRow {
  day: string;
  tables: number;
  failed: number;
  status: "ok" | "failed" | "missing";
}
interface TableRow {
  table: string;
  rows: number;
  bytes: number;
  status: string;
  prev_rows: number | null;
  delta: number | null;
}
interface FailureRow {
  day: string;
  table: string;
  error: string;
}
export interface BackupStatus {
  latest_day: string | null;
  latest_at: string | null;
  latest_bytes: number;
  last_ok_at: string | null;
  hours_since_ok: number | null;
  stale: boolean;
  nights: NightRow[];
  tables: TableRow[];
  failures: FailureRow[];
}

const mono: CSSProperties = {
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  fontVariantNumeric: "tabular-nums",
};

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function humanAge(hours: number | null): string {
  if (hours === null) return "never";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes ago`;
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Failed nights come first; a silently stopped job counts as failed too. */
export function bannerState(s: BackupStatus): "ok" | "bad" {
  const failedNight = s.nights.some((n) => n.status !== "ok");
  return s.stale || failedNight || s.failures.length > 0 ? "bad" : "ok";
}

export function bannerHeadline(s: BackupStatus): string {
  if (s.failures.length > 0) {
    const f = s.failures[0];
    return `Backup failed: ${f.table} on ${f.day}.`;
  }
  const missing = s.nights.filter((n) => n.status === "missing").map((n) => n.day);
  if (s.stale) {
    return `Backups stale. Last successful run ${humanAge(s.hours_since_ok)}${
      missing.length > 0 ? ` — no run for ${missing.join(", ")}` : ""
    }.`;
  }
  if (missing.length > 0) return `Backup did not run on ${missing.join(", ")}.`;
  return `Backups healthy. Last run ${humanAge(s.hours_since_ok)}.`;
}

const AdminBackupBanner: React.FC<{ status?: BackupStatus | null }> = ({ status }) => {
  const [data, setData] = useState<BackupStatus | null>(status ?? null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (status !== undefined) {
      setData(status);
      return;
    }
    let alive = true;
    void (async () => {
      const { data: row } = await supabase.rpc("admin_backup_status");
      if (alive) setData((row as unknown as BackupStatus | null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  if (!data) return null;

  const bad = bannerState(data) === "bad";
  const headline = bannerHeadline(data);

  const detailStyle: CSSProperties = {
    ...mono,
    fontSize: FONT_SIZE["2xs"],
    color: bad ? COLORS.offWhite : COLORS.inkMuted,
    margin: 0,
  };

  return (
    <section
      aria-label="Backup status"
      data-backup-state={bad ? "failed" : "healthy"}
      style={
        bad
          ? {
              boxSizing: "border-box",
              background: COLORS.red,
              border: `2px solid ${COLORS.red}`,
              borderRadius: RADIUS.md,
              padding: SPACE[8],
              display: "flex",
              flexDirection: "column",
              gap: SPACE[5],
            }
          : {
              boxSizing: "border-box",
              background: "transparent",
              border: BORDER.standard,
              borderRadius: RADIUS.md,
              padding: `${SPACE[4]}px ${SPACE[6]}px`,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: SPACE[5],
            }
      }
    >
      <span
        style={{
          ...mono,
          fontSize: bad ? FONT_SIZE.sm : FONT_SIZE["2xs"],
          letterSpacing: bad ? "0" : "0.04em",
          textTransform: bad ? "none" : "uppercase",
          color: bad ? COLORS.offWhite : COLORS.inkMuted,
          flex: "1 1 auto",
          minWidth: 0,
        }}
      >
        {headline}
      </span>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          ...mono,
          fontSize: FONT_SIZE["2xs"],
          background: "transparent",
          color: bad ? COLORS.offWhite : COLORS.inkMuted,
          border: `1px solid ${bad ? COLORS.offWhite : COLORS.panelMuted}`,
          borderRadius: RADIUS.sm,
          padding: `2px ${SPACE[4]}px`,
          cursor: "pointer",
        }}
      >
        {expanded ? "Hide Detail" : "Detail"}
      </button>

      {expanded ? (
        <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: SPACE[4] }}>
          <p style={detailStyle}>
            Last 7 nights:{" "}
            {data.nights.map((n) => `${n.day.slice(5)} ${n.status}`).join(" · ") || "no runs yet"}
          </p>
          <p style={detailStyle}>
            {data.tables.length === 0
              ? "No dump recorded."
              : data.tables
                  .map(
                    (t) =>
                      `${t.table} ${t.rows}${
                        t.delta === null ? "" : ` (${t.delta >= 0 ? "+" : ""}${t.delta} vs last week)`
                      }`,
                  )
                  .join(" · ")}
          </p>
          <p style={detailStyle}>
            Latest dump {data.latest_day ?? "none"} · {humanBytes(data.latest_bytes)}
            {data.latest_at ? ` · ${new Date(data.latest_at).toUTCString()}` : ""}
          </p>
          {data.failures.length > 0 ? (
            <p style={detailStyle}>
              Errors: {data.failures.map((f) => `${f.day} ${f.table}: ${f.error}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default AdminBackupBanner;
