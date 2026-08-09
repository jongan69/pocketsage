import type { ReactNode } from 'react';
import { ConversationStoreProvider } from '@/stores/conversation-store-provider';
import { ModelStoreProvider } from '@/stores/model-store-provider';
import { SkillStoreProvider } from '@/stores/skill-store-provider';
import { MemoryStoreProvider } from '@/stores/memory-store-provider';
import { useConversationStore } from '@/stores/conversation-store';
import { useModelStore } from '@/stores/model-store';
import { useSkillStore } from '@/stores/skill-store';
import { useMemoryStore } from '@/stores/memory-store';

/**
 * Composes the four store providers. Each provider exposes its store through
 * context so any subtree can access it; the stores themselves are Zustand
 * singletons that also work without context.
 */
export function StoreProviders({ children }: { children: ReactNode }) {
  return (
    <ConversationStoreProvider>
      <ModelStoreProvider>
        <SkillStoreProvider>
          <MemoryStoreProvider>{children}</MemoryStoreProvider>
        </SkillStoreProvider>
      </ModelStoreProvider>
    </ConversationStoreProvider>
  );
}

const DEFAULT_INIT_TIMEOUT_MS = 20_000;

/**
 * Initializes all four stores (SQLite conversations, model manager, bundled
 * skills + preferences, memory files). Resolves once every store has
 * finished or the timeout elapses, so a slow/blocked subsystem (e.g. a model
 * download probe) can never hang the app's boot.
 */
export async function initializeStores(timeoutMs: number = DEFAULT_INIT_TIMEOUT_MS): Promise<void> {
  const initialization = Promise.allSettled([
    useConversationStore.getState().initialize(),
    useModelStore.getState().initialize(),
    useSkillStore.getState().initialize(),
    useMemoryStore.getState().initialize(),
  ]);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([initialization, timeout]);
}
