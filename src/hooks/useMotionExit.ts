import React from "react";
import { UI_EXIT_MS } from "@/lib/animationTiming";

/** Keeps a controlled surface mounted for the shared, faster exit beat. */
export function useMotionExit(onExited: () => void) {
  const [exiting, setExiting] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const callbackRef = React.useRef(onExited);
  callbackRef.current = onExited;

  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const requestExit = React.useCallback(() => {
    if (timerRef.current !== null) return;
    setExiting(true);
    timerRef.current = window.setTimeout(() => callbackRef.current(), UI_EXIT_MS);
  }, []);

  return { exiting, requestExit };
}

export default useMotionExit;