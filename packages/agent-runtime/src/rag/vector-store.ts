import type { SearchResult, VectorEntry } from '../types';
import { randomId } from '../utils';

/**
 * An in-memory vector store with cosine-similarity search.
 *
 * Entries are kept in an array. `search()` computes the cosine similarity
 * between the query vector and every stored entry, sorts the results
 * descending by score, and returns the top-K matches. Use `toJSON()` for
 * persistence and `VectorStore.fromJSON()` to restore.
 *
 * Behavior notes:
 * - Entries without an `id` receive a generated unique id on `add()`.
 * - Adding an entry whose `id` already exists replaces the previous entry.
 * - Empty (or all-zero) query vectors return `[]`. Empty or
 *   dimension-mismatched entry vectors score 0 and never crash the search.
 */
export interface VectorStore {
  /** Add a single entry, generating a unique `id` when not provided. */
  add(entry: VectorEntry): Promise<void>;
  /** Add multiple entries in one call. */
  addMany(entries: VectorEntry[]): Promise<void>;
  /**
   * Search for the entries most similar to `queryVector` using cosine
   * similarity, sorted descending by score. `topK` defaults to 3 and is
   * clamped to the store size.
   */
  search(queryVector: number[], options?: { topK?: number }): Promise<SearchResult[]>;
  /** Serialize all entries to a stable JSON string (for persistence). */
  toJSON(): string;
  /** Remove all entries. */
  clear(): void;
  /** Number of entries currently stored. */
  readonly size: number;
}

/** Default number of results returned by `search()`. */
const DEFAULT_TOP_K = 3;

/** Hard upper bound on `topK`, protecting against pathological callers. */
const MAX_TOP_K = 100;

/** Version of the JSON format emitted by `toJSON()`. */
const SERIALIZATION_VERSION = 1;

interface SerializableVectorStore {
  version: number;
  entries: VectorEntry[];
}

/**
 * Create an in-memory vector store.
 *
 * @returns a new, empty `VectorStore`
 */
export function createVectorStore(): VectorStore {
  return createVectorStoreInternal([]);
}

/**
 * Core store factory. `initialEntries` allows `VectorStore.fromJSON()` to
 * seed a store synchronously (the public `add` API is async).
 */
function createVectorStoreInternal(initialEntries: VectorEntry[]): VectorStore {
  const entries: VectorEntry[] = [...initialEntries];

  const upsert = (entry: VectorEntry): void => {
    const resolved: VectorEntry = {
      ...entry,
      id: entry.id && entry.id.length > 0 ? entry.id : randomId(),
      vector: Array.isArray(entry.vector) ? entry.vector : [],
    };
    const existingIndex = entries.findIndex((e) => e.id === resolved.id);
    if (existingIndex >= 0) {
      entries[existingIndex] = resolved;
    } else {
      entries.push(resolved);
    }
  };

  return {
    async add(entry: VectorEntry): Promise<void> {
      if (!entry || typeof entry !== 'object') {
        throw new Error('VectorStore.add expects a VectorEntry object');
      }
      upsert(entry);
    },

    async addMany(entriesToAdd: VectorEntry[]): Promise<void> {
      if (!Array.isArray(entriesToAdd)) {
        throw new Error('VectorStore.addMany expects an array of VectorEntry objects');
      }
      for (const entry of entriesToAdd) {
        upsert(entry);
      }
    },

    async search(queryVector: number[], options?: { topK?: number }): Promise<SearchResult[]> {
      if (!Array.isArray(queryVector) || queryVector.length === 0) return [];
      // A zero vector has no direction — every similarity would be 0, which
      // ranks nothing. Treat it like an empty query.
      if (queryVector.every((component) => component === 0)) return [];
      const topK = Math.min(
        Math.max(1, Math.floor(options?.topK ?? DEFAULT_TOP_K)),
        MAX_TOP_K,
        entries.length,
      );
      if (topK === 0) return [];

      return entries
        .map((entry) => ({ entry, score: cosineSimilarity(queryVector, entry.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ entry, score }) => ({ entry, score }));
    },

    toJSON(): string {
      // Stable format: entries sorted by id with a fixed key order, so the
      // same store always serializes to the same string.
      const payload: SerializableVectorStore = {
        version: SERIALIZATION_VERSION,
        entries: [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      };
      return JSON.stringify(payload, null, 2);
    },

    clear(): void {
      entries.length = 0;
    },

    get size(): number {
      return entries.length;
    },
  };
}

/**
 * Static `VectorStore` helpers.
 */
export namespace VectorStore {
  /**
   * Restore a vector store from the JSON produced by `toJSON()`.
   *
   * Accepts the canonical `{ version, entries }` format as well as a bare
   * array of entries (lenient). Malformed entries are skipped; entries
   * without a valid `id` receive generated ids. Throws a descriptive
   * `Error` when the input is not vector-store JSON at all.
   *
   * @param json - the serialized store
   * @returns a new `VectorStore` seeded with the serialized entries
   */
  export function fromJSON(json: string): VectorStore {
    if (typeof json !== 'string' || json.trim().length === 0) {
      throw new Error('VectorStore.fromJSON expects a non-empty JSON string');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(`VectorStore.fromJSON: invalid JSON (${(error as Error).message})`);
    }

    let rawEntries: unknown;
    if (Array.isArray(parsed)) {
      rawEntries = parsed;
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as SerializableVectorStore).entries)
    ) {
      rawEntries = (parsed as SerializableVectorStore).entries;
    } else {
      throw new Error(
        'VectorStore.fromJSON: unexpected format (expected { version, entries } or an entry array)',
      );
    }

    const validEntries: VectorEntry[] = [];
    for (const raw of rawEntries as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Partial<VectorEntry>;
      if (typeof entry.text !== 'string' || !Array.isArray(entry.vector)) continue;
      validEntries.push({
        id: typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : randomId(),
        text: entry.text,
        vector: entry.vector,
        metadata: entry.metadata,
      });
    }

    return createVectorStoreInternal(validEntries);
  }
}

/**
 * Cosine similarity between two vectors, normalized to the range [0, 1].
 * Returns 0 for dimension mismatches, empty vectors, or zero vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
