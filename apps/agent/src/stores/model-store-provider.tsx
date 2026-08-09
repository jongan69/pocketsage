import React, { createContext, useContext, type ReactNode } from 'react';
import { useModelStore, type ModelStore } from './model-store';

const StoreContext = createContext<ModelStore | null>(null);

export function ModelStoreProvider({ children }: { children: ReactNode }) {
  const store = useModelStore;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useModelStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useModelStoreContext must be used within ModelStoreProvider');
  return ctx;
}
