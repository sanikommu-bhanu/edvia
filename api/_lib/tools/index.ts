// ==========================================================================
// Tool catalogue
// --------------------------------------------------------------------------
// One list, one lookup map, and a Gemini function-declaration set derived
// from each tool's own Zod schema (see zodToGemini.ts) — so what the model
// is told a tool accepts and what the validator will accept can never
// disagree.
// ==========================================================================
import { READ_TOOLS } from "./readTools";
import { ACTION_TOOLS } from "./actionTools";
import { getSchoolPolicy } from "./policyTools";
import { zodToGeminiSchema } from "./zodToGemini";
import type { ToolDefinition } from "./registry";
import type { FunctionDeclaration } from "@google/genai";

export const ALL_TOOLS: ToolDefinition<never, unknown>[] = [
  ...READ_TOOLS,
  getSchoolPolicy as unknown as ToolDefinition<never, unknown>,
  ...ACTION_TOOLS,
];

export const TOOL_BY_NAME: Record<string, ToolDefinition<never, unknown>> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.name, t])
);

// Built eagerly at module load: an unsupported schema throws here, on the
// first cold start, rather than mid-conversation.
export const GEMINI_TOOL_DECLARATIONS: FunctionDeclaration[] = ALL_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: zodToGeminiSchema(tool.inputSchema, tool.name),
}));

export type { ToolDefinition } from "./registry";
