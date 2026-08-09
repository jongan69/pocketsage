import { create } from 'zustand';
import { File, Paths } from 'expo-file-system';
import {
  createVectorStore,
  MemoryManager,
  type SearchResult,
} from '@pocketsage/agent-runtime';
import type { VectorStore } from '@pocketsage/agent-runtime';

const memoryDir = Paths.document;
const vectorStoreFile = new File(memoryDir, 'vector-store.json');
const globalMemoryFile = new File(memoryDir, 'GLOBAL.md');

/** A fresh in-memory store used as the backing store for the MemoryManager. */
const createStore = (): VectorStore => createVectorStore();

interface MemoryState {
  manager: MemoryManager | null;
  isLoaded: boolean;
  persistentFacts: string[];

  // Actions
  initialize: () => Promise<void>;
  indexExchange: (userMessage: string, assistantResponse: string) => Promise<void>;
  search: (query: string, topK?: number) => Promise<SearchResult[]>;
  remember: (fact: string) => Promise<void>;
  clearAll: () => Promise<void>;
  exportMemories: () => Promise<string>;
}

// ── File I/O for the MemoryManager ─────────────────────────────────────────────

async function readFile(path: string): Promise<string> {
  const file = new File(path);
  if (!file.exists) return '';
  return file.text();
}

async function writeFile(path: string, content: string): Promise<void> {
  const file = new File(path);
  await file.write(content);
}

async function fileExists(path: string): Promise<boolean> {
  return new File(path).exists;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useMemoryStore = create<MemoryState>((set, get) => ({
  manager: null,
  isLoaded: false,
  persistentFacts: [],

  initialize: async () => {
    const store = createStore();
    const manager = new MemoryManager(store, globalMemoryFile.uri, {
      readFile,
      writeFile,
      fileExists,
    });

    // Load persisted memories (vector store + GLOBAL.md). A missing file is a
    // fresh start — not an error.
    try {
      await manager.load(vectorStoreFile.uri);
    } catch (error) {
      console.warn('[memory] No persisted memories yet', error);
    }

    try {
      const facts = await manager.recall();
      set({ manager, isLoaded: true, persistentFacts: facts });
    } catch {
      set({ manager, isLoaded: true });
    }
  },

  indexExchange: async (userMessage, assistantResponse) => {
    const { manager } = get();
    if (!manager) return;
    await manager.index(userMessage, assistantResponse);
    await manager.save(vectorStoreFile.uri);
  },

  search: async (query, topK = 3) => {
    const { manager } = get();
    if (!manager) return [];
    return manager.search(query, topK);
  },

  remember: async (fact) => {
    const { manager } = get();
    if (!manager) return;
    await manager.remember(fact);
    await manager.save(vectorStoreFile.uri);
    try {
      const facts = await manager.recall();
      set({ persistentFacts: facts });
    } catch {
      // Best effort
    }
  },

  clearAll: async () => {
    const { manager } = get();
    if (!manager) return;
    const store = manager['store'] as VectorStore | undefined;
    await store?.clear();
    try {
      if (globalMemoryFile.exists) await globalMemoryFile.write('');
      if (vectorStoreFile.exists) vectorStoreFile.delete();
    } catch {
      // Best effort
    }
    set({ persistentFacts: [] });
    // Re-initialize with an empty backing store.
    await get().initialize();
  },

  exportMemories: async () => {
    const { manager } = get();
    if (!manager) return '{}';
    const facts = await manager.recall();
    const store = manager['store'] as VectorStore | undefined;
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        facts,
        vectorStore: store?.toJSON?.() ?? '',
      },
      null,
      2,
    );
  },
}));

export type MemoryStore = typeof useMemoryStore;
