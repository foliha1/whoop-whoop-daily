import { defineMcp } from "@lovable.dev/mcp-js";
import aboutTool from "./tools/about-whoop-whoop";
import listMatchingRulesTool from "./tools/list-matching-rules";
import listCardsTool from "./tools/list-cards";

export default defineMcp({
  name: "whoop-whoop-mcp",
  title: "Whoop! Whoop! MCP",
  version: "0.1.0",
  instructions:
    "Public read-only tools for the Whoop! Whoop! memory card game by Oleeha & Co. Use `about_whoop_whoop` for an overview, `list_matching_rules` for the six round rules, and `list_cards` for the full card catalog.",
  tools: [aboutTool, listMatchingRulesTool, listCardsTool],
});
