// ============================================================================
// GroupsPage — /groups. The list of your groups, and one group's boards.
//
// Scrolls: it is a list, so it opts out of the Daily's scroll lock the way
// SupportPage does. Boards are keyed to the local puzzle number from
// `getDailyNumber()`, never a date.
//
// `/groups?join=CODE` opens the join modal with the code prefilled. A bad code
// stays on the page with an inline error — a link never navigates you into a
// group that does not exist.
// ============================================================================

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSubscriberStatus } from "@/hooks/useSubscriberStatus";
import { useMyGroups } from "@/hooks/useMyGroups";
import {
  clearPendingJoin,
  readPendingJoin,
  useGroupAuth,
  writePendingJoin,
} from "@/hooks/useGroupAuth";
import DailyGroupBoard from "@/components/DailyGroupBoard";
import DailyGroupSignIn from "@/components/DailyGroupSignIn";
import { CreateGroupModal, JoinGroupModal } from "@/components/DailyGroupModals";
import DailyShapeRule from "@/components/DailyShapeRule";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import { getDailyNumber } from "@/lib/daily";

import {
  GROUP_MAX_PER_PERSON,
  formatStanding,
  normalizeGroupCode,
  type MyGroup,
} from "@/lib/dailyGroups";
import {
import BrandLoader from "@/components/BrandLoader";
  BORDER,
  COLORS,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  RADIUS,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

const metaLabel = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("caption", mobile),
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: COLORS.inkMuted,
});

const GroupsPage: React.FC = () => {
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const puzzleNumber = React.useMemo(() => getDailyNumber(), []);
  const { email } = useSubscriberStatus();
  const { session, ready, email: authEmail, sendLink, signOut } = useGroupAuth();
  const signedIn = session !== null;
  const { groups, loading, reload } = useMyGroups(
    signedIn ? puzzleNumber : null,
    signedIn ? authEmail ?? email ?? null : null,
    signedIn ? 1 : 0
  );

  // The code can arrive in the URL, or from before a magic-link round trip.
  const urlJoin = normalizeGroupCode(params.get("join") ?? "");
  const [storedJoin] = React.useState(() => readPendingJoin());
  const joinParam = urlJoin || storedJoin;

  const [showCreate, setShowCreate] = React.useState(false);
  const [showJoin, setShowJoin] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Signed out with a code in hand: hold it across the email round trip.
  React.useEffect(() => {
    if (urlJoin) writePendingJoin(urlJoin);
  }, [urlJoin]);

  // Signed in with a code waiting: land on the join confirmation.
  React.useEffect(() => {
    if (signedIn && joinParam.length > 0) setShowJoin(true);
  }, [signedIn, joinParam]);

  const open = groups.find((g) => g.group_id === openId) ?? null;
  const atGroupCap = groups.length >= GROUP_MAX_PER_PERSON;

  const clearJoinParam = () => {
    clearPendingJoin();
    if (!params.get("join")) return;
    const next = new URLSearchParams(params);
    next.delete("join");
    setParams(next, { replace: true });
  };

  const afterJoin = (groupId: string) => {
    setShowJoin(false);
    clearJoinParam();
    reload();
    setOpenId(groupId);
  };

  const backLink = (
    <Link
      to="/"
      className="ww-press"
      style={{ ...buttonStyle("ink", "md", { mobile }), alignSelf: "flex-start" }}
    >
      <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      BACK
    </Link>
  );

  const redirectTo = `${window.location.origin}/groups${
    joinParam ? `?join=${joinParam}` : ""
  }`;


  return (
    <div
      style={{
        minHeight: "var(--ww-vh)",
        boxSizing: "border-box",
        background: COLORS.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: SPACE[10],
        padding: SPACE[12],
        paddingBottom: `calc(${SPACE[12]}px + env(safe-area-inset-bottom))`,
      }}
    >
      <DailyShapeRule />

      <div style={{ width: "100%", maxWidth: 402, display: "flex", flexDirection: "column", gap: SPACE[6] }}>
        {!ready ? null : !signedIn ? (
          <>
            {backLink}
            <DailyGroupSignIn
              mobile={mobile}
              pendingJoin={joinParam.length > 0}
              onSend={(addr) => sendLink(addr, redirectTo)}
            />
          </>
        ) : open ? (
          <DailyGroupBoard
            group={open}
            puzzleNumber={puzzleNumber}
            mobile={mobile}
            onBack={() => setOpenId(null)}
            onLeft={() => {
              setOpenId(null);
              reload();
            }}
          />
        ) : (
          <>
            {backLink}


            <h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>
              Your groups
            </h1>
            <p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
              Play the same daily puzzle as your people and see how you all did.
            </p>

            {loading && <BrandLoader size={16} />}

            {!loading && groups.length === 0 && (
              <p data-testid="groups-empty" style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, margin: 0 }}>
                You are not in a group yet.
              </p>
            )}

            {groups.map((g: MyGroup) => (
              <button
                key={g.group_id}
                type="button"
                className="ww-press"
                onClick={() => setOpenId(g.group_id)}
                data-testid="groups-list-item"
                style={{
                  boxSizing: "border-box",
                  width: "100%",
                  minHeight: 44,
                  textAlign: "left",
                  border: BORDER.heavy,
                  borderRadius: RADIUS.sm,
                  background: COLORS.panel,
                  padding: `${SPACE[5]}px ${SPACE[6]}px`,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACE[2],
                }}
              >
                <span style={{ ...textStyle("control", mobile), color: COLORS.ink }}>{g.name}</span>
                <span style={metaLabel(mobile)}>
                  {formatStanding(g)} · {g.member_count}{" "}
                  {g.member_count === 1 ? "member" : "members"}
                </span>
              </button>
            ))}

            <button
              type="button"
              className="ww-press"
              onClick={() => setShowCreate(true)}
              disabled={atGroupCap}
              data-testid="groups-create"
              style={{ ...buttonStyle("primary", "lg", { mobile, disabled: atGroupCap }), alignSelf: "stretch" }}
            >
              CREATE A GROUP
            </button>
            <button
              type="button"
              className="ww-press"
              onClick={() => setShowJoin(true)}
              disabled={atGroupCap}
              data-testid="groups-join"
              style={{ ...buttonStyle("secondary", "lg", { mobile, disabled: atGroupCap }), alignSelf: "stretch" }}
            >
              JOIN WITH A CODE
            </button>
            {atGroupCap && (
              <p style={{ ...metaLabel(mobile), margin: 0 }}>
                {GROUP_MAX_PER_PERSON} groups is the limit. Leave one to join another.
              </p>
            )}

            {/* Signing out lives here only. The lobby's `Not you?` is untouched. */}
            <p style={{ ...metaLabel(mobile), margin: 0 }}>Signed in as {authEmail}</p>
            <button
              type="button"
              className="ww-press"
              onClick={signOut}
              data-testid="groups-signout"
              style={{ ...buttonStyle("quiet", "md", { mobile }), alignSelf: "flex-start" }}
            >
              SIGN OUT
            </button>
          </>
        )}

      </div>

      <DailyLegalFooter />

      {showCreate && (
        <CreateGroupModal
          mobile={mobile}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            reload();
            setOpenId(id);
          }}
        />
      )}
      {showJoin && (
        <JoinGroupModal
          mobile={mobile}
          initialCode={joinParam}
          onClose={() => {
            setShowJoin(false);
            clearJoinParam();
          }}
          onJoined={afterJoin}
        />
      )}
    </div>
  );
};

export default GroupsPage;
