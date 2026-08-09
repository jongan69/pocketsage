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
// Shared base types. The tool/skill/vector types below (ToolDefinition,
// ToolCall, ToolResult, SkillMetadata, VectorEntry, SearchResult) are re-exported
// from their owning modules further down — the skill variants are structural
// supersets of the `types.ts` ones (skillName, durationMs, requiresConfirmation).
export type {
  Message,
  ModelTier,
  ModelInfo,
  ModelDownloadState,
  FinishReason,
  GenerationResult,
  StreamCallbacks,
  ChunkOptions,
  AgentContext,
  AgentResult,
  ResourceFetcherAdapter,
  ExecutorchConfig,
} from './types';

// ── ExecuTorch ────────────────────────────────────────────────────────────────
export {
  LLAMA3_2_1B_SPINQUANT,
  LLAMA3_2_3B_SPINQUANT,
  LOCAL_AI_MODEL_DOWNLOAD_BYTES,
  EXECUTORCH_RESOURCE_INTEGRITY,
  BUILT_IN_MODELS,
  LLMModule,
  executorchGlobal,
  hasExecutorchBindings,
  isExecutorchAvailable,
  ensureExecutorchInstalled,
  initExecutorch,
  getExecutorchResourceIntegrity,
  expectedExecutorchResourceBytes,
  minimumExecutorchResourceBytes,
  createResourceFetcher,
  createMemoryKV,
  AbortDownloadError,
  DownloadPausedError,
} from './executorch';
export type {
  ExecutorchResourceIntegrity,
  ResourceFetcher,
  ResourceSource,
  ProgressCallback,
  MemoryKVStore,
  CreateResourceFetcherOptions,
} from './executorch';

// ── Models ────────────────────────────────────────────────────────────────────
export {
  ModelManager,
  modelManager,
  getBuiltInModels,
  getRecommendedModel,
  getModelForRamBudget,
} from './models';

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
