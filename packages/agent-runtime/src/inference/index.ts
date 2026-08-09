/**
 * Text generation API: `generateText`, `streamMessage`, `generateObject`.
 *
 * Every generation goes through the single-flight queue in `queue.ts` — the
 * ExecuTorch JSI bridge is not thread-safe and concurrent calls would crash
 * the native runtime. Models are stateless: each call receives the full
 * conversation history and the library keeps no session state.
 */

import type {
  FinishReason,
  GenerationResult,
  Message,
  ModelTier,
  ToolCall,
  ToolDefinition,
} from '../types';
import {
  LLAMA3_2_1B_SPINQUANT,
  LLAMA3_2_3B_SPINQUANT,
  LLMModule,
  isExecutorchAvailable,
} from '../executorch';
import { enqueueGeneration } from './queue';
import { buildSystemPrompt } from './prompts';
import { extractJson, parseToolCalls, validateJsonSchema } from './parser';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Options shared by all generation entry points. */
export interface GenerateOptions {
  /** Which model tier to run on. Defaults to `fast`. */
  model?: ModelTier;
  /**
   * Custom system prompt. When omitted, a default prompt is built from
   * `buildSystemPrompt` with no skills/memories (see `prompts.ts`).
   */
  systemPrompt?: string;
  /** Tools to advertise to the model (appended to the system prompt). */
  tools?: ToolDefinition[];
  /** Sampling temperature. Defaults to 0.7. */
  temperature?: number;
  /** Maximum completion tokens before the output is truncated. Defaults to 2048. */
  maxTokens?: number;
  /** Abort the generation. The pending promise rejects with "Generation was cancelled.". */
  signal?: AbortSignal;
  /** Hard timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number;
}

/** Options for {@link streamMessage}. */
export interface StreamOptions extends GenerateOptions {
  /** Called for every token batch. `accumulatedText` is the full text so far. */
  onToken: (token: string, accumulatedText: string) => void;
  /** Called when a tool call is discovered in the model output. */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Called when generation finishes with the final result. */
  onComplete?: (result: GenerationResult) => void;
  /** Called when generation fails (the promise also rejects). */
  onError?: (error: Error) => void;
}

/** Internal: the streaming entry point also receives the token callback. */
interface QueueGenerationOptions extends GenerateOptions {
  onToken?: (token: string, accumulatedText: string) => void;
}

/** The ExecuTorch LLM surface we rely on (subset of the real LLMModule API). */
interface LocalLLMInstance {
  generate(messages: { role: string; content: string }[]): Promise<string>;
  interrupt?(): void;
  setTokenCallback?(callback: { tokenCallback: (token: string) => void }): void;
  configure?(config: {
    generationConfig?: {
      temperature?: number;
      topP?: number;
      minP?: number;
      repetitionPenalty?: number;
      outputTokenBatchSize?: number;
      batchTimeInterval?: number;
    };
  }): void;
  getGeneratedTokenCount?(): number;
  getPromptTokensCount?(): number;
}

// ── Cached LLM instances (one per tier) ───────────────────────────────────────

const llmCache = new Map<ModelTier, LocalLLMInstance>();

/** Load (or reuse) the ExecuTorch LLM instance for a tier. */
async function getLLM(tier: ModelTier): Promise<LocalLLMInstance> {
  if (!isExecutorchAvailable() || !LLMModule) {
    throw new Error(
      'On-device AI requires a native build with ExecuTorch support. The current environment does not have the required native modules.',
    );
  }

  const cached = llmCache.get(tier);
  if (cached) return cached;

  const modelConfig =
    tier === 'balanced' ? LLAMA3_2_3B_SPINQUANT : LLAMA3_2_1B_SPINQUANT;
  const instance = (await LLMModule.fromModelName(modelConfig)) as LocalLLMInstance;
  llmCache.set(tier, instance);
  return instance;
}

// ── Message formatting ─────────────────────────────────────────────────────────

/**
 * Build the message array the ExecuTorch LLM expects:
 * - a single leading system message (the option, or the caller's first one,
 *   or the default prompt)
 * - additional system messages are dropped
 * - `tool`-role messages are mapped to `user` with a tool-result prefix so
 *   the LLM can attribute the result to the right call
 */
function buildExecutorchMessages(
  messages: Message[],
  systemPrompt: string | undefined,
): { role: string; content: string }[] {
  const system =
    systemPrompt ??
    messages.find((m) => m.role === 'system')?.content ??
    buildSystemPrompt({ activeSkills: [], memories: [] });

  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: `[Tool result for ${m.name ?? 'tool'}]: ${m.content}`,
        };
      }
      return { role: m.role, content: m.content };
    });

  return [{ role: 'system', content: system }, ...rest];
}

