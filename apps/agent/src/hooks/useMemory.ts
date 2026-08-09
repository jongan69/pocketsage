import { useCallback } from 'react';
import type { SearchResult } from '@pocketsage/agent-runtime';
import { useMemoryStore } from '@/stores/memory-store';

/**
 * React bindings for the memory store. Actions are stable references backed
 * by getState(); memory data is subscribed from the store directly.
 */
export function useMemory() {
  const manager = useMemoryStore((s) => s.manager);
  const isLoaded = useMemoryStore((s) => s.isLoaded);
  const persistentFacts = useMemoryStore((s) => s.persistentFacts);

  const search = useCallback(
    (query: string, topK?: number): Promise<SearchResult[]> =>
      useMemoryStore.getState().search(query, topK),
    [],
  );
  const remember = useCallback(
    (fact: string) => useMemoryStore.getState().remember(fact),
    [],
  );
  const indexExchange = useCallback(
    (userMessage: string, assistantResponse: string) =>
      useMemoryStore.getState().indexExchange(userMessage, assistantResponse),
    [],
  );
  const clearAll = useCallback(() => useMemoryStore.getState().clearAll(), []);
  const exportMemories = useCallback(() => useMemoryStore.getState().exportMemories(), []);

  return {
    manager,
    isLoaded,
    persistentFacts,
    search,
    remember,
    indexExchange,
    clearAll,
    exportMemories,
  };
}
