import type {
  AgentContext,
  AgentResult,
  Message,
  ToolCall,
  ToolResult,
  GenerationResult,
} from '../types';
import { generateText } from '../inference';
import { parseToolCalls } from '../inference/parser';

/**
 * Multi-step agent loop with tool calling.
 *
 * 1. Sends messages to the local LLM with available tool definitions.
 * 2. If the model returns a final answer → done.
 * 3. If the model returns tool calls → executes each, feeds results back → loops.
 * 4. Stops when maxSteps is reached or signal is aborted.
 */
export async function agentLoop(context: AgentContext): Promise<AgentResult> {
  const {
    messages,
    tools,
    toolExecutor,
    maxSteps,
    callbacks,
    signal,
  } = context;

  let steps = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const allToolCalls: ToolCall[] = [];

  // Work on a mutable copy of messages
  const conversation: Message[] = [...messages];

  while (steps < maxSteps) {
    // Check for abort
    if (signal?.aborted) {
      const partial = await summarizePartial(conversation);
      return {
        finalAnswer: partial + '\n\n[Generation was cancelled.]',
        steps,
        toolCalls: allToolCalls,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
      };
    }

    steps++;

    let result: GenerationResult;
    try {
      result = await generateText(conversation, {
        tools: tools.length > 0 ? tools : undefined,
        signal,
      });
    } catch (error) {
      callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        finalAnswer: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        steps,
        toolCalls: allToolCalls,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
      };
    }

    totalPromptTokens += result.usage.promptTokens;
    totalCompletionTokens += result.usage.completionTokens;

    // No tool calls — this is the final answer
    if (result.toolCalls.length === 0 || result.finishReason === 'stop') {
      callbacks.onComplete?.(result);
      return {
        finalAnswer: result.text,
        steps,
        toolCalls: allToolCalls,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
      };
    }

    // Tool calls found — execute them
    const toolCalls: ToolCall[] = result.toolCalls;
    allToolCalls.push(...toolCalls);

    // Add the assistant's response (with tool calls) to the conversation
    conversation.push({ role: 'assistant', content: result.text });

    // Execute each tool call sequentially
    for (const call of toolCalls) {
      callbacks.onToolCall?.(call);

      let toolResult: ToolResult;
      try {
        const execResult = await toolExecutor(call.name, call.arguments);
        toolResult = {
          toolCallId: call.id,
          result: execResult,
        };
      } catch (error) {
        toolResult = {
          toolCallId: call.id,
          result: null,
          error: error instanceof Error ? error.message : 'Tool execution failed',
        };
      }

      // Feed tool result back to the model
      conversation.push({
        role: 'tool',
        content: JSON.stringify(
          toolResult.error
            ? { error: toolResult.error }
            : { result: toolResult.result },
        ),
        name: call.name,
      });
    }
  }

  // Max steps reached — ask for a summary
  const summary = await summarizePartial(conversation);
  return {
    finalAnswer: summary + '\n\n[Reached maximum steps. The task may be too complex.]',
    steps,
    toolCalls: allToolCalls,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function summarizePartial(messages: Message[]): Promise<string> {
  try {
    const result = await generateText([
      ...messages,
      {
        role: 'user',
        content:
          'Summarize what you have done so far in 1-2 sentences. Be concise.',
      },
    ]);
    return result.text;
  } catch {
    return 'I was unable to complete the task.';
  }
}

/**
 * Execute multiple tool calls sequentially.
 * Each is executed one at a time to avoid race conditions with native modules.
 */
export async function executeToolCalls(
  calls: ToolCall[],
  executor: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    try {
      const result = await executor(call.name, call.arguments);
      results.push({ toolCallId: call.id, result });
    } catch (error) {
      results.push({
        toolCallId: call.id,
        result: null,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      });
    }
  }
  return results;
}
