import React from "react";
import { COLORS, BORDER, RADIUS, FONT_FAMILY, MOTION, TEXT } from "@/lib/tokens";

export type ButtonVariant = "primary" | "secondary" | "pill";
export type ButtonTone = "ink" | "red" | "blue" | "orange" | "neutral" | "muted" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface AppButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  active?: boolean;
  fullWidth?: boolean;
  /** Optional hover surface for controls placed on a custom panel. */
  hoverBackground?: string;
  style?: React.CSSProperties;
}

const TONE_MAP: Record<ButtonTone, { bg: string; hoverBg: string; fg: string }> = {
  ink:     { bg: COLORS.ink,        hoverBg: COLORS.inkMuted,         fg: COLORS.surface },
  red:     { bg: COLORS.red,        hoverBg: COLORS.redHover,         fg: COLORS.surface },
  blue:    { bg: COLORS.blue,       hoverBg: COLORS.blueHover,        fg: COLORS.surface },
  orange:  { bg: COLORS.orange,     hoverBg: COLORS.orangeHover,      fg: COLORS.ink },
  neutral: { bg: COLORS.surface,    hoverBg: COLORS.panelMutedHover,  fg: COLORS.ink },
  muted:   { bg: COLORS.panelMuted, hoverBg: COLORS.panelMutedHover,  fg: COLORS.ink },
  success: { bg: COLORS.success,    hoverBg: COLORS.successHover,     fg: COLORS.ink },
};

const SIZE_MAP: Record<ButtonSize, { fontSize: number; padding: string }> = {
  sm: { fontSize: TEXT.caption.size, padding: "6px 12px" },
  md: { fontSize: TEXT.subhead.size, padding: "10px 20px" },
  lg: { fontSize: TEXT.heading.size, padding: "12px 24px" },
};

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = "primary", tone = "ink", size = "md", active = false, fullWidth = false, disabled, hoverBackground, style, onMouseEnter, onMouseLeave, ...rest }, ref) => {
    const [focusVisible, setFocusVisible] = React.useState(false);
    const toneColors = TONE_MAP[tone];
    const sizing = SIZE_MAP[size];
    const isPill = variant === "pill";
    const isSecondary = variant === "secondary";

    const baseBg = isSecondary ? COLORS.surface : toneColors.bg;
    const baseFg = isSecondary ? COLORS.ink : toneColors.fg;
    const hoverBg = isSecondary ? COLORS.panelMutedHover : toneColors.hoverBg;

    const mergedStyle: React.CSSProperties = {
      fontFamily: FONT_FAMILY,
      fontStyle: "italic",
      fontSize: sizing.fontSize,
      padding: sizing.padding,
      borderRadius: isPill ? 999 : RADIUS.md,
      border: BORDER.standard,
      background: active ? hoverBg : baseBg,
      color: baseFg,
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.4 : 1,
      transition: `background ${MOTION.fast}`,
      whiteSpace: "nowrap",
      textAlign: "center",
      width: fullWidth ? "100%" : undefined,
      outline: focusVisible ? `2px solid ${COLORS.blue}` : "none",
      outlineOffset: 2,
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        style={mergedStyle}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setFocusVisible(true);
        }}
        onBlur={() => setFocusVisible(false)}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = hoverBackground ?? hoverBg;
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = active ? hoverBg : (style?.background ?? baseBg);
          onMouseLeave?.(e);
        }}
        {...rest}
      />
    );
  }
);
AppButton.displayName = "AppButton";
