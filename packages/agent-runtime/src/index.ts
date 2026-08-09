// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  Message,
  ModelTier,
  ModelInfo,
  ModelDownloadState,
  ToolDefinition,
  ToolCall,
  ToolResult,
  FinishReason,
  GenerationResult,
  StreamCallbacks,
  ChunkOptions,
  VectorEntry,
  SearchResult,
  SkillMetadata,
  AgentContext,
  AgentResult,
} from './types';

// ── ExecuTorch ────────────────────────────────────────────────────────────────
export {
  LLAMA3_2_1B_SPINQUANT,
  LLAMA3_2_3B_SPINQUANT,
  BUILT_IN_MODELS,
  LLMModule,
  isExecutorchAvailable,
  initExecutorch,
  createResourceFetcher,
} from './executorch';
export type { ExecutorchConfig, ResourceFetcher } from './executorch';

// ── Models ────────────────────────────────────────────────────────────────────
export { ModelManager, modelManager, getBuiltInModels, getRecommendedModel } from './models';

// ── Inference ─────────────────────────────────────────────────────────────────
export { generateText, streamMessage, generateObject } from './inference';
export type { GenerateOptions, StreamOptions } from './inference';

// ── RAG ───────────────────────────────────────────────────────────────────────
export { chunkText, embed, createVectorStore, VectorStore, MemoryManager } from './rag';

// ── Skills ────────────────────────────────────────────────────────────────────
export { SkillRegistry, skillRegistry } from './skills';
export { parseSkillMd } from './skills/loader';
export type { Skill, SkillTool, SkillToolDefinition, ToolCallRequest, ToolCallResult } from './skills/types';

// ── Agent ─────────────────────────────────────────────────────────────────────
export { agentLoop } from './agent';
export { buildAgentContext } from './agent/context';
export type { BuildContextOptions } from './agent/context';
