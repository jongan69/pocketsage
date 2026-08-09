/**
 * Tool-call extraction from raw LLM output.
 *
 * The on-device model is prompted to emit tool calls as JSON blocks. Because
 * small models are inconsistent about formatting, the parser tries three
 * strategies in order and returns the first that yields valid calls:
 *
 * 1. JSON code fences: ```` ```json { ... } ```` ``
 * 2. Bare JSON: a `{...}` object (or array) containing a `"tool"` key,
 *    located with a string/escape-aware brace scanner.
 * 3. Function-call style: `tool.name({ ... })`.
 *
 * If nothing parses, `parseToolCalls` returns `null` and the caller should
 * treat the output as a final answer.
 */

import type { ToolCall } from '../types';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse tool calls out of the model's raw text output.
 *
 * @param text The raw generation output.
 * @returns A non-empty list of validated tool calls, or `null` when the text
 *   contains no parseable tool call (treat it as a final answer).
 */
export function parseToolCalls(text: string): ToolCall[] | null {
  if (!text || text.trim().length === 0) return null;

  // Strategy 1: JSON code fences.
  const fenceCalls = tryParseCodeFences(text);
  if (fenceCalls) return fenceCalls;

  // Strategy 2: bare JSON object/array containing a "tool" key.
  const bareCalls = tryParseBareJson(text);
  if (bareCalls) return bareCalls;

  // Strategy 3: function-call style (tool.name({...})).
  const fnCalls = tryParseFunctionCalls(text);
  if (fnCalls) return fnCalls;

  return null;
}

/**
 * Extract the first JSON value from a string: a `{...}` object or `[...]`
 * array, located with a string/escape-aware scanner. Returns `null` when no
 * balanced JSON value is present.
 */
export function extractJson(text: string): unknown | null {
  if (!text) return null;

  const start = findJsonStart(text);
  if (start < 0) return null;

  const end = findBalancedEnd(text, start);
  if (end < 0) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Minimal JSON-Schema validation for the subset used by tool call arguments
 * and {@link validateJsonSchema} in `generateObject`.
 *
 * Supports `type: 'object'` with `properties` and `required`, plus the
 * shorthand `{ title: 'string' }` field-map form. Returns an error message
 * when validation fails, or `null` when the value matches.
 *
 * @param value The value to validate.
 * @param schema Either `{ type: 'object', properties, required }` or a
 *   plain field-map `{ fieldName: 'string' }`.
 */
export function validateJsonSchema(
  value: unknown,
  schema: Record<string, unknown>,
): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'Expected a JSON object.';
  }
  const obj = value as Record<string, unknown>;

  // Shorthand field-map form: { field: 'string' } — keys are the fields.
  if (schema.type === undefined) {
    for (const [field, typeName] of Object.entries(schema)) {
      const error = validateField(obj[field], String(typeName), field);
      if (error) return error;
    }
    return null;
  }

  if (schema.type !== 'object') {
    return `Unsupported schema type "${String(schema.type)}".`;
  }

  const properties = (schema.properties ?? {}) as Record<
    string,
    { type?: string; description?: string; enum?: string[] }
  >;
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];

  for (const field of required) {
    if (obj[field] === undefined) {
      return `Missing required field "${field}".`;
    }
  }

  for (const [field, spec] of Object.entries(properties)) {
    if (obj[field] === undefined) continue;
    const typeName = spec?.type;
    const error = validateField(obj[field], typeName, field);
    if (error) return error;
    if (Array.isArray(spec?.enum) && !spec.enum.includes(obj[field] as string)) {
      return `Field "${field}" must be one of: ${spec.enum.join(', ')}.`;
    }
  }

  return null;
}

// ── Strategy 1: code fences ────────────────────────────────────────────────────

function tryParseCodeFences(text: string): ToolCall[] | null {
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  for (const match of text.matchAll(fencePattern)) {
    const calls = coerceToolCalls(extractJson(match[1]));
    if (calls) return calls;
  }
  return null;
}

// ── Strategy 2: bare JSON ──────────────────────────────────────────────────────

function tryParseBareJson(text: string): ToolCall[] | null {
  // Fast pre-filter: the text must mention a tool key at all.
  if (!/"tool"\s*:/i.test(text)) return null;

  const start = findJsonStart(text);
  if (start < 0) return null;

  const end = findBalancedEnd(text, start);
  if (end < 0) return null;

  const parsed = extractJson(text);
  return parsed == null ? null : coerceToolCalls(parsed);
}

// ── Strategy 3: function-call style ───────────────────────────────────────────

function tryParseFunctionCalls(text: string): ToolCall[] | null {
  const pattern = /\b([A-Za-z_][A-Za-z0-9_.-]*)\s*\(\s*([\s\S]*?)\s*\)/g;
  const calls: ToolCall[] = [];

  for (const match of text.matchAll(pattern)) {
    const name = match[1].trim();
    const argsText = match[2].trim();
    if (argsText.length === 0) continue;
    const args = extractJson(argsText);
    const call = coerceToolCall(name, args);
    if (call) calls.push(call);
  }

  return calls.length > 0 ? calls : null;
}

// ── Shared coercion helpers ────────────────────────────────────────────────────

/** A valid tool call must have a non-empty tool name and object arguments. */
function coerceToolCall(
  name: string,
  args: unknown,
): ToolCall | null {
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return null;
  }
  return {
    id: generateToolCallId(),
    name: name.trim(),
    arguments: args as Record<string, unknown>,
  };
}

/** Coerce a parsed JSON value into tool calls (object or array of objects). */
function coerceToolCalls(parsed: unknown): ToolCall[] | null {
  if (parsed === null || typeof parsed !== 'object') return null;

  const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const calls: ToolCall[] = [];

  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const call = coerceToolCall(
      typeof record.tool === 'string' ? record.tool : (record.name as string),
      record.arguments ?? record.parameters,
    );
    if (call) calls.push(call);
  }

  return calls.length > 0 ? calls : null;
}

// ── JSON scanning helpers ──────────────────────────────────────────────────────

/** Find the index of the first `{` or `[` that starts a JSON value. */
function findJsonStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') return i;
  }
  return -1;
}

/**
 * Find the index of the brace/bracket that balances the one at `start`,
 * skipping string literals and escape sequences.
 */
function findBalancedEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ── ID generation ──────────────────────────────────────────────────────────────

let toolCallCounter = 0;

/** Generate a unique tool call id (collision-safe across calls and devices). */
function generateToolCallId(): string {
  toolCallCounter++;
  const rand = Math.random().toString(36).slice(2, 9);
  return `tc_${Date.now().toString(36)}_${toolCallCounter.toString(36)}_${rand}`;
}

// ── Field validation helper ────────────────────────────────────────────────────

function validateField(value: unknown, typeName: string | undefined, field: string): string | null {
  if (typeName === undefined || typeName === 'any') return null;
  switch (typeName) {
    case 'string':
      return typeof value === 'string' ? null : `Field "${field}" must be a string.`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `Field "${field}" must be a number.`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `Field "${field}" must be a boolean.`;
    case 'array':
      return Array.isArray(value) ? null : `Field "${field}" must be an array.`;
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? null
        : `Field "${field}" must be an object.`;
    default:
      return null;
  }
}
