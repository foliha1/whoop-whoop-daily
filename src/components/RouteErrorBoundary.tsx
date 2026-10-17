import React from "react";
import { COLORS } from "@/lib/tokens";

interface Props { children: React.ReactNode; resetKey?: string }
interface State { error: Error | null }

/**
 * Catches a page that fails to load or render so the player sees a way out
 * instead of a blank screen. Resets when the route changes.
 */
export default class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[route] page failed", error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "var(--ww-vh)",
          background: COLORS.surface,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: 18 }}>This page didn't load.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ minHeight: 44, padding: "0 20px", borderRadius: 999, fontSize: 16, cursor: "pointer" }}
        >
          Try again
        </button>
        <a href="/" style={{ fontSize: 14 }}>Go home</a>
      </div>
    );
  }
}
