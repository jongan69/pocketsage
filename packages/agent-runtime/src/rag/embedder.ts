/**
 * Text embedding via ExecuTorch's text embedding module.
 *
 * The embedding module lives in `react-native-executorch` (a peer dependency,
 * native builds only). On web the module cannot exist, so `embed()` throws an
 * `Error` with `code === 'DEVICE_NOT_SUPPORTED'` — callers such as
 * `MemoryManager` catch this and degrade gracefully.
 *
 * If the native module exists but the embedding model cannot be loaded or
 * invoked (not downloaded, init failed, unexpected output shape), `embed()`
 * falls back to zero vectors of a reasonable dimension and logs a warning,
 * rather than failing the whole pipeline.
 */

/**
 * Fallback embedding dimension used when the embedding model is unavailable.
 * 384 is the common output dimension of small sentence-transformer style
 * models (e.g. all-MiniLM-L6-v2).
 */
const FALLBACK_EMBEDDING_DIMENSION = 384;

/**
 * Duck-typed shape of a text embedding model instance as exported by
 * `react-native-executorch`. The exact method names vary between versions, so
 * we probe for whichever inference method is present at runtime.
 */
interface TextEmbeddingModel {
  forward?: (...args: unknown[]) => Promise<unknown> | unknown;
  generate?: (...args: unknown[]) => Promise<unknown> | unknown;
  predict?: (...args: unknown[]) => Promise<unknown> | unknown;
  embed?: (...args: unknown[]) => Promise<unknown> | unknown;
  getTextEmbedding?: (...args: unknown[]) => Promise<unknown> | unknown;
}

let embeddingModelPromise: Promise<TextEmbeddingModel> | null = null;

/**
 * True when the current platform is a browser / web environment.
 *
 * React Native exposes a `navigator` with `product === 'ReactNative'`; plain
 * browsers have a `document`. Node and Bun expose neither, so they take the
 * native code path and fall back gracefully when the import fails.
 */
function isWebPlatform(): boolean {
  try {
    if (typeof document !== 'undefined') return true;
    if (typeof window !== 'undefined') {
      const navigator = (window as { navigator?: { product?: string } }).navigator;
      if (!navigator || navigator.product !== 'ReactNative') return true;
    }
  } catch {
    // ignore detection failures — treat as non-web and let the import fail gracefully
  }
  return false;
}

/**
 * Create the `DEVICE_NOT_SUPPORTED` error thrown on web.
 */
function deviceNotSupportedError(): Error & { code: string } {
  const error = new Error(
    'Text embedding requires a native build with ExecuTorch; the web platform is not supported.'
  ) as Error & { code: string };
  error.code = 'DEVICE_NOT_SUPPORTED';
  return error;
}

/**
 * Load (and cache) the text embedding model from `react-native-executorch`.
 *
 * The resolved promise is cached after the first successful load, so repeated
 * `embed()` calls reuse the model instance. Throws `DEVICE_NOT_SUPPORTED` on
 * web, or any error thrown by the native module when the model cannot be
 * initialized.
 */
async function loadEmbeddingModel(): Promise<TextEmbeddingModel> {
  if (!embeddingModelPromise) {
    embeddingModelPromise = (async () => {
      if (isWebPlatform()) {
        throw deviceNotSupportedError();
      }
      // @ts-ignore — react-native-executorch is an optional peer dependency
      // resolved at runtime; it does not exist in web/Node/bun builds.
      const rne = (await import('react-native-executorch')) as Record<string, unknown>;

      // 1. Prefer an already-initialized embedding module instance.
      const existing =
        rne.textEmbedding ?? rne.TextEmbeddingModule ?? rne.embeddingModel ?? rne.EmbeddingModule;
      if (existing && typeof existing === 'object') {
        return existing as TextEmbeddingModel;
      }

      // 2. Fall back to an init function exported by the package. The exact
      //    signature varies by version; best-effort defaults are used and any
      //    failure surfaces to the caller, which degrades to zero vectors.
      const initFn = (rne.initTextEmbedding ?? rne.initTextEmbeddingModule) as
        | ((...args: unknown[]) => Promise<unknown> | unknown)
        | undefined;
      if (typeof initFn === 'function') {
        const initialized = await initFn('text_embedding', 'fromBundledAsset', '');
        if (initialized && typeof initialized === 'object') {
          return initialized as TextEmbeddingModel;
        }
      }

      throw new Error('react-native-executorch does not expose a text embedding module');
    })();
  }
  return embeddingModelPromise;
}

