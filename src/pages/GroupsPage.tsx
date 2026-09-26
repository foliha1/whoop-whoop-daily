// ============================================================================
// GroupsPage — /groups. The list of your groups, and one group's boards.
//
// Identity is the Daily's own: the visitor id in local storage plus a display
// name. There is no sign-in, no magic link and no auth redirect — joining a
// group is the same friction as joining a Classic table. An email is offered
// once, as an optional way to carry a standing to another device, and an
// address the Daily already holds is reused silently instead of asked for.
//
// Scrolls: it is a list, so `DailyFrame` is used without `fill`. Boards are
// keyed to the local puzzle number from `getDailyNumber()`, never a date.
//
// `/groups?join=CODE` opens the join modal with the code prefilled. A bad code
// stays on the page with an inline error — a link never navigates you into a
// group that does not exist.
// ============================================================================

import React from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSubscriberStatus } from "@/hooks/useSubscriberStatus";
import { useMyGroups } from "@/hooks/useMyGroups";
import DailyGroupBoard from "@/components/DailyGroupBoard";
import { CreateGroupModal, JoinGroupModal } from "@/components/DailyGroupModals";
import DailyFrame from "@/components/DailyFrame";
import DailyLegalFooter from "@/components/DailyLegalFooter";
import MotionReveal from "@/components/MotionReveal";
import CardFlipLoader from "@/components/CardFlipLoader";
import { getDailyNumber } from "@/lib/daily";
import { getVisitorId } from "@/lib/visitor";

import {
  GROUP_MAX_PER_PERSON,
  formatStanding,
  getGroupEmail,
  linkGroupEmail,
  normalizeGroupCode,
  type MyGroup,
} from "@/lib/dailyGroups";
import {
  BORDER,
  COLORS,
  RADIUS,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const metaLabel = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("caption", mobile),
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: COLORS.inkMuted,
});

