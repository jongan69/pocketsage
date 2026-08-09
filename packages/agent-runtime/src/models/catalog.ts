/**
 * Model catalog helpers: built-in model listing and RAM-aware recommendation.
 */

import type { ModelInfo } from '../types';
import { BUILT_IN_MODELS } from '../executorch/model-config';

export { BUILT_IN_MODELS };

/** Default RAM assumption (4 GiB) when device memory cannot be measured. */
const DEFAULT_DEVICE_RAM_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Estimate the device's physical RAM in bytes.
 *
 * Uses `navigator.deviceMemory` (GiB, available in Chromium-based engines) on
 * web and in environments that expose it; falls back to 4 GiB elsewhere
 * (Hermes on React Native does not expose a memory-size API).
 */
export function estimateDeviceRamBytes(): number {
  const nav = (globalThis as { navigator?: { deviceMemory?: number } }).navigator;
  const gib = nav?.deviceMemory;
  if (typeof gib === 'number' && Number.isFinite(gib) && gib > 0) {
    return gib * 1024 ** 3;
  }
  return DEFAULT_DEVICE_RAM_BYTES;
}

/** Returns all built-in model definitions. */
export function getBuiltInModels(): ModelInfo[] {
  return [...BUILT_IN_MODELS];
}

/**
 * Returns the best model for this device: the largest built-in model whose
 * `minRamBytes` fits within the estimated device RAM. Returns `null` when no
 * built-in model fits (the device is below the minimum supported RAM).
 */
export function getRecommendedModel(): ModelInfo | null {
  return getModelForRamBudget(estimateDeviceRamBytes());
}

/**
 * Returns the largest model that fits within the given RAM budget (bytes),
 * or `null` if none of the built-in models fit.
 */
export function getModelForRamBudget(ramBudgetBytes: number): ModelInfo | null {
  if (BUILT_IN_MODELS.length === 0) return null;
  const fitting = BUILT_IN_MODELS.filter((m) => m.minRamBytes <= ramBudgetBytes);
  if (fitting.length === 0) return null;
  return fitting.reduce((a, b) => (a.minRamBytes > b.minRamBytes ? a : b));
}
