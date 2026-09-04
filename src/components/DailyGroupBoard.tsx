// ============================================================================
// DailyGroupBoard — one group's two boards.
//
// TODAY is keyed to the puzzle number, never a date: the seed rolls at each
// player's local midnight, so a member abroad can be a puzzle ahead. Ranking is
// rounds solved then misses, the same rule the SQL applies — `elapsed_ms` is
// hidden from players and is never ranked on.
//
// Rows reuse the results-screen stat-tile look (BORDER.heavy, RADIUS.sm,
// COLORS.panel). Your own row is emphasised with the brand blue stroke already
// used for the recall container; no new highlight colour is invented.
// ============================================================================

import React from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { hapticTap } from "@/lib/haptics";
import { getVisitorId } from "@/lib/visitor";
import {
  fetchGroupSeason,
  fetchGroupToday,
  groupJoinUrl,
  leaveGroup,
  seasonWeekLabel,
  type GroupSeasonRow,
  type GroupTodayRow,
  type MyGroup,
} from "@/lib/dailyGroups";
import { LeaveGroupModal } from "@/components/DailyGroupModals";
import {
  BORDER,
  COLORS,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  RADIUS,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

type Tab = "today" | "season";

/** Geist metadata label: all caps, 0.05em, matching the stat-tile labels. */
const metaLabel = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("caption", mobile),
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: COLORS.inkMuted,
});

const rowText = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("control", mobile),
  color: COLORS.ink,
  whiteSpace: "nowrap",
});

