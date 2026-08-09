/**
 * Skill system types.
 *
 * A skill bundles declarative metadata (usually parsed from a SKILL.md file),
 * a set of executable tools, and freeform instructions injected into the
 * system prompt when the skill is enabled.
 */

/**
 * Declarative metadata for a skill, used in the system prompt and UI lists.
 */
export interface SkillMetadata {
  /** Skill name, e.g. `calendar`. */
  name: string;
  /** One-line description of what the skill does. */
  description: string;
  /** Semantic version of the skill. */
  version: string;
  /** Keywords used for discovery/search. */
  keywords: string[];
  /** Phrases that should activate the skill (system prompt routing hints). */
  triggers: string[];
  /** Path to the SKILL.md file for full instructions (when loaded from disk). */
  skillMdPath?: string;
}

/**
 * A single JSON-Schema-style parameter property of a tool.
 */
export interface ToolParameter {
  /** JSON Schema type name, e.g. `string`, `number`, `boolean`. */
  type: string;
  /** Plain-language description of the parameter. */
  description?: string;
  /** Allowed values when the parameter is an enum. */
  enum?: string[];
}

/**
 * Declarative tool definition offered to the model for calling.
 *
 * `requiresConfirmation` controls whether the app must ask the user before
 * executing this tool. Per the skill contract, an *undefined* flag means the
 * tool requires user confirmation — only tools explicitly marked safe opt out.
 */
export interface ToolDefinition {
  /** Fully-qualified tool name, e.g. `calendar.list`. */
  name: string;
  /** Plain-language description of what the tool does. */
  description: string;
  /** JSON-Schema-style parameter declaration. */
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  /** If undefined, the tool requires user confirmation before execution. */
  requiresConfirmation?: boolean;
}

/**
 * An executable tool implementation, typically defined in a skill's
 * `skill.ts` module.
 */
export interface Tool {
  /** The declarative definition shown to the model. */
  definition: ToolDefinition;
  /** Executes the tool with the model-provided arguments. */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  /** If undefined, the tool requires user confirmation before execution. */
  requiresConfirmation?: boolean;
}

/**
 * A fully registered skill: metadata + tools + system-prompt instructions.
 */
export interface Skill {
  /** Skill metadata, usually parsed from SKILL.md. */
  metadata: SkillMetadata;
  /** Tools keyed by their definition name. */
  tools: Record<string, Tool>;
  /** Full SKILL.md instructions for system prompt injection. */
  instructions: string;
}

/**
 * A tool invocation produced by the model (or a test harness).
 *
 * `skillName` identifies which registered skill owns the tool — used for
 * attribution and permission routing in the app layer.
 */
export interface ToolCall {
  /** Unique id for this invocation. */
  id: string;
  /** Tool name, e.g. `calendar.list`. */
  name: string;
  /** Arguments extracted from the model output. */
  arguments: Record<string, unknown>;
  /** Name of the skill that owns the tool. */
  skillName: string;
}

/**
 * The outcome of executing a {@link ToolCall} through a {@link SkillRegistry}.
 */
export interface ToolResult {
  /** The id of the call this result answers. */
  toolCallId: string;
  /** Whatever the tool returned (unreliable when `error` is set). */
  result: unknown;
  /** Set when the tool failed; `result` is then unreliable. */
  error?: string;
  /** Wall-clock execution time of the tool, in milliseconds. */
  durationMs: number;
}
