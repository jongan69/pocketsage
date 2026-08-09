import React, { createContext, useContext, type ReactNode } from 'react';
import { useConversationStore, type ConversationStore } from './conversation-store';

const StoreContext = createContext<ConversationStore | null>(null);

export function ConversationStoreProvider({ children }: { children: ReactNode }) {
  const store = useConversationStore;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useConversationStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useConversationStoreContext must be used within ConversationStoreProvider');
  return ctx;
}
