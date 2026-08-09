import { create } from 'zustand';
import type { ModelInfo, ModelDownloadState } from '@pocketsage/agent-runtime';
import { modelManager } from '@pocketsage/agent-runtime';
import { readJson, writeJson } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/constants';

interface ModelState {
  models: ModelInfo[];
  downloadStates: Record<string, ModelDownloadState>;
  activeModelId: string | null;
  isInitialized: boolean;
  initError: string | null;

  // Actions
  initialize: () => Promise<void>;
  setActiveModel: (id: string) => Promise<void>;
  downloadModel: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;

  // Derived
  activeModel: () => ModelInfo | null;
  isModelReady: () => boolean;
}

// ── Sync with the runtime's ModelManager ────────────────────────────────────────

const SYNC_INTERVAL_MS = 2_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Pulls download states and the active model from the ModelManager singleton
 * (which owns the actual download pipeline) into the store. Runs on a poll so
 * the UI stays in sync with library-driven state changes.
 */
function syncFromManager(): void {
  const state = useModelStore.getState();
  try {
    const models = modelManager.listModels();
    const downloadStates: Record<string, ModelDownloadState> = {};
    for (const m of models) {
      downloadStates[m.id] = modelManager.getModelState(m.id);
    }
    const activeModelId = modelManager.getActiveModel()?.id ?? null;

    const modelsChanged =
      models.map((m) => m.id).join(',') !== state.models.map((m) => m.id).join(',');
    const statesChanged = JSON.stringify(downloadStates) !== JSON.stringify(state.downloadStates);
    const activeChanged = activeModelId !== state.activeModelId;

    if (modelsChanged || statesChanged || activeChanged) {
      useModelStore.setState({ models, downloadStates, activeModelId });
    }
  } catch (error) {
    console.warn('[models] Failed to sync with ModelManager', error);
  }
}

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(syncFromManager, SYNC_INTERVAL_MS);
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  downloadStates: {},
  activeModelId: null,
  isInitialized: false,
  initError: null,

  initialize: async () => {
    if (get().isInitialized) return;
    try {
      await modelManager.initialize();
      const models = modelManager.listModels();
      const downloadStates: Record<string, ModelDownloadState> = {};
      for (const m of models) {
        downloadStates[m.id] = modelManager.getModelState(m.id);
      }
      set({ models, downloadStates, isInitialized: true, initError: null });

      // Restore the previously selected model (if it is still downloaded).
      const stored = await readJson<{ id: string } | null>(STORAGE_KEYS.ACTIVE_MODEL_ID, null);
      const active = modelManager.getActiveModel();
      if (!active && stored?.id && downloadStates[stored.id]?.status === 'downloaded') {
        try {
          await modelManager.setActiveModel(stored.id);
          set({ activeModelId: stored.id });
        } catch (error) {
          console.warn('[models] Could not restore active model', error);
        }
      } else if (active) {
        set({ activeModelId: active.id });
      }

      startPolling();
    } catch (error) {
      console.error('[models] initialize failed', error);
      set({
        isInitialized: true,
        initError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setActiveModel: async (id) => {
    try {
      await modelManager.setActiveModel(id);
      set({ activeModelId: id });
      await writeJson(STORAGE_KEYS.ACTIVE_MODEL_ID, { id });
    } catch (error) {
      console.warn('[models] setActiveModel failed', error);
      throw error;
    }
  },

  downloadModel: async (id) => {
    set((s) => ({
      downloadStates: { ...s.downloadStates, [id]: { status: 'downloading', progress: 0 } },
    }));
    try {
      await modelManager.downloadModel(id, (progress) => {
        set((s) => ({
          downloadStates: { ...s.downloadStates, [id]: { status: 'downloading', progress } },
        }));
      });
      set((s) => ({
        downloadStates: { ...s.downloadStates, [id]: { status: 'downloaded' } },
      }));
    } catch (error) {
      set((s) => ({
        downloadStates: {
          ...s.downloadStates,
          [id]: {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          },
        },
      }));
    }
  },

  cancelDownload: async (id) => {
    try {
      await modelManager.cancelDownload(id);
    } catch (error) {
      console.warn('[models] cancelDownload failed', error);
    }
    set((s) => ({
      downloadStates: { ...s.downloadStates, [id]: { status: 'not_downloaded' } },
    }));
  },

  deleteModel: async (id) => {
    try {
      await modelManager.deleteModel(id);
    } catch (error) {
      console.warn('[models] deleteModel failed', error);
    }
    set((s) => ({
      downloadStates: { ...s.downloadStates, [id]: { status: 'not_downloaded' } },
    }));
    set({ activeModelId: modelManager.getActiveModel()?.id ?? null });
  },

  activeModel: () => {
    const { models, activeModelId } = get();
    return models.find((m) => m.id === activeModelId) ?? null;
  },

  isModelReady: () => {
    const { activeModelId, downloadStates } = get();
    return activeModelId !== null && downloadStates[activeModelId]?.status === 'downloaded';
  },
}));

export type ModelStore = typeof useModelStore;
