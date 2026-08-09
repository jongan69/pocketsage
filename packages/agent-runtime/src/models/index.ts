/**
 * ModelManager — the app-facing API for the on-device model lifecycle:
 * listing, downloading (with progress, pause, and cancellation), verification,
 * and active-model selection.
 *
 * All downloads go through the single {@link ResourceFetcher} instance, which
 * enforces one active download at a time. Download progress is reported from
 * 0–1 and SHA-256 verification is performed against the trusted release
 * manifest before a model is marked `downloaded`.
 */

import type { ModelDownloadState, ModelInfo, ModelTier } from '../types';
import { BUILT_IN_MODELS } from '../executorch/model-config';
import {
  createResourceFetcher,
  type ResourceFetcher,
} from '../executorch/resource-fetcher';
import { initExecutorch, isExecutorchAvailable } from '../executorch/runtime';
import { getBuiltInModels, getRecommendedModel } from './catalog';

export type { ModelInfo, ModelDownloadState, ModelTier };
export { getBuiltInModels, getRecommendedModel, BUILT_IN_MODELS };

/**
 * Manages the lifecycle of the built-in on-device models.
 *
 * This class is stateful (active model id, download states) and is meant to
 * be used through the exported {@link modelManager} singleton.
 */
export class ModelManager {
  private activeModelId: string | null = null;
  private readonly downloadStates = new Map<string, ModelDownloadState>();
  private readonly activeDownloadControllers = new Map<string, AbortController>();
  private readonly fetcher: ResourceFetcher;
  private initialized = false;
  private initError: string | null = null;

  /** Create a ModelManager. `storagePrefix` scopes downloaded files and state. */
  constructor(storagePrefix = 'pocketsage') {
    this.fetcher = createResourceFetcher(storagePrefix);
  }

  // ── Initialization ──────────────────────────────────────────────────────

  /**
   * Initialize the ExecuTorch runtime and reconcile on-disk download state.
   *
   * Safe to call multiple times. Never throws: when ExecuTorch is unavailable
   * (e.g. a build without the native modules) the error is recorded in
   * {@link initializationError} and download state is still refreshed so the
   * UI can show what is already on disk.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      if (isExecutorchAvailable()) {
        initExecutorch({ resourceFetcher: this.fetcher });
      }
    } catch (error) {
      this.initError =
        error instanceof Error ? error.message : 'Unknown initialization error';
    }
    await this.refreshDownloadedStates();
  }

  /** Whether ExecuTorch is available in this environment. */
  get isAvailable(): boolean {
    return isExecutorchAvailable();
  }

  /** Error recorded during {@link initialize}, or `null` when initialization succeeded. */
  get initializationError(): string | null {
    return this.initError;
  }

  // ── Model Listing ───────────────────────────────────────────────────────

  /** All built-in model definitions. */
  listModels(): ModelInfo[] {
    return [...BUILT_IN_MODELS];
  }

  /** The current download state of a model (defaults to `not_downloaded`). */
  getModelState(id: string): ModelDownloadState {
    return this.downloadStates.get(id) ?? { status: 'not_downloaded' };
  }

  /** The currently selected model, or `null` if none is active. */
  getActiveModel(): ModelInfo | null {
    if (!this.activeModelId) return null;
    return BUILT_IN_MODELS.find((m) => m.id === this.activeModelId) ?? null;
  }

  /**
   * Select the active model. The model must be downloaded first.
   * The active model is what the inference layer loads (by tier).
   */
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

