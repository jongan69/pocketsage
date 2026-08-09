/**
 * Resource fetcher for ExecuTorch model files.
 *
 * Downloads model binaries, tokenizers, and tokenizer configs from the
 * trusted release manifest with:
 *
 * - per-source and aggregate download progress (0–1)
 * - background-session downloads that survive app suspension
 * - pause/resume (the pause state is persisted in the KV store)
 * - cancellation (`cancel()` aborts the active download)
 * - SHA-256 integrity verification against `EXECUTORCH_RESOURCE_INTEGRITY`
 * - cached verification results (skips re-hashing unchanged files)
 * - free-disk-space checks with a configurable storage reserve
 * - an optional wifi-only policy
 * - keep-awake during large downloads (best-effort)
 *
 * All paths returned to the caller are bare filesystem paths (no `file://`
 * prefix) — that is what the native ExecuTorch modules expect.
 */

import { Asset } from 'expo-asset';
import {
  Directory,
  DownloadTask,
  File,
  FileMode,
  Paths,
  type DownloadPauseState,
  type DownloadTaskOptions,
} from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import type { ResourceFetcherAdapter } from '../types';
import {
  expectedExecutorchResourceBytes,
  getExecutorchResourceIntegrity,
  minimumExecutorchResourceBytes,
} from './model-config';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Progress callback receiving a value in [0, 1]. */
export type ProgressCallback = (downloadProgress: number) => void;

/** A resource source: a remote URL, a local path, or a numeric asset id. */
export type ResourceSource = string | number;

/** Thrown when a download was cancelled via {@link ResourceFetcher.cancel}. */
export class AbortDownloadError extends Error {
  constructor(source?: string) {
    super(source ? `Download cancelled: ${source}` : 'Download cancelled.');
    this.name = 'AbortError';
  }
}

/**
 * Thrown when a download was paused via {@link ResourceFetcher.pauseActiveDownload}.
 * The pause state is persisted, so a later `fetch` of the same source resumes
 * instead of restarting.
 */
export class DownloadPausedError extends Error {
  constructor(source?: string) {
    super(
      source
        ? `Download paused: ${source}`
        : 'The on-device model download was paused. It will resume on retry.',
    );
    this.name = 'PausedError';
  }
}

/**
 * A minimal async KV store used to persist download and verification state.
 * The default in-memory implementation is process-lifetime only; host apps
 * can pass a durable adapter.
 */