/** Optional, additive: an address so a standing follows you to a new device. */
const CarryOverEmail: React.FC<{ mobile: boolean; onLinked: (email: string) => void }> = ({
  mobile,
  onLinked,
}) => {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    const clean = value.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("That email does not look right.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await linkGroupEmail(getVisitorId(), clean);
      onLinked(clean);
    } catch {
      setError("That did not work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="groups-carry-over"
      style={{
        alignSelf: "stretch",
        boxSizing: "border-box",
        border: BORDER.heavy,
        borderRadius: RADIUS.sm,
        background: COLORS.panel,
        padding: SPACE[6],
        display: "flex",
        flexDirection: "column",
        gap: SPACE[4],
      }}
    >
      <p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
        Add your email so your standing follows you across devices. Optional — your
        groups work without it.
      </p>
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="you@example.com"
        data-testid="groups-carry-over-email"
        style={{
          ...textStyle("control", mobile),
          boxSizing: "border-box",
          width: "100%",
          minHeight: 44,
          padding: `0 ${SPACE[5]}px`,
          border: BORDER.heavy,
          borderRadius: RADIUS.sm,
          background: COLORS.surface,
          color: COLORS.ink,
        }}
      />
      {error && (
        <p
          role="alert"
          data-testid="groups-carry-over-error"
          style={{ ...textStyle("caption", mobile), color: COLORS.red, margin: 0 }}
        >
          {error}
        </p>
      )}
      <button
        type="button"
        className="ww-press"
        onClick={submit}
        disabled={busy}
        data-testid="groups-carry-over-submit"
        style={{ ...buttonStyle("secondary", "md", { mobile }), alignSelf: "stretch" }}
      >
        {busy ? "Saving…" : "Save My Email"}
      </button>
    </div>
  );
};

const GroupsPage: React.FC = () => {
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // Arrived from the results screen's "Groups" button: Back returns there,
  // and the Daily page reopens today's result directly.
  const backToResults =
    (location.state as { wwReturn?: string } | null)?.wwReturn === "results";
  const puzzleNumber = React.useMemo(() => getDailyNumber(), []);
  const { email: subscriberEmail } = useSubscriberStatus();
  const [linkedEmail, setLinkedEmail] = React.useState<string | null>(() => getGroupEmail());
  const knownEmail = subscriberEmail ?? linkedEmail;
  const { groups, loading, reload } = useMyGroups(puzzleNumber, knownEmail, 1);

  const joinParam = normalizeGroupCode(params.get("join") ?? "");

  const [showCreate, setShowCreate] = React.useState(false);
  const [showJoin, setShowJoin] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // A code in the link lands straight on the join confirmation.
  React.useEffect(() => {
    if (joinParam.length > 0) setShowJoin(true);
  }, [joinParam]);

  const open = groups.find((g) => g.group_id === openId) ?? null;
  const atGroupCap = groups.length >= GROUP_MAX_PER_PERSON;

  const clearJoinParam = () => {
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
      state={backToResults ? { wwOpenResult: true } : undefined}
      className="ww-press"
      style={{ ...buttonStyle("ink", "md", { mobile }), alignSelf: "flex-start" }}
    >
      <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
      Back
    </Link>
  );

  return (
    <DailyFrame gap={SPACE[6]}>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {open ? (
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
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: SPACE[6],
          }}
        >
          <MotionReveal index={0}>{backLink}</MotionReveal>

          <MotionReveal index={1}><h1 style={{ ...textStyle("title", mobile), color: COLORS.ink, margin: 0 }}>
            Your groups
          </h1></MotionReveal>
          <MotionReveal index={2}><p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
            Play the same daily puzzle as your people and see how you all did. Join with
            a code and a name — nothing else.
          </p></MotionReveal>

          {loading && <CardFlipLoader label="Loading Groups" />}

          {!loading && groups.length === 0 && (
            <p
              data-testid="groups-empty"
              style={{ ...textStyle("body", mobile), color: COLORS.inkMuted, margin: 0 }}
            >
              You are not in a group yet.
            </p>
          )}

          {!loading && groups.map((g: MyGroup, i) => (
            <MotionReveal kind="list" index={i} key={g.group_id} style={{ alignSelf: "stretch" }}><button
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
            </button></MotionReveal>
          ))}

          {!loading && <MotionReveal index={3} style={{ alignSelf: "stretch" }}><button
            type="button"
            className="ww-press"
            onClick={() => setShowCreate(true)}
            disabled={atGroupCap}
            data-testid="groups-create"
            style={{ ...buttonStyle("primary", "lg", { mobile, disabled: atGroupCap }), width: "100%" }}
          >
            Create a Group
          </button></MotionReveal>}
          {!loading && <MotionReveal index={4} style={{ alignSelf: "stretch" }}><button
            type="button"
            className="ww-press"
            onClick={() => setShowJoin(true)}
            disabled={atGroupCap}
            data-testid="groups-join"
            style={{ ...buttonStyle("secondary", "lg", { mobile, disabled: atGroupCap }), width: "100%" }}
          >
            Join with a Code
          </button></MotionReveal>}
          {!loading && atGroupCap && (
            <p style={{ ...metaLabel(mobile), margin: 0 }}>
              {GROUP_MAX_PER_PERSON} groups is the limit. Leave one to join another.
            </p>
          )}

          {/* Offered only to a member with no address on file, and only once. */}
          {!loading && groups.length > 0 && knownEmail === null && (
            <CarryOverEmail mobile={mobile} onLinked={(addr) => setLinkedEmail(addr)} />
          )}
          {!loading && groups.length > 0 && knownEmail !== null && (
            <p style={{ ...metaLabel(mobile), margin: 0 }}>
              Your standing follows {knownEmail} across devices.
            </p>
          )}
        </div>
      )}

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
          email={knownEmail}
          onClose={() => {
            setShowJoin(false);
            clearJoinParam();
          }}
          onJoined={afterJoin}
        />
      )}
    </DailyFrame>
  );
};

export default GroupsPage;
