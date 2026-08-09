import React, { createContext, useContext, type ReactNode } from 'react';
import { useMemoryStore, type MemoryStore } from './memory-store';

const StoreContext = createContext<MemoryStore | null>(null);

export function MemoryStoreProvider({ children }: { children: ReactNode }) {
  const store = useMemoryStore;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useMemoryStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useMemoryStoreContext must be used within MemoryStoreProvider');
  return ctx;
}
