import type { ModelInfo, ModelDownloadState, ModelTier } from '../types';
import { BUILT_IN_MODELS } from '../executorch/model-config';
import { createResourceFetcher, type ResourceFetcher } from '../executorch/resource-fetcher';
import { isExecutorchAvailable, initExecutorch } from '../executorch/runtime';
import { getBuiltInModels, getRecommendedModel } from './catalog';

export type { ModelInfo, ModelDownloadState, ModelTier };
export { getBuiltInModels, getRecommendedModel };

export class ModelManager {
  private activeModelId: string | null = null;
  private downloadStates = new Map<string, ModelDownloadState>();
  private fetcher: ResourceFetcher;
  private initialized = false;
  private initError: string | null = null;

  constructor() {
    this.fetcher = createResourceFetcher('pocketsage');
  }

  // ── Initialization ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      if (isExecutorchAvailable()) {
        initExecutorch({ resourceFetcher: this.fetcher });
      }
      this.initialized = true;
    } catch (error) {
      this.initError = error instanceof Error ? error.message : 'Unknown initialization error';
      this.initialized = true; // Mark as initialized so app doesn't hang
    }
  }

  get isAvailable(): boolean {
    return isExecutorchAvailable();
  }

  get initializationError(): string | null {
    return this.initError;
  }

  // ── Model Listing ───────────────────────────────────────────────────────

  listModels(): ModelInfo[] {
    return [...BUILT_IN_MODELS];
  }

  getModelState(id: string): ModelDownloadState {
    return this.downloadStates.get(id) ?? { status: 'not_downloaded' };
  }

  getActiveModel(): ModelInfo | null {
    if (!this.activeModelId) return null;
    return BUILT_IN_MODELS.find((m) => m.id === this.activeModelId) ?? null;
  }

  async setActiveModel(id: string): Promise<void> {
    const model = BUILT_IN_MODELS.find((m) => m.id === id);
    if (!model) throw new Error(`Unknown model: ${id}`);

    const state = this.getModelState(id);
    if (state.status !== 'downloaded') {
      throw new Error(`Model "${model.name}" is not downloaded. Download it first.`);
    }

    this.activeModelId = id;
  }

  // ── Download Management ─────────────────────────────────────────────────

  async downloadModel(
    id: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const model = BUILT_IN_MODELS.find((m) => m.id === id);
    if (!model) throw new Error(`Unknown model: ${id}`);

    const currentState = this.getModelState(id);
    if (currentState.status === 'downloaded') {
      onProgress?.(1);
      if (!this.activeModelId) {
        this.activeModelId = id;
      }
      return;
    }

    if (currentState.status === 'downloading') {
      throw new Error(`Model "${model.name}" is already downloading.`);
    }

    if (!this.fetcher) {
      throw new Error('Model downloader not initialized.');
    }

    this.downloadStates.set(id, { status: 'downloading', progress: 0 });

    try {
      const progressCallback = (progress: number) => {
        if (signal?.aborted) return;
        this.downloadStates.set(id, { status: 'downloading', progress });
        onProgress?.(progress);
      };

      await this.fetcher.fetch(
        progressCallback,
        model.downloadUrl,
        model.tokenizerUrl,
        model.tokenizerConfigUrl,
      );

      if (signal?.aborted) {
        this.downloadStates.set(id, { status: 'not_downloaded' });
        return;
      }

      this.downloadStates.set(id, { status: 'downloaded' });

      // Auto-select first downloaded model
      if (!this.activeModelId) {
        this.activeModelId = id;
      }
    } catch (error) {
      this.downloadStates.set(id, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Download failed',
      });
      throw error;
    }
  }

  async cancelDownload(id: string): Promise<void> {
    const state = this.getModelState(id);
    if (state.status !== 'downloading') return;

    // The download will be aborted via the signal
    this.downloadStates.set(id, { status: 'not_downloaded' });
  }

  async deleteModel(id: string): Promise<void> {
    const model = BUILT_IN_MODELS.find((m) => m.id === id);
    if (!model) throw new Error(`Unknown model: ${id}`);

    await this.fetcher.deleteResources(
      model.downloadUrl,
      model.tokenizerUrl,
      model.tokenizerConfigUrl,
    );

    this.downloadStates.set(id, { status: 'not_downloaded' });

    if (this.activeModelId === id) {
      this.activeModelId = null;
    }
  }

  // ── Recommendations ─────────────────────────────────────────────────────

  getRecommendedModel(): ModelInfo | null {
    return getRecommendedModel();
  }
}

/** Global singleton — one ModelManager per app. */
export const modelManager = new ModelManager();
