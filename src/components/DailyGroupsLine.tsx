// ============================================================================
// DailyGroupsLine — the results screen's single group line.
//
// One line, deliberately: the results screen had a spacing pass and a board
// here would undo it. With no groups it renders NOTHING — no prompt, no empty
// state — so the screen's height is unchanged for anyone without a group.
//
// Identity is the visitor id, the same as the rest of the Daily. There is no
// sign-in here and never was a nudge to create one.
// ============================================================================

import React from "react";
import { Link } from "react-router-dom";
import { bestStanding } from "@/lib/dailyGroups";
import { useMyGroups } from "@/hooks/useMyGroups";
import { COLORS, SPACE, textStyle } from "@/lib/tokens";

const DailyGroupsLine: React.FC<{
  puzzleNumber: number;
  /** Optional: lets a member who switched devices resolve to one membership. */
  email?: string | null;
  mobile: boolean;
}> = ({ puzzleNumber, email = null, mobile }) => {
  const { groups, loading } = useMyGroups(puzzleNumber, email, 1);
  const best = bestStanding(groups);
  // A non-member renders nothing at all, so the results screen's height never
  // changes for the players who are not in a group.
  if (loading || best === null) return null;

  return (
    <Link
      to="/groups"
      data-testid="results-groups-line"
      style={{
        ...textStyle("caption", mobile),
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: COLORS.blue,
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        minHeight: 44,
        gap: SPACE[2],
      }}
    >
      {`Your groups → ${best.standing} in ${best.group.name}`}
    </Link>
  );
};

export default DailyGroupsLine;
