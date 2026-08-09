import { create } from 'zustand';
import { Directory, File, Paths } from 'expo-file-system';
import {
  createVectorStore,
  MemoryManager,
  type SearchResult,
  type VectorStore,
} from '@pocketsage/agent-runtime';

/**
 * Memory persistence layout (new expo-file-system API):
 *
 *   <document>/pocketsage-memory/
 *     ├── vector-store.json   # RAG vector store (via MemoryManager.save/load)
 *     └── GLOBAL.md           # human-readable facts (via MemoryManager.remember/recall)
 *
 * The MemoryManager derives both file paths from the directory URI, so this
 * store only owns the directory + the file I/O adapter.
 */

const memoryDirectory = new Directory(Paths.document, 'pocketsage-memory');

function ensureMemoryDirectory(): void {
  try {
    memoryDirectory.create({ intermediates: true, idempotent: true });
  } catch {
    // Already exists — reads still work.
  }
}

/** The vector store backing the current MemoryManager instance. */
let vectorStore: VectorStore | null = null;

// ── File I/O adapter for the MemoryManager ─────────────────────────────────────

async function readFile(path: string): Promise<string> {
  const file = new File(path);
  if (!file.exists) throw new Error(`File not found: ${path}`);
  return file.text();
}

async function writeFile(path: string, content: string): Promise<void> {
  ensureMemoryDirectory();
  await new File(path).write(content);
}

// ── Store ──────────────────────────────────────────────────────────────────────

export interface MemoryState {
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

export const useMemoryStore = create<MemoryState>((set, get) => ({
  manager: null,
  isLoaded: false,
  persistentFacts: [],

  initialize: async () => {
    const store = createVectorStore();
    vectorStore = store;
    const manager = new MemoryManager(store, memoryDirectory.uri, { readFile, writeFile });

    // Load persisted memories. A missing vector-store file is a fresh start
    // (load() returns silently); corrupt files are ignored with a warning.
    await manager.load();

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
    await manager.save();
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
    await manager.save();
    try {
      const facts = await manager.recall();
      set({ persistentFacts: facts });
    } catch {
      // Best effort.
    }
  },

  clearAll: async () => {
    const { manager } = get();
    if (!manager) return;
    await vectorStore?.clear();
    try {
      if (memoryDirectory.exists) {
        const globalMemoryFile = new File(memoryDirectory, 'GLOBAL.md');
        if (globalMemoryFile.exists) await globalMemoryFile.write('');
      }
    } catch {
      // Best effort.
    }
    await manager.save();
    set({ persistentFacts: [] });
  },

  exportMemories: async () => {
    const { manager } = get();
    if (!manager) return '{}';
    const facts = await manager.recall();
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        facts,
        vectorStore: vectorStore?.toJSON?.() ?? '',
      },
      null,
      2,
    );
  },
}));

export type MemoryStore = typeof useMemoryStore;
