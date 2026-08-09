import type { ModelInfo } from '../types';
import { BUILT_IN_MODELS } from '../executorch/model-config';

export { BUILT_IN_MODELS };

/** Returns all built-in model definitions. */
export function getBuiltInModels(): ModelInfo[] {
  return [...BUILT_IN_MODELS];
}

/**
 * Returns the largest model the device is likely to run,
 * or the fast model as a safe default.
 *
 * Uses a simple heuristic: if the device reports sufficient
 * memory (or if we can't determine RAM), recommend the 1B model.
 * The 3B model requires ~5GB free RAM.
 */
export function getRecommendedModel(): ModelInfo | null {
  if (BUILT_IN_MODELS.length === 0) return null;
  // Default to the fast (1B) model — safe on all supported devices.
  const fast = BUILT_IN_MODELS.find((m) => m.tier === 'fast');
  return fast ?? BUILT_IN_MODELS[0];
}

/**
 * Returns the best model that fits within the given RAM budget (in bytes).
 * If none fit, returns the smallest model.
 */
export function getModelForRamBudget(ramBudgetBytes: number): ModelInfo | null {
  if (BUILT_IN_MODELS.length === 0) return null;
  const fitting = BUILT_IN_MODELS.filter((m) => m.minRamBytes <= ramBudgetBytes);
  if (fitting.length > 0) {
    // Return the largest fitting model
    return fitting.reduce((a, b) => (a.minRamBytes > b.minRamBytes ? a : b));
  }
  // Return the smallest model as fallback
  return BUILT_IN_MODELS.reduce((a, b) => (a.minRamBytes < b.minRamBytes ? a : b));
}
