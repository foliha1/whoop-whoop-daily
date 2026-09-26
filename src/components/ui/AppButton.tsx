import React from "react";
import { COLORS, RADIUS, TEXT, buttonHoverBg, buttonStyle, type ButtonVariant as CanonicalButtonVariant } from "@/lib/tokens";

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
  roleStyle?: "primary" | "secondary" | "accent" | "utility" | "quiet" | "destructive" | "destructive-confirm";
  style?: React.CSSProperties;
}

const SIZE_MAP: Record<ButtonSize, { fontSize: number; padding: string }> = {
  sm: { fontSize: TEXT.caption.size, padding: "6px 12px" },
  md: { fontSize: TEXT.subhead.size, padding: "10px 20px" },
  lg: { fontSize: TEXT.heading.size, padding: "12px 24px" },
};

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = "primary", tone = "ink", size = "md", active = false, fullWidth = false, disabled, hoverBackground, roleStyle, style, onMouseEnter, onMouseLeave, ...rest }, ref) => {
    const [focusVisible, setFocusVisible] = React.useState(false);
    const sizing = SIZE_MAP[size];
    const isPill = variant === "pill";
    const canonical: CanonicalButtonVariant = roleStyle === "primary" ? "primary"
      : roleStyle === "secondary" ? "secondary"
      : roleStyle === "accent" ? "accent"
      : roleStyle === "utility" ? "ink"
      : roleStyle === "destructive" ? "danger"
      : roleStyle === "destructive-confirm" ? "dangerConfirm"
      : roleStyle === "quiet" ? "quiet"
      : variant === "secondary" ? "quiet"
      : tone === "red" ? "primary"
      : tone === "blue" ? "secondary"
      : tone === "orange" || tone === "success" ? "accent"
      : tone === "ink" ? "ink" : "quiet";
    const canonicalStyle = buttonStyle(canonical, size, { fullWidth, disabled, selected: active });
    const baseBg = canonicalStyle.background as string;
    const inverseSelected = active && (canonical === "quiet" || canonical === "neutral" || canonical === "ghost");
    const hoverBg = hoverBackground ?? (inverseSelected ? COLORS.inkMuted : buttonHoverBg(canonical));

    const mergedStyle: React.CSSProperties = {
      ...canonicalStyle,
      fontSize: sizing.fontSize,
      padding: sizing.padding,
      borderRadius: isPill ? 999 : RADIUS.md,
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
          if (!disabled) e.currentTarget.style.background = hoverBg;
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = active ? hoverBg : (typeof style?.background === "string" ? style.background : baseBg);
          onMouseLeave?.(e);
        }}
        {...rest}
      />
    );
  }
);
AppButton.displayName = "AppButton";