/**
 * Invoke the model for a single text and coerce the output into a flat
 * `number[]` vector.
 *
 * Output shapes seen in the wild: `number[]`, `number[][]` (take the first
 * row), `{ toJs(): number[] }` (executorch tensor wrapper), and plain objects
 * carrying `data`, `vector` or `embedding` arrays.
 */
async function embedText(model: TextEmbeddingModel, text: string): Promise<number[]> {
  const fn = model.forward ?? model.getTextEmbedding ?? model.embed ?? model.predict ?? model.generate;
  if (typeof fn !== 'function') {
    throw new Error('Embedding model has no callable inference method');
  }
  const output = await fn.call(model, text);
  const vector = vectorFromOutput(output);
  if (!Array.isArray(vector)) {
    throw new Error('Embedding module returned an unexpected output shape');
  }
  return vector;
}

/**
 * Coerce an arbitrary model output into a flat number array, or `null` when
 * the shape cannot be interpreted.
 */
function vectorFromOutput(output: unknown): number[] | null {
  if (Array.isArray(output)) {
    if (output.length === 0) return [];
    if (Array.isArray(output[0])) {
      // matrix output — take the first row (single-token / pooled embedding)
      return output[0] as number[];
    }
    return output as number[];
  }
  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>;
    if (typeof record.toJs === 'function') {
      return vectorFromOutput((record.toJs as () => unknown)());
    }
    if (Array.isArray(record.data)) return vectorFromOutput(record.data);
    if (Array.isArray(record.vector)) return vectorFromOutput(record.vector);
    if (Array.isArray(record.embedding)) return vectorFromOutput(record.embedding);
  }
  return null;
}

/**
 * Create a zero vector of the given dimension.
 */
function zeroVector(dimension: number): number[] {
  return new Array(dimension).fill(0);
}

/**
 * Pad (with zeros) or truncate a vector to the target dimension.
 */
function resizeVector(vector: number[], dimension: number): number[] {
  if (vector.length === dimension) return vector;
  const resized = new Array(dimension).fill(0);
  const copyLength = Math.min(vector.length, dimension);
  for (let i = 0; i < copyLength; i++) {
    resized[i] = vector[i];
  }
  return resized;
}

/**
 * Generate embedding vectors for the given texts using ExecuTorch's text
 * embedding module.
 *
 * - On native: dynamically imports `react-native-executorch`, loads the
 *   embedding model once and caches it for subsequent calls.
 * - On web: throws an `Error` with `code === 'DEVICE_NOT_SUPPORTED'`.
 * - Graceful degradation: if the embedding module cannot be loaded or a single
 *   text fails to embed, the affected text(s) receive zero vectors of a
 *   reasonable dimension (384) and a warning is logged. The returned array
 *   always has the same length as the input, and every vector has the same
 *   dimension.
 *
 * @param texts - the texts to embed
 * @returns one vector per input text, in order
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  let model: TextEmbeddingModel;
  try {
    model = await loadEmbeddingModel();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'DEVICE_NOT_SUPPORTED') {
      throw error;
    }
    console.warn(
      '[agent-runtime] Text embedding module unavailable; returning zero-vector fallback.',
      error
    );
    return texts.map(() => zeroVector(FALLBACK_EMBEDDING_DIMENSION));
  }

  const vectors: number[][] = [];
  let dimension = 0;

  for (const text of texts) {
    try {
      const vector = await embedText(model, text);
      if (vector.length === 0) {
        vectors.push(zeroVector(FALLBACK_EMBEDDING_DIMENSION));
      } else {
        vectors.push(vector);
        if (dimension === 0) dimension = vector.length;
      }
    } catch (error) {
      console.warn(
        `[agent-runtime] Failed to embed text (${text.slice(0, 40)}…); using zero-vector fallback.`,
        error
      );
      vectors.push(zeroVector(FALLBACK_EMBEDDING_DIMENSION));
    }
  }

  // Normalize every vector to the dimension of the first successful embedding
  // so consumers (cosine similarity) never see mixed-length vectors.
  if (dimension > 0) {
    for (let i = 0; i < vectors.length; i++) {
      if (vectors[i].length !== dimension) {
        vectors[i] = resizeVector(vectors[i], dimension);
      }
    }
  }

  return vectors;
}
