// ============================================================================
// usePortalHost — a stable, per-instance host node for body-level portals.
//
// Portalling straight into `document.body` makes React the owner of nodes that
// sit next to nodes other code owns (confetti canvases, lottie hosts, injected
// scripts, extension nodes). When any of those shuffle body's children, React's
// deletion pass can no longer find its node and throws
// "Failed to execute 'removeChild' on 'Node'" — which blanks the screen.
//
// Each portal instead gets its own <div> child of body. React only ever removes
// nodes inside that div, and the div itself is removed by us, after React has
// finished unmounting its children.
// ============================================================================

import { useEffect, useState } from "react";

export function usePortalHost(name = "portal"): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-portal", name);
    document.body.appendChild(el);
    setHost(el);
    return () => {
      // React has already unmounted the portal children at this point.
      el.remove();
      setHost(null);
    };
  }, [name]);

  return host;
}

export default usePortalHost;
