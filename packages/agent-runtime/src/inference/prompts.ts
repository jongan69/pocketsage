/**
 * System prompt construction for the on-device agent.
 *
 * The prompt tells the model who it is, what day it is, which skills/tools are
 * available and how to invoke them, and what relevant memories exist. It is
 * rebuilt per agent turn (memories change as the conversation progresses).
 */

import type { SkillMetadata } from '../types';

/** Everything the system prompt builder needs for one turn. */
export interface PromptContext {
  /** Skills enabled by the user this turn. */
  activeSkills: SkillMetadata[];
  /** Relevant memories retrieved from the memory store. */
  memories: string[];
  /** Current date; defaults to `new Date()` when omitted. */
  date?: Date;
}

/**
 * Build the system prompt for the on-device agent.
 *
 * @param context Skills, memories, and (optionally) the date.
 * @returns The full system prompt string.
 */
export function buildSystemPrompt(context: PromptContext): string {
  const today = (context.date ?? new Date()).toISOString().split('T')[0];

  const parts: string[] = [
    'You are PocketSage, an on-device AI assistant. You run entirely on this phone.',
    'No data leaves this device. You are private by design.',
    '',
    `Today is ${today}.`,
  ];

  // Available tools
  if (context.activeSkills.length > 0) {
    parts.push('');
    parts.push('## Available Tools');
    parts.push(
      'You have tools available from the enabled skills below. ' +
        'When you want to use a tool, output a JSON block with the tool name and ' +
        'arguments, then wait for the tool result before continuing. ' +
        'You may call multiple tools in sequence.',
    );
    parts.push('');

    for (const skill of context.activeSkills) {
      parts.push(`### ${skill.name}`);
      if (skill.description) parts.push(skill.description);
      if (skill.triggers.length > 0) {
        parts.push(`Triggers: ${skill.triggers.join(', ')}`);
      }
      parts.push('');
    }

    parts.push('Tool call format:');
    parts.push('```json');
    parts.push('{"tool": "skill.toolName", "arguments": {"param": "value"}}');
    parts.push('```');
    parts.push(
      'Output ONLY the JSON block when calling a tool — no extra text around it.',
    );
    parts.push('');
  } else {
    parts.push('');
    parts.push('You have no tools available this turn. Answer directly.');
    parts.push('');
  }

  // Memory context
  if (context.memories.length > 0) {
    parts.push('## Relevant Memories');
    parts.push(
      'Use these memories to personalize your answer. They may be incomplete or stale — trust the user when they contradict them.',
    );
    for (const memory of context.memories) {
      parts.push(`- ${memory}`);
    }
    parts.push('');
  }

  // Behavior guidelines
  parts.push('## Guidelines');
  parts.push('- Be concise. The user is on a phone.');
  parts.push("- If you don't know something, say so — don't fabricate.");
  parts.push("- When using tools, explain what you're doing before the tool call.");
  parts.push('- After receiving tool results, use them to answer naturally.');
  parts.push('- Respect privacy. Never share data outside this conversation.');
  parts.push(
    '- If asked to do something harmful, illegal, or privacy-violating, refuse politely.',
  );

  return parts.join('\n');
}
