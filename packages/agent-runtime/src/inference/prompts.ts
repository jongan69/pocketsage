import type { SkillMetadata } from '../types';

export interface PromptContext {
  activeSkills: SkillMetadata[];
  memories: string[];
  date?: Date;
}

/**
 * Builds the system prompt for the on-device agent.
 * Includes role description, available tools, memory context, and date awareness.
 */
export function buildSystemPrompt(context: PromptContext): string {
  const today = (context.date ?? new Date()).toISOString().split('T')[0];

  const parts: string[] = [
    `You are PocketSage, an on-device AI assistant. You run entirely on this phone using a local LLM.`,
    `No data leaves this device. You are private by design.`,
    ``,
    `Today is ${today}.`,
  ];

  // Available tools
  if (context.activeSkills.length > 0) {
    parts.push(``);
    parts.push(`## Available Tools`);
    parts.push(
      `You have access to tools from these skills. To use a tool, output a JSON block with the tool name and arguments. You may call multiple tools in sequence.`,
    );
    parts.push(``);

    for (const skill of context.activeSkills) {
      parts.push(`### ${skill.name}`);
      parts.push(skill.description);
      parts.push(`Triggers: ${skill.triggers.join(', ')}`);
      parts.push(``);
    }

    parts.push(`Tool call format:`);
    parts.push('```json');
    parts.push('{"tool": "tool.name", "arguments": {"param": "value"}}');
    parts.push('```');
    parts.push(``);
  }

  // Memory context
  if (context.memories.length > 0) {
    parts.push(`## Relevant Memories`);
    for (const memory of context.memories) {
      parts.push(`- ${memory}`);
    }
    parts.push(``);
  }

  // Behavior guidelines
  parts.push(`## Guidelines`);
  parts.push(`- Be concise. The user is on a phone.`);
  parts.push(`- If you don't know something, say so — don't fabricate.`);
  parts.push(`- When using tools, explain what you're doing before the tool call.`);
  parts.push(`- After receiving tool results, use them to answer naturally.`);
  parts.push(`- Respect privacy. Never share data outside this conversation.`);
  parts.push(
    `- If asked to do something harmful, illegal, or privacy-violating, refuse politely.`,
  );

  return parts.join('\n');
}
