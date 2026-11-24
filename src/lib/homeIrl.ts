// ============================================================================
// Home "IRL" entry: a third compact play-style tile that opens /preorder.
//
// The compact tile is now the permanent Home treatment for every player.
// The stage helper remains so existing callers and saved test seams stay stable.
// ============================================================================

export type HomeIrlStage = "banner" | "tile";

export function homeIrlStage(_now: Date = new Date()): HomeIrlStage {
  return "tile";
}

export function showHomeIrl(stage: HomeIrlStage, subscribed: boolean): boolean {
  return stage === "tile" || subscribed;
}
