import { Platform } from 'react-native';
import type { Message, ToolDefinition, GenerationResult, StreamCallbacks, ModelTier } from '../types';
import { isExecutorchAvailable, LLMModule } from '../executorch/runtime';
import { enqueueGeneration } from './queue';
import { buildSystemPrompt } from './prompts';
import { parseToolCalls } from './parser';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  model?: ModelTier;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StreamOptions extends GenerateOptions {
  onToken: (token: string, accumulatedText: string) => void;
}

// ── Internal: Local LLM Instance ──────────────────────────────────────────────

interface LocalLLMInstance {
  delete?: () => void;
  interrupt?: () => void;
  setTokenCallback?: (callback: { tokenCallback: (token: string) => void }) => void;
  generate: (messages: { role: string; content: string }[]) => Promise<string>;
}

let cachedLLM: LocalLLMInstance | null = null;
let cachedModelTier: ModelTier | null = null;

async function getLLM(tier: ModelTier): Promise<LocalLLMInstance> {
  if (!isExecutorchAvailable() || !LLMModule) {
    throw new Error(
      'On-device AI requires a native build with ExecuTorch support. The current environment does not have the required native modules.',
    );
  }

  // For now, use the default model. Model switching by tier requires
  // model preloading infrastructure that's device-specific.
  if (cachedLLM) {
    return cachedLLM;
  }

  try {
    // Import model config dynamically based on tier
    const modelConfig =
      tier === 'balanced'
        ? require('../executorch/model-config').LLAMA3_2_3B_SPINQUANT
        : require('../executorch/model-config').LLAMA3_2_1B_SPINQUANT;

    cachedLLM = (await LLMModule.fromModelName(modelConfig)) as LocalLLMInstance;
    cachedModelTier = tier;
    return cachedLLM;
  } catch (error) {
    throw new Error(
      `Failed to load on-device model: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

// ── Message formatting ────────────────────────────────────────────────────────

function formatMessages(messages: Message[]): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function estimateTokens(messages: Message[]): number {
  // Rough estimate: ~4 characters per token for English text
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * One-shot text generation. Sends messages to the local LLM and returns
 * the response. Does NOT execute tool calls — use agentLoop() for multi-step.
 */
export async function generateText(
  messages: Message[],
  options: GenerateOptions = {},
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

  if (!isExecutorchAvailable()) {
    return {
      text: "On-device AI is not available. Please download a model in Settings to get started.",
      finishReason: 'error',
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  if (signal?.aborted) {
    throw new Error('Generation was cancelled.');
  }

  return enqueueGeneration(async () => {
    if (signal?.aborted) throw new Error('Generation was cancelled.');

    const llm = await getLLM(model);

    // Inject system prompt and tool descriptions
    const systemMsg = systemPrompt ?? buildSystemPrompt({ activeSkills: [], memories: [] });

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

    const fullMessages = [
      { role: 'system', content: systemMsg + toolInstructions },
      ...formatMessages(messages),
    ];

    const promptTokens = estimateTokens(messages);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    try {
      const response = await Promise.race([
        llm.generate(fullMessages),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            llm.interrupt?.();
            reject(new Error(`Generation timed out after ${Math.round(timeoutMs / 1000)}s.`));
          }, timeoutMs);
          abortHandler = () => {
            llm.interrupt?.();
            reject(new Error('Generation was cancelled.'));
          };
          signal?.addEventListener('abort', abortHandler, { once: true });
        }),
      ]);

      const toolCalls = parseToolCalls(response);

      return {
        text: response,
        finishReason: toolCalls ? 'tool-calls' : 'stop',
        toolCalls: toolCalls ?? [],
        usage: {
          promptTokens,
          completionTokens: Math.ceil(response.length / 4),
        },
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abortHandler) signal?.removeEventListener('abort', abortHandler);
    }
  });
}

/**
 * Streaming text generation. Calls onToken for each generated token.
 * Returns an object with a promise (resolves to the final result) and
 * a stop() function to cancel generation.
 */
export function streamMessage(
  messages: Message[],
  options: StreamOptions,
): { promise: Promise<GenerationResult>; stop: () => void } {
  const { onToken, ...genOptions } = options;
  let stopped = false;

  const promise = (async (): Promise<GenerationResult> => {
    if (!isExecutorchAvailable()) {
      const fallback =
        "On-device AI is not available. Please download a model in Settings.";
      onToken(fallback, fallback);
      return {
        text: fallback,
        finishReason: 'error',
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }

    return enqueueGeneration(async () => {
      if (stopped) throw new Error('Generation was stopped.');

      const llm = await getLLM(genOptions.model ?? 'fast');
      let accumulated = '';

      // Set up streaming callback
      if (llm.setTokenCallback) {
        llm.setTokenCallback({
          tokenCallback: (token: string) => {
            if (!stopped) {
              accumulated += token;
              onToken(token, accumulated);
            }
          },
        });
      }

      try {
        const result = await generateText(messages, genOptions);
        // If streaming callback wasn't set, simulate with the full response
        if (!llm.setTokenCallback) {
          onToken(result.text, result.text);
        }
        return { ...result, text: accumulated || result.text };
      } catch (error) {
        if (stopped) throw new Error('Generation was stopped.');
        throw error;
      }
    });
  })();

  const stop = () => {
    stopped = true;
    // Try to interrupt the model
    getLLM('fast')
      .then((llm) => llm.interrupt?.())
      .catch(() => {});
  };

  return { promise, stop };
}

/**
 * Structured output generation. Prompts the model to return JSON matching a schema,
 * extracts and validates it, and retries once on parse failure.
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

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await generateText(messages, {
        ...options,
        systemPrompt: systemMsg,
        temperature: Math.min((options.temperature ?? 0.7) * 0.5, 0.3), // Lower temp for structured output
      });

      // Extract JSON from the response
      let jsonStr = result.text.trim();

      // Remove code fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      // Find JSON object boundaries
      const objStart = jsonStr.indexOf('{');
      const objEnd = jsonStr.lastIndexOf('}');
      if (objStart >= 0 && objEnd > objStart) {
        jsonStr = jsonStr.slice(objStart, objEnd + 1);
      }

      const parsed = JSON.parse(jsonStr) as T;

      // Basic schema validation
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Response is not a JSON object.');
      }

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        // Add feedback for retry
        messages.push({
          role: 'user',
          content: `Your previous response was not valid JSON matching the schema. Error: ${lastError.message}. Please respond with ONLY the JSON object.`,
        });
      }
    }
  }

  throw new Error(
    `Failed to generate valid JSON after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}
