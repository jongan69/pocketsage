import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File, Directory, DownloadTask, Paths } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import { sha256 } from '@noble/hashes/sha256';

import {
  expectedExecutorchResourceBytes,
  getExecutorchResourceIntegrity,
  minimumExecutorchResourceBytes,
} from './model-config';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProgressCallback = (downloadProgress: number) => void;
type ResourceSource = string | number;

export interface ResourceFetcher {
  fetch(
    onProgress: ProgressCallback,
    ...sources: ResourceSource[]
  ): Promise<{ paths: string[]; wasDownloaded: boolean[] }>;
  readAsString(path: string): Promise<string>;
  listDownloadedFiles(): Promise<string[]>;
  deleteResources(...sources: ResourceSource[]): Promise<void>;
}

interface VerifiedResource {
  schemaVersion: 1;
  source: string;
  bytes: number;
  lastModified: number | null;
  sha256: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REMOTE_URL_PATTERN = /^https?:\/\//i;
const FILE_URL_PATTERN = /^file:\/\//i;
const STORAGE_RESERVE_BYTES = 512 * 1024 * 1024; // 512 MB reserve

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function filenameForRemoteSource(dirUri: string, source: string): string {
  const pathname = new URL(source).pathname;
  const candidate = pathname.split('/').filter(Boolean).pop() || 'resource.bin';
  const safe = candidate.replace(/[^a-z0-9._-]/gi, '_');
  return `${dirUri}${hashSource(source)}-${safe}`;
}

// ── Simple KV Store (in-memory, survives restarts via caller) ──────────────────

function createMemoryKV() {
  const store = new Map<string, string>();
  return {
    getItem: async <T>(key: string): Promise<T | null> => {
      const raw = store.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setItem: async <T>(key: string, value: T): Promise<void> => {
      store.set(key, JSON.stringify(value));
    },
    removeItem: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createResourceFetcher(storagePrefix: string): ResourceFetcher {
  const DOWNLOAD_STATE_KEY = `${storagePrefix}:download-state:`;
  const VERIFIED_KEY = `${storagePrefix}:verified:`;

  const kv = createMemoryKV();
  let activeDownloadCount = 0;
  const keepAwakeTag = `${storagePrefix}-download`;

  // Active download tracking
  let activeDownload: { source: string; task: typeof DownloadTask.prototype } | null = null;

  const stateKeyFor = (source: string) => `${DOWNLOAD_STATE_KEY}${hashSource(source)}`;
  const verifiedKeyFor = (source: string) => `${VERIFIED_KEY}${hashSource(source)}`;

  // ── Directory Helpers ───────────────────────────────────────────────────

  const rneDir = () => new Directory(`${Paths.document.uri}react-native-executorch/`);

  async function ensureDirectory(): Promise<void> {
    const dir = rneDir();
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
  }

  // ── SHA256 Verification ─────────────────────────────────────────────────

  async function sha256File(
    file: { size: number; readBytes: (length: number) => Uint8Array; close: () => void },
    onProgress: ProgressCallback,
  ): Promise<string> {
    const hasher = sha256.create();
    const CHUNK = 64 * 1024; // 64KB chunks
    let offset = 0;

    while (offset < file.size) {
      const chunk = file.readBytes(Math.min(CHUNK, file.size - offset));
      hasher.update(chunk);
      offset += chunk.length;
      onProgress(offset / file.size);
    }

    file.close();
    const hash = hasher.digest();
    return Array.from(hash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ── Verification ────────────────────────────────────────────────────────

  async function clearVerifiedResource(source: string): Promise<void> {
    await kv.removeItem(verifiedKeyFor(source));
  }

  async function verifyRemoteResource(
    source: string,
    file: InstanceType<typeof File>,
    onProgress: ProgressCallback,
  ): Promise<void> {
    const expected = getExecutorchResourceIntegrity(source);
    if (!expected) {
      throw new Error('This on-device model resource is not in the trusted release manifest.');
    }
    if (!file.exists || file.size !== expected.bytes) {
      await clearVerifiedResource(source);
      throw new Error(
        'The on-device model resource size did not match the trusted release manifest.',
      );
    }

    // Check cached verification
    const cached = await kv.getItem<VerifiedResource>(verifiedKeyFor(source));
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

    // Full SHA256 verification
    const handle = file.open({ mode: 'read' } as unknown as string);
    const actual = await sha256File(
      {
        size: file.size,
        readBytes: (length: number) => {
          const bytes = handle.readBytes(length);
          return new Uint8Array(bytes);
        },
        close: () => handle.close(),
      },
      onProgress,
    );

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
    } satisfies VerifiedResource);
  }

  // ── Download Logic ──────────────────────────────────────────────────────

  async function assertDownloadAllowed(source: string): Promise<void> {
    const expectedBytes = expectedExecutorchResourceBytes(source);

    // Check free space
    const requiredBytes = expectedBytes + STORAGE_RESERVE_BYTES;
    if (Paths.availableDiskSpace < requiredBytes) {
      const requiredGB = (requiredBytes / 1024 ** 3).toFixed(1);
      throw new Error(
        `At least ${requiredGB} GB of free storage is required for this on-device model.`,
      );
    }

    // Check network (best-effort on native; web always returns connected)
    if (Platform.OS !== 'web') {
      try {
        const state = await Network.getNetworkStateAsync();
        if (!state.isConnected) {
          throw new Error(
            'An internet connection is required to download the on-device model.',
          );
        }
      } catch {
        // expo-network may not be available — proceed anyway
      }
    }
  }

  async function fetchRemoteFile(
    source: string,
    callback: ProgressCallback,
  ): Promise<string> {
    await ensureDirectory();
    const destPath = filenameForRemoteSource(rneDir().uri, source);
    const destFile = new File(destPath);

    // Check if already downloaded
    if (destFile.exists && (destFile.size ?? 0) >= minimumExecutorchResourceBytes(source)) {
      try {
        await verifyRemoteResource(source, destFile, callback);
      } catch {
        destFile.delete();
        throw new Error('Cached model failed verification. It will be re-downloaded.');
      }
      callback(1);
      return stripFilePrefix(destPath);
    }

    if (destFile.exists) destFile.delete();
    await assertDownloadAllowed(source);

    // Keep screen awake during large download
    activeDownloadCount++;
    try {
      await activateKeepAwakeAsync(keepAwakeTag);
    } catch {
      // keep-awake is best-effort
    }

    try {
      // Check for paused/resumable download
      const stateKey = stateKeyFor(source);
      const savedState = await kv.getItem<{ url: string; resumeData: string }>(stateKey);

      const taskOptions = {
        sessionType: 'background' as const,
        onProgress: (progress: { bytesWritten: number; totalBytes: number }) => {
          const total = progress.totalBytes > 0 ? progress.totalBytes : progress.bytesWritten;
          callback(Math.min(progress.bytesWritten / Math.max(total, 1), 1) * 0.95);
        },
      };

      let task: InstanceType<typeof DownloadTask>;
      if (savedState?.url === source && savedState.resumeData) {
        task = DownloadTask.fromSavable(savedState, taskOptions);
      } else {
        task = new DownloadTask(source, destFile, taskOptions);
      }

      activeDownload = { source, task: task as unknown as typeof DownloadTask.prototype };

      let downloaded: InstanceType<typeof File> | null;
      try {
        downloaded =
          task.state === 'paused' ? await task.resumeAsync() : await task.downloadAsync();
      } finally {
        if (activeDownload?.task === task) activeDownload = null;
        task.release();
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

      // Verify the downloaded file
      try {
        await verifyRemoteResource(source, downloaded, (p) => callback(0.95 + p * 0.05));
      } catch (error) {
        downloaded.delete();
        throw error;
      }

      await kv.removeItem(stateKey);
      callback(1);
      return stripFilePrefix(downloaded.uri);
    } finally {
      activeDownloadCount--;
      if (activeDownloadCount <= 0) {
        activeDownloadCount = 0;
        try {
          deactivateKeepAwake(keepAwakeTag);
        } catch {
          // best-effort
        }
      }
    }
  }

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

  // ── Public API ──────────────────────────────────────────────────────────

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
      return rneDir()
        .list()
        .map((entry) => entry.uri);
    },

    async deleteResources(...sources: ResourceSource[]): Promise<void> {
      await Promise.all(
        sources.map(async (source) => {
          if (typeof source !== 'string') return;
          const uri = REMOTE_URL_PATTERN.test(source)
            ? filenameForRemoteSource(rneDir().uri, source)
            : source;
          try {
            const file = new File(uri);
            if (file.exists) file.delete();
            await clearVerifiedResource(source);
          } catch {
            // file may not exist or be undeletable
          }
        }),
      );
    },
  };
}
