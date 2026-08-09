/**
 * Model configuration for the built-in Llama 3.2 ExecuTorch models.
 *
 * Models are published by Software Mansion under
 * `software-mansion/react-native-executorch-llama-3.2` (release v0.8.0) and
 * are downloaded from HuggingFace. Every resource is pinned by size and
 * SHA-256 in {@link EXECUTORCH_RESOURCE_INTEGRITY}; the resource fetcher
 * refuses to load anything not in the trusted manifest.
 */

import type { ModelInfo } from '../types';

// ── Model Sources ──────────────────────────────────────────────────────────────

const BASE_URL =
  'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.8.0';

// ── Model Config Objects ───────────────────────────────────────────────────────

/** Named sources for Llama 3.2 1B SpinQuant (the `fast` tier model). */
export const LLAMA3_2_1B_SPINQUANT = {
  modelName: 'llama-3.2-1b-spinquant',
  modelSource: `${BASE_URL}/llama-3.2-1B/spinquant/llama3_2_spinquant.pte`,
  tokenizerSource: `${BASE_URL}/tokenizer.json`,
  tokenizerConfigSource: `${BASE_URL}/tokenizer_config.json`,
} as const;

/** Named sources for Llama 3.2 3B SpinQuant (the `balanced` tier model). */
export const LLAMA3_2_3B_SPINQUANT = {
  modelName: 'llama-3.2-3b-spinquant',
  modelSource: `${BASE_URL}/llama-3.2-3B/spinquant/llama3_2_3B_spinquant.pte`,
  tokenizerSource: `${BASE_URL}/tokenizer.json`,
  tokenizerConfigSource: `${BASE_URL}/tokenizer_config.json`,
} as const;

// ── Integrity Hashes ──────────────────────────────────────────────────────────

/** Expected download size in bytes for each model tier. */
export const LOCAL_AI_MODEL_DOWNLOAD_BYTES = {
  fast: 1_135_951_488,
  balanced: 2_553_367_552,
} as const;

/**
 * One entry of the trusted release manifest: the exact byte size and SHA-256
 * hash of a model resource.
 */
export type ExecutorchResourceIntegrity = {
  bytes: number;
  sha256: string;
};

/**
 * The trusted release manifest: canonical resource URL → integrity info.
 * Every model resource must be listed here to be downloaded or loaded.
 */
export const EXECUTORCH_RESOURCE_INTEGRITY: Readonly<
  Record<string, ExecutorchResourceIntegrity>
> = {
  [`${BASE_URL}/llama-3.2-1B/spinquant/llama3_2_spinquant.pte`]: {
    bytes: LOCAL_AI_MODEL_DOWNLOAD_BYTES.fast,
    sha256: '998bf825f0990a4dad60fa2246f202011f76a297119811e2f717e0b787765710',
  },
  [`${BASE_URL}/llama-3.2-3B/spinquant/llama3_2_3B_spinquant.pte`]: {
    bytes: LOCAL_AI_MODEL_DOWNLOAD_BYTES.balanced,
    sha256: '55d7f829f13063331c3d421816128553b545847628e1f0c71f44a78cb9229271',
  },
  [`${BASE_URL}/tokenizer.json`]: {
    bytes: 9_906_781,
    sha256: '0b9897f5668a5d202662c4bab2be785eb987daf194b557315a690f3d2dff1ce0',
  },
  [`${BASE_URL}/tokenizer_config.json`]: {
    bytes: 54_527,
    sha256: '9c9a5f7314e24635f2f8bd4ba95cdf5d0dd443bdc3c5899c1a147acbacb35568',
  },
};

// ── Built-in Model Catalog ────────────────────────────────────────────────────

/** The built-in models shipped with the library. */
export const BUILT_IN_MODELS: ModelInfo[] = [
  {
    id: 'llama-3.2-1b-spinquant',
    name: 'Llama 3.2 1B SpinQuant',
    tier: 'fast',
    parameterCount: '1B',
    quantization: 'SpinQuant',
    sizeBytes: 1_135_951_488,
    contextWindow: 128_000,
    minRamBytes: 3 * 1024 * 1024 * 1024,
    downloadUrl: `${BASE_URL}/llama-3.2-1B/spinquant/llama3_2_spinquant.pte`,
    tokenizerUrl: `${BASE_URL}/tokenizer.json`,
    tokenizerConfigUrl: `${BASE_URL}/tokenizer_config.json`,
    sha256: '998bf825f0990a4dad60fa2246f202011f76a297119811e2f717e0b787765710',
    license: 'Llama 3.2 Community License',
  },
  {
    id: 'llama-3.2-3b-spinquant',
    name: 'Llama 3.2 3B SpinQuant',
    tier: 'balanced',
    parameterCount: '3B',
    quantization: 'SpinQuant',
    sizeBytes: 2_553_367_552,
    contextWindow: 128_000,
    minRamBytes: 5 * 1024 * 1024 * 1024,
    downloadUrl: `${BASE_URL}/llama-3.2-3B/spinquant/llama3_2_3B_spinquant.pte`,
    tokenizerUrl: `${BASE_URL}/tokenizer.json`,
    tokenizerConfigUrl: `${BASE_URL}/tokenizer_config.json`,
    sha256: '55d7f829f13063331c3d421816128553b545847628e1f0c71f44a78cb9229271',
    license: 'Llama 3.2 Community License',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up the trusted integrity info for a resource source URL.
 * Query fragments and search params are stripped before lookup.
 *
 * @returns The `{ bytes, sha256 }` manifest entry, or `null` if the source is
 *   not in the trusted release manifest.
 */
export function getExecutorchResourceIntegrity(
  source: string,
): ExecutorchResourceIntegrity | null {
  const canonical = source.split(/[?#]/, 1)[0];
  return EXECUTORCH_RESOURCE_INTEGRITY[canonical] ?? null;
}

/**
 * Expected download size in bytes for a resource source, used for disk-space
 * checks. Falls back to heuristics for unknown-but-plausible sources.
 */
export function expectedExecutorchResourceBytes(source: string): number {
  const integrity = getExecutorchResourceIntegrity(source);
  if (integrity) return integrity.bytes;

  const normalized = source.toLowerCase();
  if (normalized.includes('llama-3.2-3b') || normalized.includes('llama3_2_3b')) {
    return LOCAL_AI_MODEL_DOWNLOAD_BYTES.balanced;
  }
  if (normalized.includes('llama-3.2-1b') || normalized.includes('llama3_2_1b')) {
    return LOCAL_AI_MODEL_DOWNLOAD_BYTES.fast;
  }
  return 64 * 1024 * 1024;
}

/**
 * Minimum size (bytes) a resource file must have to be treated as a plausible
 * complete download. Used by `hasResource` and the download completeness check
 * to avoid re-hashing truncated files.
 */
export function minimumExecutorchResourceBytes(source: string): number {
  const integrity = getExecutorchResourceIntegrity(source);
  if (integrity) return integrity.bytes;
  if (source.toLowerCase().endsWith('.pte')) {
    return Math.floor(expectedExecutorchResourceBytes(source) * 0.75);
  }
  return 1_024;
}
