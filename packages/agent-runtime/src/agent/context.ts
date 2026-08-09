import type {
  AgentContext,
  Message,
  ModelTier,
  StreamCallbacks,
} from '../types';
import type { SkillRegistry } from '../skills';
import type { MemoryManager } from '../rag/memory-manager';
import { buildSystemPrompt } from '../inference/prompts';
import { skillRegistry as globalRegistry } from '../skills';
import { randomId } from '../utils';

/** Default maximum number of model calls per loop turn. */
const DEFAULT_MAX_STEPS = 10;

/** Number of memories injected into the system prompt. */
const MEMORY_TOP_K = 3;

/** Minimum cosine similarity for a memory to be injected. */
const MEMORY_SCORE_THRESHOLD = 0.3;

/**
 * App-level state required to build an {@link AgentContext}.
 *
 * This is the bridge between the app (Zustand stores) and the agent runtime.
 */
export interface BuildContextOptions {
  /** The user's latest message. */
  userMessage: string;
  /** Prior conversation messages (excluding the new user message). */
  conversationHistory: Message[];
  /** The skill registry; defaults to the global singleton. */
  skillRegistry?: SkillRegistry;
  /** Names of the skills enabled by the user. */
  enabledSkills: Set<string>;
  /** Memory manager used for RAG recall. */
  memoryManager: MemoryManager;
  /** Which model tier to run on. */
  modelTier: ModelTier;
  /** Maximum model calls before the loop forces a summary (default 10). */
  maxSteps?: number;
  /** Streaming and lifecycle callbacks. */
  callbacks: StreamCallbacks;
  /** Abort signal; the loop checks it between every step. */
  signal: AbortSignal;
}

/**
 * Builds a complete AgentContext from app-level state.
 *
 * 1. Searches memory for relevant past context (`memoryManager.search`) and
 *    merges persistent `GLOBAL.md` facts.
 * 2. Builds the system prompt from active skills, memories, and today's date
 *    (via `inference/prompts.buildSystemPrompt`), appending each active
 *    skill's full instructions.
 * 3. Resolves tool definitions from the enabled skills.
 * 4. Constructs the message array: `[system, ...history, user]`.
 * 5. Returns a `toolExecutor` that routes tool calls through the skill
 *    registry (throwing on error so the loop can feed failures back).
 *
 * Memory failures are best-effort: when recall fails the context is built
 * without memories rather than throwing.
 *
 * @param options - the app-level state
 * @returns a complete agent context ready for `agentLoop`
 */
export async function buildAgentContext(
  options: BuildContextOptions,
): Promise<AgentContext> {
  const {
    userMessage,
    conversationHistory,
    skillRegistry = globalRegistry,
    enabledSkills,
    memoryManager,
    modelTier,
    maxSteps = DEFAULT_MAX_STEPS,
    callbacks,
    signal,
  } = options;

  // 1. Retrieve relevant memories (RAG) + persistent facts.
  const memories: string[] = [];
  try {
    const results = await memoryManager.search(userMessage, MEMORY_TOP_K);
    for (const result of results) {
      if (result.score >= MEMORY_SCORE_THRESHOLD) {
        memories.push(result.entry.text);
      }
    }
  } catch {
    // Memory search is best-effort.
  }
  try {
    const facts = await memoryManager.recall();
    for (const fact of facts) {
      if (!memories.includes(fact)) memories.push(fact);
    }
  } catch {
    // GLOBAL.md recall is best-effort.
  }

  // 2. Resolve active skills and build the system prompt.
  const activeSkills = Array.from(enabledSkills ?? [])
    .map((name) => skillRegistry.get(name))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== undefined);

  const systemPrompt = buildAgentSystemPrompt(activeSkills, memories);

  // 3. Resolve tools from enabled skills.
  const tools = skillRegistry.getToolsForSkills(enabledSkills ?? new Set());

  // 4. Tool executor routing through the skill registry.
  const toolExecutor = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const result = await skillRegistry.execute({
      id: randomId(),
      name,
      arguments: args ?? {},
      skillName: skillRegistry.findSkillForTool(name) ?? '',
    });
    if (result.error) throw new Error(result.error);
    return result.result;
  };

  // 5. Assemble messages: [system, ...history, user].
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(conversationHistory) ? conversationHistory : []),
    { role: 'user', content: userMessage ?? '' },
  ];

  return {
    systemPrompt,
    messages,
    tools,
    toolExecutor,
    modelTier,
    maxSteps,
    memories,
    callbacks,
    signal,
  };
}

/**
 * Build the full system prompt: base prompt (skills, memories, date) plus
 * each active skill's freeform instructions.
 */
function buildAgentSystemPrompt(
  activeSkills: { metadata: import('../skills/types').SkillMetadata; instructions: string }[],
  memories: string[],
): string {
  const base = buildSystemPrompt({
    activeSkills: activeSkills.map((skill) => skill.metadata),
    memories,
  });

  const instructionBlocks: string[] = [];
  for (const skill of activeSkills) {
    const instructions = skill.instructions?.trim();
    if (instructions) {
      instructionBlocks.push(`## Skill instructions: ${skill.metadata.name}\n${instructions}`);
    }
  }

  if (instructionBlocks.length === 0) return base;
  return `${base}\n\n${instructionBlocks.join('\n\n')}`;
}
