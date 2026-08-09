import type { SearchResult, VectorEntry } from '../types';
import { createDefaultFileSystem, joinPath, type ReadWriteFileSystem } from '../utils';
import { chunkText } from './chunker';
import { embed } from './embedder';
import { VectorStore, type VectorStore as VectorStoreInterface } from './vector-store';

/**
 * File I/O dependency accepted by {@link MemoryManager}. Hosts (e.g. an Expo
 * app) typically provide an adapter built on `expo-file-system`; on Node/Bun
 * a default adapter backed by `node:fs/promises` is used automatically.
 */
export interface MemoryFileSystem {
  /** Read a file as UTF-8 text. Rejects when the file does not exist. */
  readFile(path: string): Promise<string>;
  /** Write UTF-8 text to a file, creating parent directories as needed. */
  writeFile(path: string, content: string): Promise<void>;
}

/** Default memory directory name when no `globalMemoryPath` is provided. */
const DEFAULT_MEMORY_PATH = 'memory';

/** File name of the persistent vector store inside the memory directory. */
const VECTOR_STORE_FILE = 'vector-store.json';

/** File name of the human-readable fact memory file. */
const GLOBAL_MD_FILE = 'GLOBAL.md';

/**
 * Manages persistent conversation memory using RAG.
 *
 * - `index()` chunks and embeds user/assistant exchanges into the vector
 *   store for semantic recall via `search()`.
 * - `remember()` / `recall()` maintain an OpenMinis-compatible `GLOBAL.md`
 *   fact file (`- [YYYY-MM-DD] fact text` lines).
 * - `save()` / `load()` persist the vector store to
 *   `{globalMemoryPath}/vector-store.json`.
 *
 * All disk access goes through a {@link MemoryFileSystem} adapter so the
 * class works on any platform. The default adapter uses `node:fs/promises`
 * on Node/Bun and an in-memory store (with a warning) elsewhere — hosts
 * should pass an `expo-file-system`-based adapter for durable persistence.
 *
 * Embedding failures degrade gracefully: `search()` returns `[]` and
 * `index()` stores text-only entries (zero vectors) rather than throwing.
 */
export class MemoryManager {
  private store: VectorStoreInterface;
  private readonly globalMemoryPath: string;
  private readonly fileSystem: MemoryFileSystem;

  /**
   * @param store - the vector store backing this manager's semantic memory
   * @param globalMemoryPath - directory containing `GLOBAL.md` and
   *   `vector-store.json`; defaults to `'memory'`
   * @param fileSystem - optional file I/O adapter; defaults to a
   *   Node/Bun-aware implementation (in-memory elsewhere)
   */
  constructor(store: VectorStoreInterface, globalMemoryPath?: string, fileSystem?: MemoryFileSystem) {
    this.store = store;
    this.globalMemoryPath = globalMemoryPath ?? DEFAULT_MEMORY_PATH;
    this.fileSystem = fileSystem ?? createDefaultFileSystem();
  }

  /**
   * Index a user→assistant exchange into the vector store.
   *
   * The exchange is chunked with `chunkText` and each chunk is embedded with
   * `embed`. When embeddings are unavailable, text-only entries (zero
   * vectors) are stored so nothing is lost.
   *
   * @param userMessage - the user's message
   * @param assistantResponse - the assistant's response
   */
  async index(userMessage: string, assistantResponse: string): Promise<void> {
    const exchange = `User: ${userMessage ?? ''}\nAssistant: ${assistantResponse ?? ''}`.trim();
    if (exchange.length === 0) return;

    const chunks = chunkText(exchange);
    if (chunks.length === 0) return;

    const timestamp = new Date().toISOString();
    let vectors: number[][] | null = null;
    try {
      vectors = await embed(chunks);
    } catch (error) {
      console.warn('[agent-runtime] Embedding unavailable; indexing exchange without vectors.', error);
    }

    const entries: VectorEntry[] = chunks.map((chunk, i) => ({
      id: '', // the store generates a unique id
      text: chunk,
      vector: vectors?.[i] ?? [],
      metadata: { type: 'conversation-exchange', timestamp },
    }));

    try {
      await this.store.addMany(entries);
    } catch (error) {
      console.warn('[agent-runtime] Failed to index conversation exchange.', error);
    }
  }

