// Web stub — ExecuTorch is only available in native builds.
// Must be assignable wherever the real LLMModule is used.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LLMModule: any = null;

export function isExecutorchAvailable(): boolean {
  return false;
}

export function initExecutorch(_config: { resourceFetcher: unknown }): void {
  throw new Error('ExecuTorch is only available in signed native builds.');
}
