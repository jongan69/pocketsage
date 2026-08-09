/**
 * @pocketsage/agent-runtime — On-device AI agent runtime for Expo/React Native.
 *
 * Pure TypeScript, zero React dependencies. Provides:
 * - ExecuTorch bridge, model management, and on-device inference
 * - RAG pipeline (chunking, embedding, vector store, memory manager)
 * - Skill system (SKILL.md parsing, skill registry, tool execution)
 * - Agent loop (multi-step tool-calling orchestration)
 */

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
  ResourceFetcherAdapter,
  ExecutorchConfig,
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
export type { ResourceFetcher } from './executorch';

// ── Models ────────────────────────────────────────────────────────────────────
export { ModelManager, modelManager, getBuiltInModels, getRecommendedModel } from './models';

// ── Inference ─────────────────────────────────────────────────────────────────
export { generateText, streamMessage, generateObject } from './inference';
export type { GenerateOptions, StreamOptions } from './inference';

// ── RAG ───────────────────────────────────────────────────────────────────────
export { chunkText, embed, createVectorStore, VectorStore, MemoryManager } from './rag';
export type {
  VectorEntry,
  SearchResult,
  VectorStoreInterface,
  MemoryFileSystem,
} from './rag';

// ── Skills ────────────────────────────────────────────────────────────────────
export { SkillRegistry, skillRegistry } from './skills';
export { parseSkillMd, loadSkillFromDirectory, loadSkillsFromDirectory } from './skills/loader';
export type { SkillLoaderOptions, ParsedSkillMd } from './skills/loader';
export type {
  Skill,
  SkillMetadata,
  Tool,
  ToolDefinition,
  ToolParameter,
  ToolCall,
  ToolResult,
} from './skills/types';

// ── Agent ─────────────────────────────────────────────────────────────────────
export { agentLoop, executeToolCalls } from './agent';
export type { AgentCallbacks, AgentToolCall, AgentToolResult } from './agent';
export { buildAgentContext } from './agent/context';
export type { BuildContextOptions } from './agent/context';
