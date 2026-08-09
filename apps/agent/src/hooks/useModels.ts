import { useCallback, useMemo } from 'react';
import type { ModelDownloadState } from '@pocketsage/agent-runtime';
import { useModelStore } from '@/stores/model-store';

/**
 * React bindings for the model store. All derived values are memoized from
 * subscribed state; actions are stable references backed by getState().
 */
export function useModels() {
  const models = useModelStore((s) => s.models);
  const downloadStates = useModelStore((s) => s.downloadStates);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const isInitialized = useModelStore((s) => s.isInitialized);
  const initError = useModelStore((s) => s.initError);

  const activeModel = useMemo(
    () => models.find((m) => m.id === activeModelId) ?? null,
    [models, activeModelId],
  );

  const isReady = useMemo(
    () => activeModelId !== null && downloadStates[activeModelId]?.status === 'downloaded',
    [activeModelId, downloadStates],
  );

  const setActiveModel = useCallback(
    (id: string) => useModelStore.getState().setActiveModel(id),
    [],
  );
  const downloadModel = useCallback(
    (id: string) => useModelStore.getState().downloadModel(id),
    [],
  );
  const cancelDownload = useCallback(
    (id: string) => useModelStore.getState().cancelDownload(id),
    [],
  );
  const deleteModel = useCallback(
    (id: string) => useModelStore.getState().deleteModel(id),
    [],
  );
  const downloadState = useCallback(
    (id: string): ModelDownloadState =>
      downloadStates[id] ?? { status: 'not_downloaded' },
    [downloadStates],
  );

  return {
    models,
    activeModel,
    isReady,
    isInitialized,
    initError,
    downloadState,
    setActiveModel,
    downloadModel,
    cancelDownload,
    deleteModel,
  };
}