  /**
   * Download a model (binary + tokenizer + tokenizer config), reporting
   * progress from 0–1. The model is verified against the trusted manifest
   * before it is marked `downloaded`.
   *
   * Only one download can run at a time; other models are rejected while one
   * is in flight. Cancellation via `signal` (or {@link cancelDownload}) resets
   * the model to `not_downloaded` and resolves (it does not reject).
   *
   * @throws if the model id is unknown, a download is already in flight, or
   *   the download fails (network, disk space, or integrity check).
   */
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
      return;
    }
    if (currentState.status === 'downloading') {
      throw new Error(`Model "${model.name}" is already downloading.`);
    }

    // One global download at a time.
    for (const controller of this.activeDownloadControllers.values()) {
      if (!controller.signal.aborted) {
        throw new Error(
          'Another model is already downloading. Cancel it before starting a new download.',
        );
      }
    }

    const controller = new AbortController();
    this.activeDownloadControllers.set(id, controller);

    const onAbort = () => {
      void this.fetcher.cancel();
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    this.downloadStates.set(id, { status: 'downloading', progress: 0 });

    try {
      await this.fetcher.fetch(
        (progress) => {
          if (controller.signal.aborted) return;
          this.downloadStates.set(id, { status: 'downloading', progress });
          onProgress?.(progress);
        },
        model.downloadUrl,
        model.tokenizerUrl,
        model.tokenizerConfigUrl,
      );

      if (controller.signal.aborted) return; // state already reset by cancel

      this.downloadStates.set(id, { status: 'downloaded' });

      // Auto-select the first downloaded model so inference works out of the box.
      if (!this.activeModelId) {
        this.activeModelId = id;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // Cancellation is not an error — leave the model in not_downloaded.
        this.downloadStates.set(id, { status: 'not_downloaded' });
        return;
      }
      this.downloadStates.set(id, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Download failed',
      });
      throw error;
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
      signal?.removeEventListener('abort', () => controller.abort());
      this.activeDownloadControllers.delete(id);
    }
  }

  /**
   * Cancel an in-flight download of the given model. Has no effect when the
   * model is not downloading. The model resets to `not_downloaded` and the
   * pending {@link downloadModel} promise resolves.
   */
  async cancelDownload(id: string): Promise<void> {
    const controller = this.activeDownloadControllers.get(id);
    if (!controller || controller.signal.aborted) return;
    this.downloadStates.set(id, { status: 'not_downloaded' });
    controller.abort();
    await this.fetcher.cancel();
  }

  /**
   * Pause the in-flight download (if any). The pause state is persisted and a
   * later {@link downloadModel} of the same model resumes instead of
   * restarting. The pending download promise rejects with a "paused" error.
   */
  async pauseDownload(): Promise<void> {
    await this.fetcher.pauseActiveDownload();
  }

  /** Delete all downloaded files of a model and reset its state. */
  async deleteModel(id: string): Promise<void> {
    const model = BUILT_IN_MODELS.find((m) => m.id === id);
    if (!model) throw new Error(`Unknown model: ${id}`);

    // Cancel an in-flight download first.
    const controller = this.activeDownloadControllers.get(id);
    if (controller && !controller.signal.aborted) {
      this.downloadStates.set(id, { status: 'not_downloaded' });
      controller.abort();
      await this.fetcher.cancel();
    }

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

  /**
   * The recommended model for this device: the largest built-in model whose
   * `minRamBytes` fits within the estimated device RAM (see
   * {@link getRecommendedModel} in `models/catalog`).
   */
  getRecommendedModel(): ModelInfo | null {
    return getRecommendedModel();
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /**
   * Reconcile download states with the files on disk after initialization.
   * Models whose three resources are all present are marked `downloaded`;
   * models previously marked `downloaded` whose files vanished are reset.
   */
  private async refreshDownloadedStates(): Promise<void> {
    await Promise.all(
      BUILT_IN_MODELS.map(async (model) => {
        if (this.getModelState(model.id).status === 'downloading') return;
        try {
          const present = await Promise.all([
            this.fetcher.hasResource(model.downloadUrl),
            this.fetcher.hasResource(model.tokenizerUrl),
            this.fetcher.hasResource(model.tokenizerConfigUrl),
          ]);
          if (present.every(Boolean)) {
            this.downloadStates.set(model.id, { status: 'downloaded' });
          } else if (this.downloadStates.get(model.id)?.status === 'downloaded') {
            this.downloadStates.set(model.id, { status: 'not_downloaded' });
          }
        } catch {
          // Disk checks are best-effort — keep the previous state.
        }
      }),
    );
  }
}

/** Global singleton — one ModelManager per app. */
export const modelManager = new ModelManager();
