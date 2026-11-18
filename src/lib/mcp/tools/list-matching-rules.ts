import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "list_matching_rules",
  title: "List matching rules",
  description:
    "List the six matching rules used in Whoop! Whoop! Each roll of the dice selects one of these rules for the round.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const rules = [
      { id: "same-shape", label: "Same shape", description: "Both cards share the same shape." },
      { id: "same-number", label: "Same number", description: "Both cards show the same number of icons." },
      { id: "same-color", label: "Same color", description: "Both cards share the same color." },
      { id: "different-shape", label: "Different shape", description: "The two cards must have different shapes." },
      { id: "different-number", label: "Different number", description: "The two cards must show different numbers." },
      { id: "different-color", label: "Different color", description: "The two cards must be different colors." },
    ];
    const text = rules.map((r) => `• ${r.label} — ${r.description}`).join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { rules },
    };
  },
});
