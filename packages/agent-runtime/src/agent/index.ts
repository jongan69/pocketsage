import type {
  AgentContext,
  AgentResult,
  GenerationResult,
  Message,
  ToolCall,
  ToolResult,
} from '../types';
import { generateText, type GenerateOptions } from '../inference';

/**
 * Alias of {@link GenerationResult} callbacks used by the agent runtime.
 * Kept for spec compatibility with `@pocketsage/agent-runtime` consumers.
 */
export type AgentCallbacks = import('../types').StreamCallbacks;

export type { AgentContext, AgentResult } from '../types';

/** Default maximum number of model calls per loop turn. */
const DEFAULT_MAX_STEPS = 10;

/** Rough context budget (tokens) before the loop compresses history. */
const CONTEXT_TOKEN_BUDGET = 4096;

/** Rough token estimate: ~4 characters per token for English text. */
const TOKENS_PER_CHAR = 4;

/**
 * A tool call as produced by the model, optionally attributed to a skill.
 * `skillName` is a runtime enrichment added by `executeToolCalls` callers;
 * it is not emitted by the model.
 */
export interface AgentToolCall extends ToolCall {
  skillName?: string;
}

/**
 * The result of executing one tool call, including wall-clock duration.
 */
export interface AgentToolResult extends ToolResult {
  durationMs: number;
}

/**
 * Multi-step agent loop with tool calling.
 *
 * 1. Calls `generateText` with the current messages and available tools.
 * 2. If the model returns a final answer → calls `callbacks.onComplete` and
 *    returns an `AgentResult` with the answer, step count, and usage.
 * 3. If the model returns tool calls → emits `callbacks.onToolCall` for each,
 *    executes them sequentially via `context.toolExecutor`, feeds the results
 *    back as `tool` messages, and loops (up to `maxSteps`).
 * 4. Aborts (returning a partial result) when `context.signal` is aborted or
 *    when generation fails. When `maxSteps` is reached, the last model
 *    response is returned as the final answer.
 *
 * Streaming: when `callbacks.onToken` is provided, it is invoked with the
 * full response text after each generation (the runtime itself is
 * non-streaming; apps that need per-token streaming should use
 * `streamMessage` directly).
 *
 * @param context - the agent context built by `buildAgentContext`
 * @returns the agent result (final answer, steps, tool calls, usage)
 */
export async function agentLoop(context: AgentContext): Promise<AgentResult> {
  const maxSteps = Math.max(1, context.maxSteps ?? DEFAULT_MAX_STEPS);
  const callbacks = context.callbacks;
  const signal = context.signal;

  // Work on a mutable copy; the leading system message is stripped before
  // each call because generateText injects the system prompt itself.
  const conversation: Message[] = [...(Array.isArray(context.messages) ? context.messages : [])];

  const allToolCalls: ToolCall[] = [];
  const usage = { promptTokens: 0, completionTokens: 0 };
  let lastText = '';
  let steps = 0;

  for (steps = 1; steps <= maxSteps; steps++) {
    // Abort check (a): return a partial result immediately.
    if (signal?.aborted) {
      return { finalAnswer: lastText, steps: steps - 1, toolCalls: allToolCalls, usage };
    }

    // Generation (b).
    let result: GenerationResult;
    try {
      result = await generateText(conversation, buildGenerateOptions(context, conversation));
    } catch (error) {
      // An abort races with generation — treat as a clean partial result.
      if (signal?.aborted) {
        return { finalAnswer: lastText, steps: steps - 1, toolCalls: allToolCalls, usage };
      }
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
      return { finalAnswer: lastText, steps: steps - 1, toolCalls: allToolCalls, usage };
    }

    if (result.usage) {
      usage.promptTokens += result.usage.promptTokens ?? 0;
      usage.completionTokens += result.usage.completionTokens ?? 0;
    }
    lastText = result.text ?? '';

    // Streaming emission (c): the runtime is non-streaming, so the complete
    // text is delivered in a single callback.
    if (lastText.length > 0 && typeof callbacks?.onToken === 'function') {
      callbacks.onToken(lastText, lastText);
    }

    const toolCalls = result.toolCalls ?? [];

    // Final answer (e) — no tool calls, or the model stopped on its own.
    if (toolCalls.length === 0 || result.finishReason === 'stop') {
      if (result.finishReason === 'error' && lastText.length > 0) {
        // Soft error result (e.g. ExecuTorch unavailable) — surface it.
        callbacks?.onError?.(new Error(lastText));
      } else {
        callbacks?.onComplete?.(result);
      }
      return { finalAnswer: lastText, steps, toolCalls: allToolCalls, usage };
    }

    // Tool calls (f): announce, execute sequentially, feed results back.
    for (const call of toolCalls) {
      callbacks?.onToolCall?.(call);
    }
    allToolCalls.push(...toolCalls);

    conversation.push({ role: 'assistant', content: lastText });

    const toolResults = await executeToolCalls(
      toolCalls as AgentToolCall[],
      context.toolExecutor,
    );
    for (const toolResult of toolResults) {
      conversation.push({
        role: 'tool',
        name: toolResult.toolCallId,
        content: serializeToolResult(toolResult),
      });
    }

    // Keep the context window from filling up.
    conversation.splice(0, conversation.length, ...maybeCompress(conversation, CONTEXT_TOKEN_BUDGET));
  }

  // Max steps reached — return the last model response as the final answer.
  return {
    finalAnswer:
      lastText ||
      '[Step limit reached] The task could not be completed within the allowed number of steps.',
    steps,
    toolCalls: allToolCalls,
    usage,
  };
}

