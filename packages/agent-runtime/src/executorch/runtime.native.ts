/**
 * Native ExecuTorch runtime.
 *
 * Requires a custom native build with the react-native-executorch JSI
 * bindings installed (a plain Expo Go build will not include them). On
 * native platforms Metro resolves `./runtime` to this file.
 *
 * Responsibilities:
 * - detect the JSI bindings on the global scope (`hasExecutorchBindings`)
 * - install them once via `ETInstallerNativeModule.install()`
 *   (`ensureExecutorchInstalled`)
 * - register the host's resource fetcher adapter so the native modules can
 *   resolve model files (`initExecutorch`)
 * - re-export the {@link LLMModule} class and the model configs
 */

import { LLMModule as NativeLLMModule } from 'react-native-executorch/src/modules/natural_language_processing/LLMModule';
import { ETInstallerNativeModule } from 'react-native-executorch/src/native/RnExecutorchModules';
import { ResourceFetcher } from 'react-native-executorch/src/utils/ResourceFetcher';

import type { ExecutorchConfig } from '../types';

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

export type { ExecutorchConfig };

// ── JSI Global Check ──────────────────────────────────────────────────────────

/**
 * The global bindings installed by react-native-executorch. When all of these
 * are present on `globalThis` the runtime is ready.
 */
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

/** `globalThis` typed as the ExecuTorch global scope. */
export function executorchGlobal(): ExecuTorchGlobalScope {
  return globalThis as ExecuTorchGlobalScope;
}

/** Whether the ExecuTorch JSI bindings are already installed on the global scope. */
export function hasExecutorchBindings(): boolean {
  const scope = executorchGlobal();
  return REQUIRED_EXECUTORCH_GLOBALS.every((key) => scope[key] != null);
}

/**
 * Install the ExecuTorch JSI bindings if they are missing, and report whether
 * the ExecuTorch module loader is available afterwards.
 */
export function ensureExecutorchInstalled(): boolean {
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

/** Whether ExecuTorch is available in this environment (installs bindings if needed). */
export function isExecutorchAvailable(): boolean {
  try {
    return ensureExecutorchInstalled();
  } catch {
    return false;
  }
}

/**
 * Initialize the ExecuTorch runtime: register the resource fetcher adapter
 * (so the native modules can download/resolve model files) and ensure the
 * JSI bindings are installed.
 */
export function initExecutorch(config: ExecutorchConfig): void {
  ResourceFetcher.setAdapter(config.resourceFetcher);
  ensureExecutorchInstalled();
}

/** The native ExecuTorch LLM module class. */
export { NativeLLMModule as LLMModule };
