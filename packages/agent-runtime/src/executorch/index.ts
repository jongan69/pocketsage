/**
 * ExecuTorch bridge barrel: model configuration, the runtime (platform-
 * resolved), and the resource fetcher.
 */

export {
  LLAMA3_2_1B_SPINQUANT,
  LLAMA3_2_3B_SPINQUANT,
  BUILT_IN_MODELS,
  EXECUTORCH_RESOURCE_INTEGRITY,
  LOCAL_AI_MODEL_DOWNLOAD_BYTES,
  getExecutorchResourceIntegrity,
  expectedExecutorchResourceBytes,
  minimumExecutorchResourceBytes,
} from './model-config';
export type { ExecutorchResourceIntegrity } from './model-config';

// `./runtime` resolves to runtime.native.ts on native and runtime.ts on web —
// both export the same API.
export {
  LLMModule,
  executorchGlobal,
  hasExecutorchBindings,
  isExecutorchAvailable,
  ensureExecutorchInstalled,
  initExecutorch,
} from './runtime';
export type { ExecutorchConfig } from './runtime';

export { createResourceFetcher, createMemoryKV, AbortDownloadError } from './resource-fetcher';
export type {
  ResourceFetcher,
  ResourceSource,
  ProgressCallback,
  MemoryKVStore,
  CreateResourceFetcherOptions,
} from './resource-fetcher';
