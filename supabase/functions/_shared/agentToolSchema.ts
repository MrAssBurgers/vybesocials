/**
 * VYBE agent tool schema — shared by vybe-agent edge fn and client (keep in sync).
 * Client zod validation lives in src/lib/agent/agentToolSchema.ts
 */

export const AGENT_TOOL_NAME = "vybe_agent_act" as const;

export const AGENT_ACTION_TYPES = [
  "navigate",
  "apply_theme",
  "generate_theme",
  "widget_toggle",
  "widget_reorder",
] as const;

export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const THEME_PRESET_KEYS = [
  "classic",
  "midnight",
  "neon",
  "soft",
  "cyberpunk",
  "minimal",
] as const;

export const AGENT_NAV_PATHS = [
  "/home",
  "/messages",
  "/messages/new",
  "/messages/requests",
  "/notifications",
  "/search",
  "/settings",
  "/profile",
  "/upload",
  "/clips",
  "/explore",
  "/VYBE-AI",
  "/vybe-dna",
  "/brief",
  "/map",
  "/sounds",
  "/market",
  "/community",
  "/events",
  "/watch",
  "/leaderboard",
] as const;

/** OpenAI-compatible tool definition for vybe_agent_act */
export function buildVybeAgentActTool() {
  return {
    type: "function" as const,
    function: {
      name: AGENT_TOOL_NAME,
      description:
        "Reply to the user and optionally control their VYBE app (navigation, theme, home widgets). Use navigate for open/go/show requests.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Concise reply shown in chat (1-4 sentences unless listing steps)",
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [...AGENT_ACTION_TYPES],
                },
                path: {
                  type: "string",
                  description: "App path for navigate, e.g. /messages",
                },
                preset: {
                  type: "string",
                  enum: [...THEME_PRESET_KEYS],
                  description: "Theme preset for apply_theme",
                },
                prompt: {
                  type: "string",
                  description: "Natural language theme description for generate_theme",
                },
                widget_id: {
                  type: "string",
                  description: "Home widget id for widget_toggle",
                },
                visible: {
                  type: "boolean",
                  description: "Show (true) or hide (false) widget",
                },
                order: {
                  type: "array",
                  items: { type: "string" },
                  description: "Full widget id order for widget_reorder",
                },
              },
              required: ["type"],
            },
            description: "Zero or more app actions. Empty for pure chat.",
          },
        },
        required: ["message", "actions"],
      },
    },
  };
}

export interface ParsedAgentPlan {
  message: string;
  actions: Record<string, unknown>[];
}

/** Lenient parse of model tool output before client-side zod validation */
export function parseAgentPlan(raw: unknown): ParsedAgentPlan {
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!obj || typeof obj !== "object") {
    return { message: "Done!", actions: [] };
  }
  const message = typeof (obj as ParsedAgentPlan).message === "string"
    ? (obj as ParsedAgentPlan).message
    : "Done!";
  const actions = Array.isArray((obj as ParsedAgentPlan).actions)
    ? (obj as ParsedAgentPlan).actions.filter((a) => a && typeof a === "object")
    : [];
  return { message, actions };
}
