import type { ToolCall } from '../types';

/**
 * Parses the LLM's raw text output to extract tool calls.
 * Handles multiple formats the model might produce.
 *
 * Returns null if no tool call is found (treat the output as a final answer).
 */
export function parseToolCalls(text: string): ToolCall[] | null {
  if (!text || text.trim().length === 0) return null;

  // Strategy 1: Look for JSON code blocks: ```json { ... } ```
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeFenceMatch) {
    const parsed = tryParseJsonBlock(codeFenceMatch[1]);
    if (parsed) return parsed;
  }

  // Strategy 2: Look for bare JSON objects containing "tool" key
  const jsonBlockMatch = text.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (jsonBlockMatch) {
    const parsed = tryParseJsonBlock(jsonBlockMatch[0]);
    if (parsed) return parsed;
  }

  // Strategy 3: Look for function-call style: tool.name({...})
  const funcCallMatch = text.match(
    /([a-z_]+\.[a-z_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)/i,
  );
  if (funcCallMatch) {
    try {
      const args = JSON.parse(funcCallMatch[2]);
      return [
        {
          id: generateToolCallId(),
          name: funcCallMatch[1],
          arguments: args,
        },
      ];
    } catch {
      // Not valid JSON, fall through
    }
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToolCallId(): string {
  return `tc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function tryParseJsonBlock(jsonStr: string): ToolCall[] | null {
  try {
    const trimmed = jsonStr.trim();
    const parsed = JSON.parse(trimmed);

    // Single tool call: { "tool": "...", "arguments": {...} }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.tool) {
      return [
        {
          id: generateToolCallId(),
          name: String(parsed.tool),
          arguments: parsed.arguments ?? {},
        },
      ];
    }

    // Array of tool calls: [{ "tool": "...", "arguments": {...} }, ...]
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].tool) {
      return parsed.map((tc: Record<string, unknown>) => ({
        id: generateToolCallId(),
        name: String(tc.tool),
        arguments: (tc.arguments as Record<string, unknown>) ?? {},
      }));
    }
  } catch {
    // JSON parse failed
  }

  return null;
}
