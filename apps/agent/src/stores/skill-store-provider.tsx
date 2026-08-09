import React, { createContext, useContext, type ReactNode } from 'react';
import { useSkillStore, type SkillStore } from './skill-store';

const StoreContext = createContext<SkillStore | null>(null);

export function SkillStoreProvider({ children }: { children: ReactNode }) {
  const store = useSkillStore;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useSkillStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useSkillStoreContext must be used within SkillStoreProvider');
  return ctx;
}