  /**
   * Search memory for the entries most relevant to `query`.
   *
   * The query is embedded and the vector store is searched with cosine
   * similarity. Returns `[]` when the query is empty or embeddings are
   * unavailable (graceful degradation — memory is auxiliary).
   *
   * @param query - the text to match against past conversations
   * @param topK - number of results (default 3)
   */
  async search(query: string, topK: number = 3): Promise<SearchResult[]> {
    const cleanQuery = (query ?? '').trim();
    if (cleanQuery.length === 0) return [];

    try {
      const vectors = await embed([cleanQuery]);
      const queryVector = vectors[0];
      if (!queryVector || queryVector.length === 0) return [];
      return await this.store.search(queryVector, { topK: Math.max(1, Math.floor(topK)) });
    } catch (error) {
      console.warn('[agent-runtime] Memory search failed; returning no memories.', error);
      return [];
    }
  }

  /**
   * Append a fact to the persistent `GLOBAL.md` fact file.
   *
   * Facts are stored as `- [YYYY-MM-DD] fact text` lines (OpenMinis-compatible
   * format). Failures are non-fatal: a warning is logged and the vector-store
   * memory remains unaffected.
   *
   * @param fact - the fact text to remember
   */
  async remember(fact: string): Promise<void> {
    const cleanFact = (fact ?? '').trim();
    if (cleanFact.length === 0) return;

    const line = `- [${new Date().toISOString().slice(0, 10)}] ${cleanFact}`;
    try {
      let content = '';
      try {
        content = await this.fileSystem.readFile(this.globalMdPath());
      } catch {
        // file does not exist yet — start fresh
      }
      const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
      await this.fileSystem.writeFile(this.globalMdPath(), content + separator + line + '\n');
    } catch (error) {
      console.warn('[agent-runtime] Failed to persist fact to GLOBAL.md.', error);
    }
  }

  /**
   * Read all persistent facts from `GLOBAL.md`.
   *
   * Parses `- [date] fact text` lines and returns the fact text portions in
   * file order. Returns `[]` when the file does not exist or cannot be read.
   */
  async recall(): Promise<string[]> {
    let content: string;
    try {
      content = await this.fileSystem.readFile(this.globalMdPath());
    } catch {
      return [];
    }

    const facts: string[] = [];
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('-')) continue;
      const match = line.match(/^-\s*\[[^\]]*\]\s*(.*)$/);
      const fact = (match ? match[1] : line.replace(/^-\s*/, '')).trim();
      if (fact.length > 0) facts.push(fact);
    }
    return facts;
  }

  /**
   * Persist the vector store to `{globalMemoryPath}/vector-store.json`.
   *
   * Failures are logged and re-thrown so callers can surface storage errors.
   */
  async save(): Promise<void> {
    const json = this.store.toJSON();
    try {
      await this.fileSystem.writeFile(this.vectorStorePath(), json);
    } catch (error) {
      console.warn('[agent-runtime] Failed to save vector store to disk.', error);
      throw error;
    }
  }

  /**
   * Load the vector store from `{globalMemoryPath}/vector-store.json`.
   *
   * Replaces the internal store when the file exists and parses cleanly.
   * A missing or corrupt file leaves the current store untouched (with a
   * warning for corrupt files) — the manager never fails to construct.
   */
  async load(): Promise<void> {
    let json: string;
    try {
      json = await this.fileSystem.readFile(this.vectorStorePath());
    } catch {
      return; // nothing persisted yet — keep the in-memory store as-is
    }

    try {
      this.store = VectorStore.fromJSON(json);
    } catch (error) {
      console.warn('[agent-runtime] Failed to parse persisted vector store; ignoring it.', error);
    }
  }

  /** Absolute path of the `GLOBAL.md` fact file. */
  private globalMdPath(): string {
    return joinPath(this.globalMemoryPath, GLOBAL_MD_FILE);
  }

  /** Absolute path of the persisted vector store JSON file. */
  private vectorStorePath(): string {
    return joinPath(this.globalMemoryPath, VECTOR_STORE_FILE);
  }
}
