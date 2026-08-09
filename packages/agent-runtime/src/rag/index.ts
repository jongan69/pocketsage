/**
 * RAG pipeline — Retrieval Augmented Generation.
 *
 * - `chunkText` — split text into overlapping, sentence-aware chunks
 * - `embed` — text → embedding vectors via ExecuTorch
 * - `createVectorStore` / `VectorStore` — in-memory cosine-similarity store
 *   with JSON persistence (`toJSON()` / `VectorStore.fromJSON()`)
 * - `MemoryManager` — persistent conversation memory (vector store +
 *   OpenMinis-compatible `GLOBAL.md` facts)
 */

export { chunkText } from './chunker';
export { embed } from './embedder';
export { createVectorStore, VectorStore } from './vector-store';
export type { VectorStore as VectorStoreInterface } from './vector-store';
export { MemoryManager } from './memory-manager';
export type { MemoryFileSystem } from './memory-manager';
export type { VectorEntry, SearchResult } from '../types';
