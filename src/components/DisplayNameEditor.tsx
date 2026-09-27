import React from "react";
import { DISPLAY_NAME_ERROR, DISPLAY_NAME_MAX, sliceDisplayName } from "@/lib/displayName";
import { resolveDisplayName, saveDisplayName } from "@/lib/profile";
import { getDisplayName } from "@/lib/visitor";
import { BORDER, COLORS, RADIUS, SPACE, buttonStyle, textStyle } from "@/lib/tokens";

const DisplayNameEditor: React.FC<{ mobile: boolean }> = ({ mobile }) => {
  const [value, setValue] = React.useState(getDisplayName());
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    void resolveDisplayName().then((name) => { if (live && name) setValue(name); });
    return () => { live = false; };
  }, []);

  return (
    <form
      data-testid="display-name-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        void saveDisplayName(value)
          .then((name) => { setValue(name); setMessage("Name saved."); })
          .catch(() => setMessage(DISPLAY_NAME_ERROR));
      }}
      style={{ display: "flex", flexDirection: "column", gap: SPACE[3] }}
    >
      <label htmlFor="global-display-name" style={{ ...textStyle("label", mobile), color: COLORS.inkMuted }}>
        Your name
      </label>
      <div style={{ display: "flex", gap: SPACE[3] }}>
        <input
          id="global-display-name"
          value={value}
          maxLength={DISPLAY_NAME_MAX * 4}
          onChange={(event) => setValue(sliceDisplayName(event.target.value))}
          autoComplete="nickname"
          style={{
            ...textStyle("control", mobile), minWidth: 0, flex: 1, minHeight: 44,
            boxSizing: "border-box", border: BORDER.heavy, borderRadius: RADIUS.sm,
            background: COLORS.surface, color: COLORS.ink, padding: `0 ${SPACE[4]}px`,
          }}
        />
        <button type="submit" className="ww-press" style={buttonStyle("secondary", "md", { mobile })}>Save</button>
      </div>
      {message && <p role="status" style={{ ...textStyle("caption", mobile), color: message === DISPLAY_NAME_ERROR ? COLORS.red : COLORS.inkMuted, margin: 0 }}>{message}</p>}
    </form>
  );
};

export default DisplayNameEditor;