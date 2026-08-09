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

export interface BuildContextOptions {
  userMessage: string;
  conversationHistory: Message[];
  skillRegistry?: SkillRegistry;
  enabledSkills: Set<string>;
  memoryManager: MemoryManager;
  modelTier: ModelTier;
  maxSteps?: number;
  callbacks: StreamCallbacks;
  signal: AbortSignal;
}

/**
 * Builds a complete AgentContext from app-level state.
 *
 * This is the bridge between the app (Zustand stores) and the agent runtime.
 * It assembles the system prompt, retrieves relevant memories via RAG,
 * resolves available tools from enabled skills, and constructs the full
 * message array ready for the agent loop.
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
    maxSteps = 10,
    callbacks,
    signal,
  } = options;

  // 1. Retrieve relevant memories
  let memories: string[] = [];
  try {
    const results = await memoryManager.search(userMessage, 3);
    memories = results
      .filter((r) => r.score > 0.3)
      .map((r) => r.entry.text);
  } catch {
    // Memory search is best-effort
  }

  // Also include persistent GLOBAL.md facts
  try {
    const facts = await memoryManager.recall();
    for (const fact of facts) {
      if (!memories.includes(fact)) {
        memories.push(fact);
      }
    }
  } catch {
    // GLOBAL.md recall is best-effort
  }

  // 2. Resolve active skills metadata
  const activeSkillsMetadata = skillRegistry
    .listMetadata()
    .filter((s) => enabledSkills.has(s.name));

  // 3. Build system prompt
  const systemPrompt = buildSystemPrompt({
    activeSkills: activeSkillsMetadata,
    memories,
  });

  // 4. Resolve tools from enabled skills
  const tools = skillRegistry.getToolsForSkills(enabledSkills);

  // 5. Build tool executor function
  const toolExecutor = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const result = await skillRegistry.execute({
      id: `tc_${Date.now()}`,
      name,
      arguments: args,
      skillName: '',
    });
    if (result.error) throw new Error(result.error);
    return result.result;
  };

  // 6. Assemble messages
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
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
