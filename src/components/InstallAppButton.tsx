import React, { useEffect, useState } from "react";
import { COLORS, FONT_FAMILY, buttonStyle } from "@/lib/tokens";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from "@/lib/installPrompt";

/** Quiet "Add to Home Screen" control for Settings. Hidden once installed. */
const InstallAppButton: React.FC = () => {
  const [, force] = useState(0);
  const [showIosHelp, setShowIosHelp] = useState(false);
  useEffect(() => subscribeInstall(() => force((n) => n + 1)), []);

  if (isStandalone()) return null;
  const native = canPromptInstall();
  const ios = isIos();
  if (!native && !ios) return null;

  return (
    <div data-testid="settings-install" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        aria-expanded={ios && !native ? showIosHelp : undefined}
        onClick={() => {
          if (native) void promptInstall();
          else setShowIosHelp((v) => !v);
        }}
        style={{ ...buttonStyle("quiet", "md", { fullWidth: true }), width: "100%" }}
      >
        Add to Home Screen
      </button>
      {showIosHelp && !native ? (
        <p role="status" style={{ margin: 0, fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 1.4, color: COLORS.ink, textAlign: "center" }}>
          Tap the Share button in your browser. Choose Add to Home Screen.
        </p>
      ) : null}
    </div>
  );
};

export default InstallAppButton;
