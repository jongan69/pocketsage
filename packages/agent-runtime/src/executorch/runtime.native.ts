// Native ExecuTorch implementation.
// Requires a custom native build with react-native-executorch JSI bindings.

import { LLMModule as NativeLLMModule } from 'react-native-executorch/src/modules/natural_language_processing/LLMModule';
import { ETInstallerNativeModule } from 'react-native-executorch/src/native/RnExecutorchModules';
import { ResourceFetcher } from 'react-native-executorch/src/utils/ResourceFetcher';

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

// ── JSI Global Check ──────────────────────────────────────────────────────────

const REQUIRED_EXECUTORCH_GLOBALS = [
  'loadStyleTransfer',
  'loadSemanticSegmentation',
  'loadInstanceSegmentation',
  'loadTextToImage',
  'loadExecutorchModule',
  'loadClassification',
  'loadObjectDetection',
  'loadTokenizerModule',
  'loadTextEmbeddings',
  'loadImageEmbeddings',
  'loadVAD',
  'loadLLM',
  'loadSpeechToText',
  'loadTextToSpeechKokoro',
  'loadOCR',
  'loadVerticalOCR',
  '__rne_isEmulator',
] as const;

type ExecuTorchGlobalScope = typeof globalThis &
  Record<(typeof REQUIRED_EXECUTORCH_GLOBALS)[number], unknown>;

function executorchGlobal(): ExecuTorchGlobalScope {
  return globalThis as ExecuTorchGlobalScope;
}

function hasExecutorchBindings(): boolean {
  const scope = executorchGlobal();
  return REQUIRED_EXECUTORCH_GLOBALS.every((key) => scope[key] != null);
}

function ensureExecutorchInstalled(): boolean {
  if (!hasExecutorchBindings()) {
    if (!ETInstallerNativeModule) {
      throw new Error(
        'Failed to install react-native-executorch: the native module could not be found.',
      );
    }
    ETInstallerNativeModule.install();
  }
  return typeof executorchGlobal().loadExecutorchModule === 'function';
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function isExecutorchAvailable(): boolean {
  try {
    return ensureExecutorchInstalled();
  } catch {
    return false;
  }
}

export interface ExecutorchConfig {
  resourceFetcher: {
    fetch: (...args: unknown[]) => Promise<unknown>;
    readAsString: (path: string) => Promise<string>;
  };
}

export function initExecutorch(config: ExecutorchConfig): void {
  ResourceFetcher.setAdapter(config.resourceFetcher);
  ensureExecutorchInstalled();
}

export { NativeLLMModule as LLMModule };
