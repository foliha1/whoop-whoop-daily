import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "about_whoop_whoop",
  title: "About Whoop! Whoop!",
  description:
    "Return an overview of Whoop! Whoop! — a competitive memory card game by Oleeha & Co: how it plays, player count, and links.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const text = [
      "Whoop! Whoop! is a competitive memory card game by Oleeha & Co.",
      "Players: 2–6. Recommended age: 7+.",
      "Cards vary by shape (circle, square, triangle, star), number (1–4), and color (red, blue, yellow).",
      "Each round the dice pick a matching rule (e.g. same color, same shape, different number). Peek at face-down cards to memorize them, then shout Whoop! Whoop! to claim a matching pair. Wrong claims freeze those cards and cost you your next flip.",
      "Play online: https://whoop-whoop.lovable.app/",
    ].join("\n");
    return { content: [{ type: "text", text }] };
  },
});
