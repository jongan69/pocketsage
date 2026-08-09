import { create } from 'zustand';
import * as FileSystem from 'expo-file-system';
import {
  createVectorStore,
  MemoryManager,
  type SearchResult,
} from '@pocketsage/agent-runtime';

export type MemoryStore = ReturnType<typeof createMemoryStore>;

const DOC_DIR = FileSystem.documentDirectory ?? '';
const VECTOR_STORE_PATH = `${DOC_DIR}vector-store.json`;
const GLOBAL_MEMORY_PATH = `${DOC_DIR}GLOBAL.md`;

async function readFile(path: string): Promise<string> {
  return FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
}

async function writeFile(path: string, content: string): Promise<void> {
  await FileSystem.writeAsStringAsync(path, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}

function createMemoryStore() {
  return create<{
    manager: MemoryManager | null;
    isLoaded: boolean;
    persistentFacts: string[];

    initialize: () => Promise<void>;
    indexExchange: (userMessage: string, assistantResponse: string) => Promise<void>;
    search: (query: string, topK?: number) => Promise<SearchResult[]>;
    remember: (fact: string) => Promise<void>;
    clearAll: () => Promise<void>;
    exportMemories: () => Promise<string>;
  }>((set, get) => ({
    manager: null,
    isLoaded: false,
    persistentFacts: [],

    initialize: async () => {
      const store = createVectorStore();
      const manager = new MemoryManager(store, GLOBAL_MEMORY_PATH, {
        readFile,
        writeFile,
        fileExists,
      });

      // Load existing data
      try {
        await manager.load(VECTOR_STORE_PATH);
      } catch {
        // Start fresh
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
      await manager.save(VECTOR_STORE_PATH);
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
      const store = createVectorStore();
      await store.clear();
      try {
        await writeFile(GLOBAL_MEMORY_PATH, '');
        await writeFile(VECTOR_STORE_PATH, '');
      } catch {
        // Best effort
      }
      set({ persistentFacts: [] });
      // Re-initialize with empty store
      await get().initialize();
    },

    exportMemories: async () => {
      const { manager } = get();
      if (!manager) return '{}';
      const facts = await manager.recall();
      const store = manager['store'] as ReturnType<typeof createVectorStore>;
      return JSON.stringify({ facts, store: store?.toJSON?.() ?? '' }, null, 2);
    },
  }));
}

export const useMemoryStore = createMemoryStore();