/**
 * Build the `generateText` options for one loop step.
 *
 * The leading system message (if any) is removed from the message list and
 * handed to `generateText` via `systemPrompt` — this avoids injecting the
 * system prompt twice.
 */
function buildGenerateOptions(context: AgentContext, conversation: Message[]): GenerateOptions {
  const hasSystem = conversation.length > 0 && conversation[0]?.role === 'system';
  return {
    model: context.modelTier,
    tools: context.tools && context.tools.length > 0 ? context.tools : undefined,
    systemPrompt: hasSystem ? context.systemPrompt : undefined,
    signal: context.signal,
  };
}

/**
 * Serialize a tool result for the `tool` message fed back to the model.
 */
function serializeToolResult(result: AgentToolResult): string {
  if (result.error) {
    return JSON.stringify({ error: result.error });
  }
  try {
    if (typeof result.result === 'string') return result.result;
    return JSON.stringify({ result: result.result });
  } catch {
    return JSON.stringify({ result: String(result.result) });
  }
}

/**
 * Execute a batch of tool calls sequentially (never in parallel).
 *
 * Sequential execution avoids race conditions with the single-threaded
 * native ExecuTorch bridge and keeps tool side effects ordered. Each call is
 * timed; failures are returned as error results, never thrown. When an
 * `onConfirm` gate is provided and rejects a call, that call is skipped with
 * a "not approved" error result.
 *
 * @param calls - the tool calls to execute
 * @param executor - the tool executor from the agent context
 * @param onConfirm - optional per-call confirmation gate (defaults to allow)
 * @returns one result per input call, in the same order
 */
export async function executeToolCalls(
  calls: AgentToolCall[],
  executor: AgentContext['toolExecutor'],
  onConfirm?: (call: AgentToolCall) => Promise<boolean> | boolean,
): Promise<AgentToolResult[]> {
  const results: AgentToolResult[] = [];
  if (!Array.isArray(calls)) return results;

  for (const call of calls) {
    const start = Date.now();
    try {
      const confirmed = onConfirm ? await onConfirm(call) : true;
      if (!confirmed) {
        results.push({
          toolCallId: call.id,
          result: null,
          error: 'Tool call was not approved by the user.',
          durationMs: Date.now() - start,
        });
        continue;
      }
      const result = await executor(call.name, call.arguments ?? {});
      results.push({ toolCallId: call.id, result, durationMs: Date.now() - start });
    } catch (error) {
      results.push({
        toolCallId: call.id,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      });
    }
  }
  return results;
}

/**
 * Compress a conversation when it approaches the context window.
 *
 * Drops the oldest non-system messages (one at a time) until the estimated
 * token count fits within `maxTokens`. The system message and the newest
 * messages are always preserved.
 *
 * @param messages - the conversation to compress
 * @param maxTokens - the token budget
 * @returns the compressed conversation
 */
function maybeCompress(messages: Message[], maxTokens: number): Message[] {
  const fits = (msgs: Message[]): boolean => estimateTokens(msgs) <= maxTokens;
  if (fits(messages)) return messages;

  const system = messages.filter((m) => m.role === 'system');
  let rest = messages.filter((m) => m.role !== 'system');
  while (rest.length > 1 && !fits([...system, ...rest])) {
    rest = rest.slice(1); // drop the oldest non-system message
  }
  return [...system, ...rest];
}

/**
 * Rough token estimate: character count / 4 per message.
 */
function estimateTokens(messages: Message[]): number {
  return messages.reduce(
    (sum, m) => sum + Math.ceil((m.content ?? '').length / TOKENS_PER_CHAR),
    0,
  );
}
