import { useModelStore } from '@/stores/model-store';

export function useModels() {
  const store = useModelStore();

  return {
    models: store.models,
    activeModel: store.activeModel(),
    isReady: store.isModelReady(),
    isInitialized: store.isInitialized,
    initError: store.initError,
    downloadState: (id: string) => store.downloadStates[id] ?? { status: 'not_downloaded' as const },
    setActiveModel: store.setActiveModel,
    downloadModel: store.downloadModel,
    cancelDownload: store.cancelDownload,
    deleteModel: store.deleteModel,
  };
}
