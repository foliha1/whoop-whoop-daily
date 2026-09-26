import React from "react";
import { COLORS, BORDER, MOTION, SPACE, THEME_SWATCHES } from "@/lib/tokens";
import { useTheme } from "@/lib/theme-context";

const ThemeWindow: React.FC = () => {
  const { bgTheme, setTheme } = useTheme();

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      padding: SPACE[5],
      gap: SPACE[6],
      height: "100%",
      justifyContent: "center",
    }}>
      <div style={{ display: "flex", gap: SPACE[5], justifyContent: "center" }}>
        {THEME_SWATCHES.map(({ color, label }) => {
          const isActive = bgTheme === color;
          return (
            <button
              key={color}
              aria-label={label}
              onClick={() => setTheme(color)}
              className="ww-theme-swatch"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: color === "wild" ? "url(/Whoop_Whoop_Wild.png) center/cover no-repeat" : color,
                border: isActive ? BORDER.heavy : BORDER.standard,
                boxShadow: isActive ? `inset 0 0 0 3px ${COLORS.surface}` : "none",
                cursor: "pointer",
                transition: `transform ${MOTION.fast}`,
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            />
          );
        })}
      </div>

    </div>
  );
};

export default ThemeWindow;