/** Rough token estimate: ~4 characters per token. */
function estimateTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Result returned when ExecuTorch is unavailable in this environment. */
function unavailableResult(): GenerationResult {
  return {
    text: 'On-device AI is not available. Please download a model in Settings to get started.',
    finishReason: 'error',
    toolCalls: [],
    usage: { promptTokens: 0, completionTokens: 0 },
  };
}

// ── Core generation (must run inside the single-flight queue) ─────────────────

async function generateInQueue(
  messages: Message[],
  options: QueueGenerationOptions,
): Promise<GenerationResult> {
  const {
    model = 'fast',
    systemPrompt,
    tools,
    temperature = 0.7,
    maxTokens = 2048,
    signal,
    timeoutMs = 30_000,
  } = options;

  if (signal?.aborted) {
    throw new Error('Generation was cancelled.');
  }

  const llm = await getLLM(model);

  // System prompt + tool instructions.
  let toolInstructions = '';
  if (tools && tools.length > 0) {
    toolInstructions =
      '\n\nYou have access to these tools:\n' +
      tools
        .map(
          (t) =>
            `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}`,
        )
        .join('\n') +
      '\n\nTo use a tool, output a JSON block with "tool" and "arguments" keys.';
  }
  const systemContent =
    (systemPrompt ?? buildSystemPrompt({ activeSkills: [], memories: [] })) +
    toolInstructions;
  const fullMessages = buildExecutorchMessages(messages, systemContent);

  // Streaming: route every token batch through the caller's callback.
  let accumulated = '';
  if (options.onToken && llm.setTokenCallback) {
    llm.setTokenCallback({
      tokenCallback: (token: string) => {
        accumulated += token;
        options.onToken?.(token, accumulated);
      },
    });
  }

  if (llm.configure) {
    llm.configure({ generationConfig: { temperature } });
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  try {
    const response = await Promise.race([
      llm.generate(fullMessages),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          llm.interrupt?.();
          reject(
            new Error(`Generation timed out after ${Math.round(timeoutMs / 1000)}s.`),
          );
        }, timeoutMs);
        abortHandler = () => {
          llm.interrupt?.();
          reject(new Error('Generation was cancelled.'));
        };
        signal?.addEventListener('abort', abortHandler, { once: true });
      }),
    ]);

    const text = accumulated || response;
    const toolCalls = parseToolCalls(text);
    const completionTokens = llm.getGeneratedTokenCount
      ? llm.getGeneratedTokenCount()
      : estimateTokenCount(text);
    const promptTokens = llm.getPromptTokensCount
      ? llm.getPromptTokensCount()
      : estimateTokens(messages);

    let finishReason: FinishReason = 'stop';
    if (toolCalls) finishReason = 'tool-calls';
    else if (completionTokens >= maxTokens) finishReason = 'length';

    return {
      text,
      finishReason,
      toolCalls: toolCalls ?? [],
      usage: { promptTokens, completionTokens },
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * One-shot text generation. Sends the full conversation history to the local
 * LLM and returns the raw response (tool calls included, when present).
 *
 * Does NOT execute tool calls — the agent loop (`agentLoop`) does that.
 *
 * @throws when generation fails or is aborted/times out. When ExecuTorch is
 *   unavailable, returns a result with `finishReason: 'error'` instead.
 */
export async function generateText(
  messages: Message[],
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  if (!isExecutorchAvailable()) return unavailableResult();
  if (options.signal?.aborted) throw new Error('Generation was cancelled.');

  return enqueueGeneration(() => generateInQueue(messages, options));
}

/**
 * Streaming text generation. Every token batch is delivered to
 * `options.onToken` as it is produced.
 *
 * @returns `{ promise, stop }` — `promise` resolves with the final
 *   {@link GenerationResult} (or rejects on error/abort); `stop()` cancels
 *   the in-flight generation (the promise then rejects with
 *   "Generation was cancelled." and `onError` is not called for user stops).
 */
export function streamMessage(
  messages: Message[],
  options: StreamOptions,
): { promise: Promise<GenerationResult>; stop: () => void } {
  const { onToken, onToolCall, onComplete, onError, ...genOptions } = options;

  let stopped = false;
  let activeLLM: LocalLLMInstance | null = null;
  const controller = new AbortController();
  if (genOptions.signal) {
    genOptions.signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
  }

  const promise = enqueueGeneration(async (): Promise<GenerationResult> => {
    if (stopped) throw new Error('Generation was stopped.');

    if (!isExecutorchAvailable()) {
      const fallback =
        'On-device AI is not available. Please download a model in Settings to get started.';
      onToken(fallback, fallback);
      const result: GenerationResult = {
        text: fallback,
        finishReason: 'error',
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0 },
      };
      onComplete?.(result);
      return result;
    }

    const llm = await getLLM(genOptions.model ?? 'fast');
    activeLLM = llm;

    try {
      const result = await generateInQueue(messages, {
        ...genOptions,
        signal: controller.signal,
        onToken,
      });
      if (result.finishReason === 'tool-calls') {
        result.toolCalls.forEach((call) => onToolCall?.(call));
      }
      onComplete?.(result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!stopped) onError?.(err);
      throw err;
    }
  });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    activeLLM?.interrupt?.();
  };

  return { promise, stop };
}

