// ============================================================================
// DailyGroupModals — create and join, in the Daily's existing modal shell.
//
// The chrome here is `DailyEmailModal`'s, not a new dialog: portal to
// `document.body`, cream page inside the 24px gutter, khaki panel, shape rules
// dropped on short viewports, the shared `CloseButton`, and `useDismiss` for
// Escape + focus return. Only the panel's contents differ.
//
// Identity is the multiplayer `ww_display_name` and its 8-character cap — there
// is deliberately no second name field anywhere in the product.
// ============================================================================

import React from "react";
import { createPortal } from "react-dom";
import { usePortalHost } from "@/hooks/usePortalHost";
import DailyShapeRule from "@/components/DailyShapeRule";
import CloseButton from "@/components/CloseButton";
import { useDismiss } from "@/hooks/useDismiss";
import { getDisplayName, getVisitorId, setDisplayName, DISPLAY_NAME_MAX } from "@/lib/visitor";
import {
  GROUP_CODE_LENGTH,
  GROUP_NAME_MAX,
  createGroup,
  joinGroup,
  normalizeGroupCode,
} from "@/lib/dailyGroups";
import {
  BORDER,
  COLORS,
  FONT_FAMILY_UI,
  FONT_WEIGHT_UI,
  RADIUS,
  RAW,
  SPACE,
  buttonStyle,
  textStyle,
} from "@/lib/tokens";

/** Small metadata label: Geist, all caps, 0.05em — same as the stat tiles. */
const fieldLabelStyle = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("caption", mobile),
  fontFamily: FONT_FAMILY_UI,
  fontWeight: FONT_WEIGHT_UI,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: COLORS.ink,
});

const inputStyle = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("control", mobile),
  boxSizing: "border-box",
  width: "100%",
  minHeight: 44,
  padding: `0 ${SPACE[5]}px`,
  border: BORDER.heavy,
  borderRadius: RADIUS.sm,
  background: COLORS.surface,
  color: COLORS.ink,
});

/** The shared shell. Same box model as the email modal, contents injected. */
const GroupModalShell: React.FC<{
  ariaLabel: string;
  testId: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ ariaLabel, testId, onClose, children }) => {
  useDismiss(onClose, { escape: true, returnFocus: true });
  const short =
    typeof window !== "undefined" && window.innerHeight > 0 && window.innerHeight < 560;
  const gutter = short ? SPACE[6] : SPACE[12];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: COLORS.surface,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: gutter,
        padding: gutter,
        paddingBottom: `calc(${gutter}px + env(safe-area-inset-bottom))`,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      {!short && <DailyShapeRule />}
      <div
        style={{
          width: "100%",
          maxWidth: 402,
          flex: "0 0 auto",
          background: RAW.khaki,
          borderRadius: RADIUS.sm,
          boxSizing: "border-box",
          padding: `${SPACE[6]}px ${SPACE[8]}px ${SPACE[8]}px`,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[6],
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <CloseButton label="CLOSE" onClick={onClose} ariaLabel="Close" />
        </div>
        {children}
      </div>
      {!short && <DailyShapeRule />}
    </div>,
    host
  );
};

/** Name field, shown only when `ww_display_name` has not been set yet. */
const NameField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  mobile: boolean;
}> = ({ value, onChange, mobile }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}>
    <span style={fieldLabelStyle(mobile)}>Your name</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, DISPLAY_NAME_MAX))}
      maxLength={DISPLAY_NAME_MAX}
      placeholder="8 letters"
      data-testid="group-name-field"
      style={inputStyle(mobile)}
    />
  </label>
);

const errorStyle = (mobile: boolean): React.CSSProperties => ({
  ...textStyle("caption", mobile),
  color: COLORS.red,
  margin: 0,
});

