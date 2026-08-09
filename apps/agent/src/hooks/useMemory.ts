import { useMemoryStore } from '@/stores/memory-store';

export function useMemory() {
  const store = useMemoryStore();

  return {
    search: store.search,
    remember: store.remember,
    facts: store.persistentFacts,
    clearAll: store.clearAll,
    isLoaded: store.isLoaded,
    exportMemories: store.exportMemories,
  };
}