/**
 * Structured output generation. Prompts the model to return JSON matching
 * `schema`, extracts and validates it, and retries once on failure.
 *
 * @param schema A JSON-Schema-style object (`{ type: 'object', properties,
 *   required }`) or the shorthand field-map form (`{ title: 'string' }`).
 * @returns The parsed, validated value.
 * @throws when the model fails to produce valid JSON after the retry.
 */
export async function generateObject<T>(
  messages: Message[],
  schema: Record<string, unknown>,
  options: GenerateOptions = {},
): Promise<T> {
  const schemaStr = JSON.stringify(schema, null, 2);
  const systemMsg = `You must respond with ONLY valid JSON matching this schema. Do not include any other text, markdown, or code fences:\n\n${schemaStr}`;

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;
  let currentMessages = messages;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await generateText(currentMessages, {
        ...options,
        systemPrompt: systemMsg,
        // Lower temperature for structured output.
        temperature: Math.min((options.temperature ?? 0.7) * 0.5, 0.3),
      });

      const parsed = extractJson(result.text);
      if (parsed === null) {
        throw new Error('No JSON object found in the response.');
      }
      const validationError = validateJsonSchema(parsed, schema);
      if (validationError) {
        throw new Error(`Schema validation failed: ${validationError}`);
      }

      return parsed as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        currentMessages = [
          ...currentMessages,
          {
            role: 'user' as const,
            content:
              `Your previous response was not valid JSON matching the schema. ` +
              `Error: ${lastError.message}. Please respond with ONLY the JSON object.`,
          },
        ];
      }
    }
  }

  throw new Error(
    `Failed to generate valid JSON after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}
