import type { Skill, SkillMetadata, Tool, ToolCall, ToolResult } from './types';

/**
 * Registry of registered skills.
 *
 * Skills are registered by name (registering a skill with the same name as an
 * existing one overwrites it). The registry provides:
 *
 * - metadata listing for system-prompt construction (`listMetadata`),
 * - flattened tool definitions for the model (`getToolsForSkills`),
 * - timed, error-bounded tool execution (`execute`),
 * - a confirmation gate (`requiresConfirmation`) used by the app layer
 *   before executing sensitive tools.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  /**
   * Register a skill. Overwrites any existing skill with the same name.
   *
   * @param skill - the skill to register; `metadata.name` must be set
   */
  register(skill: Skill): void {
    if (!skill || typeof skill !== 'object') {
      throw new Error('SkillRegistry.register expects a Skill object');
    }
    const name = skill.metadata?.name;
    if (!name || name.trim().length === 0) {
      throw new Error('SkillRegistry.register expects a skill with a metadata.name');
    }
    this.skills.set(name, skill);
  }

  /**
   * Unregister a skill by name. Unknown names are a no-op.
   *
   * @param name - the skill name to remove
   */
  unregister(name: string): void {
    this.skills.delete(name);
  }

  /**
   * Get metadata for all registered skills (for the system prompt / UI).
   *
   * @returns a copy of each skill's metadata, in registration order
   */
  listMetadata(): SkillMetadata[] {
    return Array.from(this.skills.values()).map((skill) => ({ ...skill.metadata }));
  }

  /**
   * Get the full skill (metadata + tools + instructions) by name.
   *
   * @param name - the skill name
   * @returns the skill, or `undefined` when not registered
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Flatten the tool definitions of all enabled skills.
   *
   * Tools are deduplicated by name (first registration wins) so the model is
   * never offered the same tool twice.
   *
   * @param enabledSkillNames - names of the skills to include
   * @returns the flattened tool definitions, in skill-registration order
   */
  getToolsForSkills(enabledSkillNames: Set<string>): Skill['tools'][string]['definition'][] {
    const definitions: Skill['tools'][string]['definition'][] = [];
    const seen = new Set<string>();
    if (!enabledSkillNames) return definitions;

    for (const name of enabledSkillNames) {
      const skill = this.skills.get(name);
      if (!skill) continue;
      for (const tool of Object.values(skill.tools ?? {})) {
        const definition = tool?.definition;
        if (!definition || seen.has(definition.name)) continue;
        seen.add(definition.name);
        definitions.push(definition);
      }
    }
    return definitions;
  }

  /**
   * Execute a tool call.
   *
   * Resolves the tool by name (preferring the skill named in
   * `call.skillName`, then a global name search across all skills), runs it
   * with the call's arguments, and times the execution. Failures — missing
   * tools, thrown errors — are returned as an error `ToolResult`, never
   * thrown.
   *
   * @param call - the tool invocation to execute
   * @returns the timed result of the execution
   */
  async execute(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    const tool = this.findTool(call);
    if (!tool) {
      return {
        toolCallId: call.id,
        result: null,
        error: `Tool "${call.name}" not found in any registered skill.`,
        durationMs: Date.now() - start,
      };
    }
    try {
      const result = await tool.execute(call.arguments ?? {});
      return { toolCallId: call.id, result, durationMs: Date.now() - start };
    } catch (error) {
      return {
        toolCallId: call.id,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Check whether executing a tool requires user confirmation.
   *
   * Per the skill contract, tools with an *undefined* `requiresConfirmation`
   * flag require confirmation — only tools explicitly marked safe opt out.
   * Unknown tools are treated as requiring confirmation.
   *
   * @param toolName - the tool name to check
   * @returns `true` when the tool (or its definition) requires confirmation
   */
  requiresConfirmation(toolName: string): boolean {
    const tool = this.findToolByName(toolName);
    if (!tool) return true; // unknown tools are treated as requiring confirmation
    return tool.requiresConfirmation ?? tool.definition?.requiresConfirmation ?? true;
  }

  /**
   * Resolve the name of the skill that owns a tool, if any.
   *
   * Useful for attributing model tool calls back to their skill (e.g. for
   * permission routing in the app layer).
   *
   * @param toolName - the tool name to resolve
   * @returns the owning skill name, or `undefined` when unregistered
   */
  findSkillForTool(toolName: string): string | undefined {
    for (const [name, skill] of this.skills) {
      if (skill.tools?.[toolName]) return name;
    }
    return undefined;
  }

  /**
   * Number of registered skills.
   */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Remove all registered skills.
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Resolve a tool, preferring the skill named in the call.
   */
  private findTool(call: ToolCall): Tool | undefined {
    if (call.skillName) {
      const skill = this.skills.get(call.skillName);
      const tool = skill?.tools?.[call.name];
      if (tool) return tool;
    }
    return this.findToolByName(call.name);
  }

  /**
   * Resolve a tool by name across all skills (first registration wins).
   */
  private findToolByName(name: string): Tool | undefined {
    for (const skill of this.skills.values()) {
      const tool = skill.tools?.[name];
      if (tool) return tool;
    }
    return undefined;
  }
}

/** Global singleton — one SkillRegistry per app. */
export const skillRegistry = new SkillRegistry();