/** One board row. `me` emphasises, `quiet` is the not-played state. */
const BoardRow: React.FC<{
  position: string;
  name: string;
  right: React.ReactNode;
  me: boolean;
  quiet?: boolean;
  mobile: boolean;
  testId?: string;
}> = ({ position, name, right, me, quiet = false, mobile, testId }) => (
  <div
    data-testid={testId}
    data-me={me ? "1" : undefined}
    data-quiet={quiet ? "1" : undefined}
    style={{
      display: "grid",
      gridTemplateColumns: "auto minmax(0, 1fr) auto",
      alignItems: "center",
      columnGap: SPACE[4],
      boxSizing: "border-box",
      minHeight: 44,
      border: me ? `2px solid ${COLORS.blue}` : BORDER.heavy,
      borderRadius: RADIUS.sm,
      background: COLORS.panel,
      padding: `${SPACE[4]}px ${SPACE[5]}px`,
      opacity: quiet ? 0.72 : 1,
    }}
  >
    <span style={{ ...rowText(mobile), color: quiet ? COLORS.inkMuted : COLORS.ink }}>
      {position}
    </span>
    <span
      style={{
        ...rowText(mobile),
        color: quiet ? COLORS.inkMuted : COLORS.ink,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </span>
    <span
      style={{
        ...metaLabel(mobile),
        color: quiet ? COLORS.inkMuted : COLORS.ink,
        textAlign: "right",
      }}
    >
      {right}
    </span>
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
  mobile: boolean;
}> = ({ active, label, onClick, mobile }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className="ww-press"
    style={{
      ...buttonStyle(active ? "secondary" : "quiet", "md", { mobile }),
      flex: "1 1 0",
      minWidth: 0,
    }}
  >
    {label}
  </button>
);

const DailyGroupBoard: React.FC<{
  group: MyGroup;
  puzzleNumber: number;
  mobile: boolean;
  onBack: () => void;
  /** Called after a successful leave so the list can re-read. */
  onLeft: () => void;
}> = ({ group, puzzleNumber, mobile, onBack, onLeft }) => {
  const [tab, setTab] = React.useState<Tab>("today");
  const [today, setToday] = React.useState<GroupTodayRow[] | null>(null);
  const [season, setSeason] = React.useState<GroupSeasonRow[] | null>(null);
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void fetchGroupToday(group.group_id, puzzleNumber, getVisitorId())
      .then((rows) => live && setToday(rows))
      .catch(() => live && setToday([]));
    void fetchGroupSeason(group.group_id, puzzleNumber, getVisitorId())
      .then((rows) => live && setSeason(rows))
      .catch(() => live && setSeason([]));
    return () => {
      live = false;
    };
  }, [group.group_id, puzzleNumber]);

  const copyCode = async () => {
    hapticTap();
    try {
      await navigator.clipboard.writeText(group.code);
      toast({ title: "Join code copied" });
    } catch {
      toast({ title: "Copy the code", description: group.code });
    }
  };

  const shareLink = async () => {
    hapticTap();
    const url = groupJoinUrl(group.code);
    const text = `Join my Whoop! Whoop! group, ${group.name}.`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text, url });
        return;
      }
      throw new Error("no-web-share");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Invite link copied" });
      } catch {
        toast({ title: "Copy the link", description: url });
      }
    }
  };

  const doLeave = async () => {
    try {
      await leaveGroup(group.group_id, getVisitorId());
    } catch {
      /* the list re-reads either way */
    }
    setConfirmLeave(false);
    onLeft();
  };

  // Not-played rows sort last; played rows keep the server's ranking order.
  const todayRows = React.useMemo(() => {
    const rows = today ?? [];
    return [...rows].sort((a, b) => {
      if (a.not_played !== b.not_played) return a.not_played ? 1 : -1;
      return (a.rank_position ?? 99) - (b.rank_position ?? 99);
    });
  }, [today]);

  const seasonLabel = season && season.length > 0 ? seasonWeekLabel(season[0].season_start) : "";

  return (
    <div
      style={{
        width: "100%",
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        gap: SPACE[6],
      }}
    >
      <button
        type="button"
        className="ww-press"
        onClick={onBack}
        data-testid="group-back"
        style={{ ...buttonStyle("ink", "md", { mobile }), alignSelf: "flex-start" }}
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        BACK
      </button>

      <h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>{group.name}</h1>
      <p style={{ ...metaLabel(mobile), margin: 0 }}>
        {group.member_count} {group.member_count === 1 ? "member" : "members"}
      </p>

      <div role="tablist" aria-label="Board" style={{ display: "flex", gap: SPACE[4] }}>
        <TabButton active={tab === "today"} label="TODAY" onClick={() => setTab("today")} mobile={mobile} />
        <TabButton active={tab === "season"} label="SEASON" onClick={() => setTab("season")} mobile={mobile} />
      </div>

      {tab === "today" ? (
        <div
          data-testid="group-today-board"
          style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}
        >
          {today === null && <p style={{ ...metaLabel(mobile), margin: 0 }}>Loading…</p>}
          {todayRows.map((r) => (
            <BoardRow
              key={r.visitor_id}
              testId="group-today-row"
              position={r.not_played ? "–" : `${r.rank_position ?? "–"}`}
              name={r.display_name}
              right={
                r.not_played ? (
                  "not played yet"
                ) : (
                  <>
                    {/* Peek marker, same 👀 the share image uses. Never ranks. */}
                    {r.peek_used && (
                      <span aria-label="Peek used" title="Peek used" style={{ marginRight: SPACE[2] }}>
                        👀
                      </span>
                    )}
                    {r.rounds_solved}/3 · {r.total_misses}{" "}
                    {r.total_misses === 1 ? "miss" : "misses"}
                  </>
                )
              }
              me={r.is_me}
              quiet={r.not_played}
              mobile={mobile}
            />
          ))}
        </div>
      ) : (
        <div
          data-testid="group-season-board"
          style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}
        >
          {season === null && <p style={{ ...metaLabel(mobile), margin: 0 }}>Loading…</p>}
          {seasonLabel && <p style={{ ...metaLabel(mobile), margin: 0 }}>{seasonLabel}</p>}
          <p style={{ ...textStyle("caption", mobile), color: COLORS.inkMuted, margin: 0 }}>
            Points are 3 for 1st, 2 for 2nd, 1 for 3rd.
          </p>
          {(season ?? []).map((r) => (
            <BoardRow
              key={r.visitor_id}
              testId="group-season-row"
              position={`${r.rank_position}`}
              name={r.display_name}
              right={
                <>
                  {r.points} {r.points === 1 ? "pt" : "pts"} · {r.puzzles_played} played
                </>
              }
              me={r.is_me}
              mobile={mobile}
            />
          ))}
        </div>
      )}

      {/* Join code, share, leave. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: SPACE[4],
          marginTop: SPACE[8],
          paddingTop: SPACE[6],
          borderTop: BORDER.heavy,
        }}
      >
        <p style={{ ...metaLabel(mobile), margin: 0 }}>Join code</p>
        <button
          type="button"
          className="ww-press"
          onClick={copyCode}
          aria-label={`Copy join code ${group.code}`}
          data-testid="group-copy-code"
          style={{ ...buttonStyle("neutral", "lg", { mobile }), alignSelf: "stretch", letterSpacing: "0.12em" }}
        >
          {group.code.toUpperCase()}
        </button>
        <button
          type="button"
          className="ww-press"
          onClick={shareLink}
          data-testid="group-share-link"
          style={{ ...buttonStyle("secondary", "lg", { mobile }), alignSelf: "stretch" }}
        >
          INVITE TO GROUP
        </button>
        <button
          type="button"
          className="ww-press"
          onClick={() => setConfirmLeave(true)}
          data-testid="group-leave"
          style={{ ...buttonStyle("danger", "lg", { mobile }), alignSelf: "stretch" }}
        >
          LEAVE GROUP
        </button>
      </div>

      {confirmLeave && (
        <LeaveGroupModal
          mobile={mobile}
          groupName={group.name}
          onClose={() => setConfirmLeave(false)}
          onConfirm={doLeave}
        />
      )}
    </div>
  );
};

export default DailyGroupBoard;
