/**
 * Web stub for the ExecuTorch runtime.
 *
 * ExecuTorch requires a signed native build (iOS/Android). On web this module
 * mirrors the API surface of `runtime.native.ts` with inert implementations so
 * that the rest of the library typechecks and behaves predictably in browsers,
 * Node, and tests:
 *
 * - {@link LLMModule} is `null`.
 * - {@link isExecutorchAvailable} returns `false`.
 * - {@link initExecutorch}, {@link ensureExecutorchInstalled} throw.
 * - {@link hasExecutorchBindings} returns `false`.
 *
 * Metro resolves `./runtime` to this file on web and to `runtime.native.ts`
 * on native; both files must export the same API.
 */

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

/**
 * The ExecuTorch LLM module. On web this is always `null` — use
 * {@link isExecutorchAvailable} before relying on it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const LLMModule: any = null;

/** `globalThis` typed as the ExecuTorch global scope. On web it has no bindings. */
export function executorchGlobal(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

/** Whether the native ExecuTorch JSI bindings are present. Always `false` on web. */
export function hasExecutorchBindings(): boolean {
  return false;
}

/**
 * Whether ExecuTorch is available in this environment.
 * Always `false` on web.
 */
export function isExecutorchAvailable(): boolean {
  return false;
}

/**
 * Install the ExecuTorch JSI bindings. Throws on web.
 */
export function ensureExecutorchInstalled(): boolean {
  throw new Error('ExecuTorch is only available in signed native builds.');
}

/**
 * Initialize the ExecuTorch runtime with a resource fetcher.
 * Throws on web — ExecuTorch cannot run in this environment.
 */
export function initExecutorch(_config: ExecutorchConfig): void {
  throw new Error('ExecuTorch is only available in signed native builds.');
}
