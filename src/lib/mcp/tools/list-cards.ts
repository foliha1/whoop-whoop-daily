import { defineTool } from "@lovable.dev/mcp-js";

const SHAPES = ["circle", "square", "tri", "star"] as const;
const NUMBERS = [1, 2, 3, 4] as const;
const COLORS = ["red", "blue", "yellow"] as const;

export default defineTool({
  name: "list_cards",
  title: "List cards",
  description:
    "List every card in the Whoop! Whoop! deck. Each card has a shape, number, and color; the deck is the full cartesian product (48 cards).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const cards: { id: string; shape: string; number: number; color: string }[] = [];
    for (const shape of SHAPES) {
      for (const number of NUMBERS) {
        for (const color of COLORS) {
          cards.push({ id: `${shape}-${number}-${color}`, shape, number, color });
        }
      }
    }
    return {
      content: [{ type: "text", text: `${cards.length} cards in the deck (4 shapes × 4 numbers × 3 colors).` }],
      structuredContent: { count: cards.length, cards },
    };
  },
});