export interface MemoryKVStore {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Create the default in-memory KV store. */
export function createMemoryKV(): MemoryKVStore {
  const store = new Map<string, string>();
  return {
    async getItem<T>(key: string): Promise<T | null> {
      const raw = store.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Corrupted entry — treat as missing (raw strings are not stored raw).
        return null;
      }
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      store.set(key, JSON.stringify(value));
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

/**
 * The resource fetcher contract used by the ExecuTorch bridge and the
 * model manager. Satisfies {@link ResourceFetcherAdapter} structurally.
 */
export interface ResourceFetcher extends ResourceFetcherAdapter {
  /** List absolute paths of every downloaded file under the fetcher's directory. */
  listDownloadedFiles(): Promise<string[]>;
  /** Delete the resources for the given sources (remote URLs, paths, asset ids). */
  deleteResources(...sources: ResourceSource[]): Promise<void>;
  /**
   * Cancel the active download. When `source` is given, only cancels if that
   * source is the one currently downloading. Cancellation causes the in-flight
   * `fetch` promise to reject with {@link AbortDownloadError}.
   */
  cancel(source?: string): Promise<void>;
  /**
   * Pause the active download. The pause state is persisted so a later
   * `fetch` of the same source resumes instead of restarting. The in-flight
   * `fetch` promise rejects with a "paused" error.
   */
  pauseActiveDownload(): Promise<void>;
  /**
   * Best-effort check whether a resource is present on disk and larger than
   * the minimum plausible size. Full SHA-256 verification happens lazily when
   * ExecuTorch loads the resource.
   */
  hasResource(source: string): Promise<boolean>;
  /** Enable or disable the wifi-only download policy at runtime. */
  setWifiOnly(enabled: boolean): void;
}

/** Options for {@link createResourceFetcher}. */
export interface CreateResourceFetcherOptions {
  /** Refuse downloads over metered connections. Defaults to `false`. */
  wifiOnly?: boolean;
  /** Extra free space (bytes) required beyond the resource size. Defaults to 512 MB. */
  storageReserveBytes?: number;
  /** Persistence backend for download/verification state. Defaults to in-memory. */
  kvStore?: MemoryKVStore;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REMOTE_URL_PATTERN = /^https?:\/\//i;
const FILE_URL_PATTERN = /^file:\/\//i;
const DEFAULT_STORAGE_RESERVE_BYTES = 512 * 1024 * 1024; // 512 MB
const PROGRESS_DOWNLOAD_CAP = 0.95; // download phase reports 0 → 0.95
const HASH_CHUNK_BYTES = 64 * 1024; // 64 KB
const YIELD_EVERY_CHUNKS = 32; // keep the JS event loop responsive while hashing

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Small stable hash for keying the KV store by source URL. */
function hashSource(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function stripFilePrefix(uri: string): string {
  return uri.replace(FILE_URL_PATTERN, '');
}

/** Derive a collision-resistant local filename for a remote source. */
function filenameForRemoteSource(dirUri: string, source: string): string {
  const pathname = new URL(source).pathname;
  const candidate = pathname.split('/').filter(Boolean).pop() || 'resource.bin';
  const safe = candidate.replace(/[^a-z0-9._-]/gi, '_');
  return `${dirUri}${hashSource(source)}-${safe}`;
}

/**
 * Whether a network connection type is metered. An unknown/undefined type is
 * treated as unmetered so downloads are not blocked on ambiguous state.
 */
function isMeteredNetworkType(type: Network.NetworkStateType | undefined): boolean {
  if (type === undefined) return false;
  return (
    type === Network.NetworkStateType.CELLULAR ||
    type === Network.NetworkStateType.BLUETOOTH ||
    type === Network.NetworkStateType.WIMAX
  );
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a resource fetcher scoped to `storagePrefix`.
 *
 * The prefix is used both for the on-disk download directory (under the
 * app's document directory) and for KV store keys, so multiple consumers
 * (or multiple apps) never collide.
 */
export function createResourceFetcher(
  storagePrefix: string,
  options: CreateResourceFetcherOptions = {},
): ResourceFetcher {
  const normalizedPrefix = storagePrefix.replace(/^\/+|\/+$/g, '');
  if (normalizedPrefix.length === 0) {
    throw new Error('createResourceFetcher: storagePrefix must not be empty.');
  }
  const storageReserveBytes =
    options.storageReserveBytes ?? DEFAULT_STORAGE_RESERVE_BYTES;
  const kv = options.kvStore ?? createMemoryKV();

  let wifiOnly = options.wifiOnly ?? false;

  const DOWNLOAD_STATE_KEY = `${normalizedPrefix}:download-state:`;
  const VERIFIED_KEY = `${normalizedPrefix}:verified:`;

  const stateKeyFor = (source: string) => `${DOWNLOAD_STATE_KEY}${hashSource(source)}`;
  const verifiedKeyFor = (source: string) => `${VERIFIED_KEY}${hashSource(source)}`;

  // ── Active download tracking ─────────────────────────────────────────────

  let activeDownload: { source: string; task: DownloadTask } | null = null;
  let keepAwakeCount = 0;
  const keepAwakeTag = `${normalizedPrefix}-download`;

  // ── Directory Helpers ────────────────────────────────────────────────────

  const downloadDir = () => new Directory(`${Paths.document.uri}${normalizedPrefix}/`);

  async function ensureDirectory(): Promise<void> {
    const dir = downloadDir();
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
  }

  // ── SHA-256 Hashing ──────────────────────────────────────────────────────

  async function sha256File(
    handle: { readBytes: (length: number) => Uint8Array; close: () => void },
    size: number,
    onProgress: ProgressCallback,
  ): Promise<string> {
    const hasher = sha256.create();
    let offset = 0;
    let chunksSinceYield = 0;

    while (offset < size) {
      const chunk = handle.readBytes(Math.min(HASH_CHUNK_BYTES, size - offset));
      hasher.update(chunk);
      offset += chunk.length;

      chunksSinceYield++;
      if (chunksSinceYield >= YIELD_EVERY_CHUNKS) {
        chunksSinceYield = 0;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      onProgress(offset / size);
    }

    return bytesToHex(hasher.digest());
  }

  // ── Integrity Verification ───────────────────────────────────────────────

  async function clearVerifiedResource(source: string): Promise<void> {
    await kv.removeItem(verifiedKeyFor(source));
  }

  async function verifyRemoteResource(
    source: string,
    file: File,
    onProgress: ProgressCallback,
  ): Promise<void> {
    const expected = getExecutorchResourceIntegrity(source);
    if (!expected) {
      throw new Error(
        'This on-device model resource is not in the trusted release manifest.',
      );
    }
    if (!file.exists || file.size !== expected.bytes) {
      await clearVerifiedResource(source);
      throw new Error(
        'The on-device model resource size did not match the trusted release manifest.',
      );
    }

    // Fast path: previously verified and unchanged on disk.
    const cached = await kv.getItem<{
      schemaVersion: 1;
      source: string;
      bytes: number;
      lastModified: number | null;
      sha256: string;
    }>(verifiedKeyFor(source));
    if (
      cached?.schemaVersion === 1 &&
      cached.source === source &&
      cached.bytes === file.size &&
      cached.lastModified === file.lastModified &&
      cached.sha256 === expected.sha256
    ) {
      onProgress(1);
      return;
    }

    // Full SHA-256 verification.
    const handle = file.open(FileMode.ReadOnly);
    let actual: string;
    try {
      actual = await sha256File(handle, file.size, onProgress);
    } finally {
      handle.close();
    }

    if (actual !== expected.sha256) {
      await clearVerifiedResource(source);
      throw new Error(
        'The on-device model resource failed its SHA-256 integrity check.',
      );
    }

    await kv.setItem(verifiedKeyFor(source), {
      schemaVersion: 1 as const,
      source,
      bytes: file.size,
      lastModified: file.lastModified,
      sha256: actual,
    });
  }

  // ── Download Guard Rails ─────────────────────────────────────────────────

  async function assertDownloadAllowed(source: string): Promise<void> {
    const expectedBytes = expectedExecutorchResourceBytes(source);

    // Free space check.
    const requiredBytes = expectedBytes + storageReserveBytes;
    if (Paths.availableDiskSpace < requiredBytes) {
      const requiredGB = (requiredBytes / 1024 ** 3).toFixed(1);
      throw new Error(
        `At least ${requiredGB} GB of free storage is required for this on-device model.`,
      );
    }

    // Network checks apply to remote downloads only (best-effort —
    // expo-network may be unavailable; the download then fails naturally).
    if (!REMOTE_URL_PATTERN.test(source)) return;

    let state: Network.NetworkState | null = null;
    try {
      state = await Network.getNetworkStateAsync();
    } catch {
      // expo-network unavailable — skip connectivity checks.
    }
    if (state === null) return;

    if (!state.isConnected) {
      throw new Error(
        'An internet connection is required to download the on-device model.',
      );
    }
    if (wifiOnly && isMeteredNetworkType(state.type)) {
      throw new Error(
        'The on-device model download requires a Wi-Fi connection. ' +
          'Connect to Wi-Fi or disable the wifi-only setting.',
      );
    }
  }

  // ── Remote Download ──────────────────────────────────────────────────────

  async function fetchRemoteFile(
    source: string,
    callback: ProgressCallback,
  ): Promise<string> {
    await ensureDirectory();
    const destPath = filenameForRemoteSource(downloadDir().uri, source);
    const destFile = new File(destPath);

    // Already on disk? Verify (or re-verify) it.
    if (destFile.exists && (destFile.size ?? 0) >= minimumExecutorchResourceBytes(source)) {
      try {
        await verifyRemoteResource(source, destFile, callback);
        callback(1);
        return stripFilePrefix(destPath);
      } catch {
        destFile.delete();
        throw new Error(
          'Cached model failed verification. It will be re-downloaded.',
        );
      }
    }

    if (destFile.exists) destFile.delete();
    await assertDownloadAllowed(source);

    // Keep the screen awake during large downloads (best-effort).
    keepAwakeCount++;
    try {
      await activateKeepAwakeAsync(keepAwakeTag);
    } catch {
      // keep-awake is best-effort
    }

    try {
      const taskOptions: DownloadTaskOptions = {
        sessionType: 'background',
        onProgress: (progress) => {
          const total =
            progress.totalBytes > 0 ? progress.totalBytes : progress.bytesWritten;
          callback(
            Math.min(progress.bytesWritten / Math.max(total, 1), 1) *
              PROGRESS_DOWNLOAD_CAP,
          );
        },
      };

      // Resume a paused download if one was persisted.
      const stateKey = stateKeyFor(source);
      const savedState = await kv.getItem<DownloadPauseState>(stateKey);
      const task =
        savedState && savedState.url === source
          ? DownloadTask.fromSavable(savedState, taskOptions)
          : new DownloadTask(source, destFile, taskOptions);

      activeDownload = { source, task };

      let downloaded: File | null = null;
      let taskState: DownloadTask['state'];
      try {
        downloaded =
          task.state === 'paused'
            ? await task.resumeAsync()
            : await task.downloadAsync();
        taskState = task.state;
      } finally {
        if (activeDownload?.task === task) activeDownload = null;
        task.release();
      }

      // Pause semantics: pauseAsync() resolves the pending download with null
      // and leaves the task paused. Persist the resume state for later.
      // (taskState is captured before release() because release() detaches
      // the native task.)
      if (!downloaded && taskState === 'paused') {
        await kv.setItem(stateKey, task.savable());
        throw new DownloadPausedError(source);
      }
      if (!downloaded || !downloaded.exists) {
        throw new Error(`Failed to fetch ExecuTorch resource from ${source}`);
      }
      if ((downloaded.size ?? 0) < minimumExecutorchResourceBytes(source)) {
        downloaded.delete();
        throw new Error(
          'The on-device model download was incomplete. Please retry the download.',
        );
      }

      // Verify the freshly downloaded file (progress 0.95 → 1.0).
      try {
        await verifyRemoteResource(source, downloaded, (p) =>
          callback(PROGRESS_DOWNLOAD_CAP + p * (1 - PROGRESS_DOWNLOAD_CAP)),
        );
      } catch (error) {
        downloaded.delete();
        throw error;
      }

      await kv.removeItem(stateKey);
      callback(1);
      return stripFilePrefix(downloaded.uri);
    } finally {
      keepAwakeCount--;
      if (keepAwakeCount <= 0) {
        keepAwakeCount = 0;
        try {
          deactivateKeepAwake(keepAwakeTag);
        } catch {
          // best-effort
        }
      }
    }
  }

  // ── Asset Fetching ───────────────────────────────────────────────────────

  async function fetchAsset(source: number): Promise<string> {
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) throw new Error('Failed to resolve bundled ExecuTorch asset.');
    return stripFilePrefix(uri);
  }

  async function resolveSource(
    source: ResourceSource,
    callback: ProgressCallback,
  ): Promise<{ path: string; wasDownloaded: boolean }> {
    if (typeof source === 'string') {
      if (REMOTE_URL_PATTERN.test(source)) {
        return { path: await fetchRemoteFile(source, callback), wasDownloaded: true };
      }
      callback(1);
      return { path: stripFilePrefix(source), wasDownloaded: false };
    }
    if (typeof source === 'number') {
      return { path: await fetchAsset(source), wasDownloaded: false };
    }
    throw new Error('Object ExecuTorch resources are not supported.');
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    async fetch(onProgress: ProgressCallback = () => {}, ...sources: ResourceSource[]) {
      if (sources.length === 0) {
        throw new Error('At least one ExecuTorch resource source is required.');
      }

      const paths: string[] = [];
      const wasDownloaded: boolean[] = [];

      for (let i = 0; i < sources.length; i++) {
        const result = await resolveSource(sources[i], (p) =>
          onProgress((i + p) / sources.length),
        );
        paths.push(result.path);
        wasDownloaded.push(result.wasDownloaded);
      }

      onProgress(1);
      return { paths, wasDownloaded };
    },

    async readAsString(path: string): Promise<string> {
      const file = new File(path.startsWith('file://') ? path : `file://${path}`);
      return file.text();
    },

    async listDownloadedFiles(): Promise<string[]> {
      await ensureDirectory();
      return downloadDir().list().map((entry) => entry.uri);
    },

    async deleteResources(...sources: ResourceSource[]): Promise<void> {
      await Promise.all(
        sources.map(async (source) => {
          if (typeof source !== 'string') return;
          const uri = REMOTE_URL_PATTERN.test(source)
            ? filenameForRemoteSource(downloadDir().uri, source)
            : source;
          try {
            const file = new File(uri);
            if (file.exists) file.delete();
          } catch {
            // File may not exist or may be undeletable — best effort.
          }
          await Promise.all([
            clearVerifiedResource(source),
            kv.removeItem(stateKeyFor(source)),
          ]);
        }),
      );
    },

    async cancel(source?: string): Promise<void> {
      const download = activeDownload;
      if (!download) return;
      if (source !== undefined && download.source !== source) return;

      const { source: cancelledSource, task } = download;
      activeDownload = null;
      await kv.removeItem(stateKeyFor(cancelledSource));
      task.cancel(); // rejects the pending downloadAsync()/resumeAsync() promise
    },

    async pauseActiveDownload(): Promise<void> {
      const download = activeDownload;
      if (!download) return;
      await download.task.pauseAsync();
      // The pending downloadAsync() promise resolves with null; fetchRemoteFile
      // observes the paused state and persists task.savable().
    },

    async hasResource(source: string): Promise<boolean> {
      if (typeof source !== 'string') return false;
      const uri = REMOTE_URL_PATTERN.test(source)
        ? filenameForRemoteSource(downloadDir().uri, source)
        : source;
      try {
        const file = new File(uri);
        return file.exists && (file.size ?? 0) >= minimumExecutorchResourceBytes(source);
      } catch {
        return false;
      }
    },

    setWifiOnly(enabled: boolean): void {
      wifiOnly = enabled;
    },
  };
}
