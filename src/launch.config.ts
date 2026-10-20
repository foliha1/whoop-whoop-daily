// ============================================================================
// THE ONE LAUNCH SWITCH for the umbrella change (Parts 1–3).
//
// launched: false — players see today's site. Nothing new is visible.
// launched: true  — Parts 1–3 appear together. This is the ONLY line that
//                   changes on launch day, followed by a publish.
//
// Signed-in admins (admin_allowlist) preview the ON version on the live site
// without any player or crawler seeing it. See src/lib/launch.ts.
// ============================================================================
export const LAUNCH_CONFIG = { launched: true } as const;