export const CreateGroupModal: React.FC<{
  mobile: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}> = ({ mobile, onClose, onCreated }) => {
  const [name, setName] = React.useState("");
  const [who, setWho] = React.useState(getDisplayName());
  const needName = getDisplayName().length === 0;
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    const groupName = name.trim().slice(0, GROUP_NAME_MAX);
    if (groupName.length === 0) {
      setError("Give the group a name.");
      return;
    }
    const display = (needName ? who : getDisplayName()).trim();
    if (display.length === 0) {
      setError("Add a name so your group knows who you are.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setDisplayName(display);
      const row = await createGroup(groupName, getVisitorId(), display);
      if (!row) throw new Error("no-group");
      onCreated(row.group_id as string);
    } catch {
      setError("That did not work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GroupModalShell ariaLabel="Create a group" testId="group-create-modal" onClose={onClose}>
      <h2 style={{ ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0 }}>
        Create a group
      </h2>
      <p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
        You get a join code to share. Everyone who joins can see your daily result.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}>
        <span style={fieldLabelStyle(mobile)}>Group name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, GROUP_NAME_MAX))}
          maxLength={GROUP_NAME_MAX}
          placeholder="Sunday Crew"
          autoFocus
          data-testid="group-create-name"
          style={inputStyle(mobile)}
        />
      </label>
      {needName && <NameField value={who} onChange={setWho} mobile={mobile} />}
      {error && (
        <p role="alert" data-testid="group-create-error" style={errorStyle(mobile)}>
          {error}
        </p>
      )}
      <button
        type="button"
        className="ww-press"
        onClick={submit}
        disabled={busy}
        data-testid="group-create-submit"
        style={{ ...buttonStyle("primary", "lg", { mobile, disabled: busy }), alignSelf: "stretch" }}
      >
        {busy ? "CREATING…" : "CREATE GROUP"}
      </button>
    </GroupModalShell>
  );
};

export const JoinGroupModal: React.FC<{
  mobile: boolean;
  /** Prefilled from `/groups?join=CODE`. */
  initialCode?: string;
  onClose: () => void;
  onJoined: (groupId: string) => void;
}> = ({ mobile, initialCode = "", onClose, onJoined }) => {
  const [code, setCode] = React.useState(() => normalizeGroupCode(initialCode));
  const [who, setWho] = React.useState(getDisplayName());
  const needName = getDisplayName().length === 0;
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    const clean = normalizeGroupCode(code);
    if (clean.length !== GROUP_CODE_LENGTH) {
      setError("That code is not right. It is 6 characters.");
      return;
    }
    const display = (needName ? who : getDisplayName()).trim();
    if (display.length === 0) {
      setError("Add a name so your group knows who you are.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setDisplayName(display);
      const row = await joinGroup(clean, getVisitorId(), display, null);
      if (!row) throw new Error("no-group");
      onJoined(row.group_id as string);
    } catch {
      // Stays put: a bad or unknown code never navigates.
      setError("No group with that code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GroupModalShell ariaLabel="Join a group" testId="group-join-modal" onClose={onClose}>
      <h2 style={{ ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0 }}>
        Join a group
      </h2>
      {/* Said plainly, once, above the fields — not buried and not a checkbox. */}
      <p
        data-testid="group-join-visibility"
        style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}
      >
        Joining makes your daily result visible to everyone in this group.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}>
        <span style={fieldLabelStyle(mobile)}>Join code</span>
        <input
          value={code}
          onChange={(e) => setCode(normalizeGroupCode(e.target.value))}
          maxLength={GROUP_CODE_LENGTH}
          placeholder="abc234"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-testid="group-join-code"
          style={{ ...inputStyle(mobile), letterSpacing: "0.12em" }}
        />
      </label>
      {needName && <NameField value={who} onChange={setWho} mobile={mobile} />}
      {error && (
        <p role="alert" data-testid="group-join-error" style={errorStyle(mobile)}>
          {error}
        </p>
      )}
      <button
        type="button"
        className="ww-press"
        onClick={submit}
        disabled={busy}
        data-testid="group-join-submit"
        style={{ ...buttonStyle("primary", "lg", { mobile, disabled: busy }), alignSelf: "stretch" }}
      >
        {busy ? "JOINING…" : "JOIN GROUP"}
      </button>
    </GroupModalShell>
  );
};

/** Leave confirmation. Same shell; `danger` for the destructive action. */
export const LeaveGroupModal: React.FC<{
  mobile: boolean;
  groupName: string;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ mobile, groupName, onClose, onConfirm }) => (
  <GroupModalShell ariaLabel="Leave group" testId="group-leave-modal" onClose={onClose}>
    <h2 style={{ ...textStyle("subhead", mobile), color: COLORS.ink, margin: 0 }}>
      Leave {groupName}?
    </h2>
    <p style={{ ...textStyle("body", mobile), color: COLORS.ink, margin: 0 }}>
      Your results stop showing on this group's board. You can rejoin with the code.
    </p>
    <button
      type="button"
      className="ww-press"
      onClick={onConfirm}
      data-testid="group-leave-confirm"
      style={{ ...buttonStyle("danger", "lg", { mobile }), alignSelf: "stretch" }}
    >
      LEAVE GROUP
    </button>
    <button
      type="button"
      className="ww-press"
      onClick={onClose}
      style={{ ...buttonStyle("quiet", "lg", { mobile }), alignSelf: "stretch" }}
    >
      STAY
    </button>
  </GroupModalShell>
);
