import { Directory, File, Paths } from 'expo-file-system';

/**
 * Tiny JSON key-value store on top of expo-file-system's new API.
 *
 * Keys follow the `pocketsage:<name>` convention (see STORAGE_KEYS). Values
 * are stored as individual JSON files under `<document>/pocketsage-storage/`.
 */

const storageDirectory = new Directory(Paths.document, 'pocketsage-storage');

function ensureStorageDirectory(): void {
  try {
    storageDirectory.create({ intermediates: true, idempotent: true });
  } catch {
    // Directory already exists or is not creatable — reads will still work.
  }
}

/** Map a `pocketsage:key` to a safe file name under the storage directory. */
function keyToFileName(key: string): string {
  const cleaned = key.replace(/^pocketsage:/, '').replace(/[/\\]/g, '-');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

function storageFile(key: string): File {
  return new File(storageDirectory, keyToFileName(key));
}

/**
 * Read a JSON value. Returns `fallback` when the file is missing, empty, or
 * corrupt — reads never throw.
 */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const file = storageFile(key);
    if (!file.exists) return fallback;
    const text = await file.text();
    if (!text || text.trim().length === 0) return fallback;
    return JSON.parse(text) as T;
  } catch (error) {
    console.warn(`[persistence] Failed to read "${key}"`, error);
    return fallback;
  }
}

/** Write a JSON value. Failures are logged, never thrown. */
export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    ensureStorageDirectory();
    const file = storageFile(key);
    await file.write(JSON.stringify(value));
  } catch (error) {
    console.warn(`[persistence] Failed to write "${key}"`, error);
  }
}

/** Delete a stored value. Missing files are a no-op. */
export async function deleteJson(key: string): Promise<void> {
  try {
    const file = storageFile(key);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn(`[persistence] Failed to delete "${key}"`, error);
  }
}
