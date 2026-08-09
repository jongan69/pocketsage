import type { ModelInfo } from '../types';

// ── Model Sources ──────────────────────────────────────────────────────────────

const BASE_URL =
  'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.8.0';

// ── Model Config Objects ───────────────────────────────────────────────────────

export const LLAMA3_2_1B_SPINQUANT = {
  modelName: 'llama-3.2-1b-spinquant',
  modelSource: `${BASE_URL}/llama-3.2-1B/spinquant/llama3_2_spinquant.pte`,
  tokenizerSource: `${BASE_URL}/tokenizer.json`,
  tokenizerConfigSource: `${BASE_URL}/tokenizer_config.json`,
} as const;

export const LLAMA3_2_3B_SPINQUANT = {
  modelName: 'llama-3.2-3b-spinquant',
  modelSource: `${BASE_URL}/llama-3.2-3B/spinquant/llama3_2_3B_spinquant.pte`,
  tokenizerSource: `${BASE_URL}/tokenizer.json`,
  tokenizerConfigSource: `${BASE_URL}/tokenizer_config.json`,
} as const;

// ── Integrity Hashes ──────────────────────────────────────────────────────────

export const LOCAL_AI_MODEL_DOWNLOAD_BYTES = {
  fast: 1_135_951_488,
  balanced: 2_553_367_552,
} as const;

export const EXECUTORCH_RESOURCE_INTEGRITY: Readonly<
  Record<string, { bytes: number; sha256: string }>
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

export function getExecutorchResourceIntegrity(
  source: string,
): { bytes: number; sha256: string } | null {
  const canonical = source.split(/[?#]/, 1)[0];
  return EXECUTORCH_RESOURCE_INTEGRITY[canonical] ?? null;
}

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

export function minimumExecutorchResourceBytes(source: string): number {
  const integrity = getExecutorchResourceIntegrity(source);
  if (integrity) return integrity.bytes;
  if (source.toLowerCase().endsWith('.pte')) {
    return Math.floor(expectedExecutorchResourceBytes(source) * 0.75);
  }
  return 1_024;
}
