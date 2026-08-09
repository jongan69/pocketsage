/**
 * Internal utilities shared across the agent-runtime package.
 *
 * This module is intentionally NOT exported from the package root — it is an
 * implementation detail. It provides cross-platform primitives:
 *
 * - `randomId()` — unique string IDs for vector entries, tool calls, etc.
 * - `joinPath()` / `dirname()` — path helpers that avoid importing `node:path`
 *   (which is not available on React Native).
 * - `createDefaultFileSystem()` — a best-effort, cross-platform file read/write
 *   adapter. On Node/Bun it uses `node:fs/promises`; everywhere else it falls
 *   back to an in-memory map (with a warning) so that the library never throws
 *   at construction time. Host applications (e.g. Expo) should pass their own
 *   adapter built on `expo-file-system` for durable persistence.
 */

export interface ReadWriteFileSystem {
  /** Read a file as a UTF-8 string. Rejects if the file does not exist. */
  readFile(path: string): Promise<string>;
  /** Write a UTF-8 string to a file, creating parent directories as needed. */
  writeFile(path: string, content: string): Promise<void>;
  /**
   * List the direct children of a directory (names only, not paths).
   * Optional — required only by directory-scanning features such as
   * `loadSkillsFromDirectory`.
   */
  readDir?(path: string): Promise<string[]>;
}

const NODE_FS_SPECIFIER = 'node:' + 'fs/promises'; // computed — keeps bundlers from statically resolving it

/**
 * Generate a unique string ID.
 *
 * Prefers `crypto.randomUUID()` when available (Node 19+, browsers, Hermes with
 * the RN crypto polyfill) and falls back to a timestamp + random suffix
 * otherwise (e.g. older Hermes runtimes).
 */
export function randomId(): string {
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (typeof g.crypto?.randomUUID === 'function') {
      return g.crypto.randomUUID();
    }
  } catch {
    // ignore — fall through to the non-crypto fallback
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Join path segments with `/` separators, skipping empty segments and
 * collapsing duplicate separators. Never uses `node:path` so it works on
 * React Native.
 */
export function joinPath(...segments: string[]): string {
  return segments
    .filter((s) => typeof s === 'string' && s.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}

/**
 * Return the parent directory of a path (the portion before the final `/`),
 * or `.` when there is no separator.
 */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '.' : path.slice(0, index);
}

/**
 * Best-effort Node/Bun file system adapter, or `null` when the environment is
 * not Node-like (e.g. React Native, browsers).
 *
 * Node 22.3+ provides `process.getBuiltinModule`, which is string-based and
 * bundler-safe. Other Node/Bun versions use a computed dynamic import
 * specifier so that Metro / bundlers never attempt to statically resolve
 * `node:fs/promises` for non-Node bundles.
 */
export function getNodeFileSystemOrNull(): ReadWriteFileSystem | null {
  const g = globalThis as {
    process?: {
      versions?: { node?: string };
      getBuiltinModule?: (id: string) => unknown;
    };
  };
  const nodeVersion = g.process?.versions?.node;
  if (!nodeVersion) return null;

  let fsPromise: Promise<{
    readFile: Function;
    writeFile: Function;
    mkdir: Function;
    readdir: Function;
  }> | null = null;

  const loadFs = (): Promise<{
    readFile: Function;
    writeFile: Function;
    mkdir: Function;
    readdir: Function;
  }> => {
    if (fsPromise) return fsPromise;
    fsPromise = (async () => {
      if (typeof g.process?.getBuiltinModule === 'function') {
        return g.process.getBuiltinModule(NODE_FS_SPECIFIER) as {
          readFile: Function;
          writeFile: Function;
          mkdir: Function;
          readdir: Function;
        };
      }
      const mod = (await import(NODE_FS_SPECIFIER)) as {
        readFile: Function;
        writeFile: Function;
        mkdir: Function;
        readdir: Function;
      };
      return mod;
    })();
    return fsPromise;
  };

  return {
    async readFile(path: string): Promise<string> {
      const fs = await loadFs();
      return await fs.readFile(path, 'utf8');
    },
    async writeFile(path: string, content: string): Promise<void> {
      const fs = await loadFs();
      try {
        await fs.mkdir(dirname(path), { recursive: true });
      } catch {
        // directory may already exist — the write below will surface real errors
      }
      await fs.writeFile(path, content, 'utf8');
    },
    async readDir(path: string): Promise<string[]> {
      const fs = await loadFs();
      return await fs.readdir(path, { withFileTypes: true }).then((dirents: { name: string }[]) =>
        dirents.map((d) => d.name),
      );
    },
  };
}

/**
 * Create the default file system adapter.
 *
 * Uses `node:fs/promises` on Node/Bun. On platforms without a native file
 * system (React Native without an injected adapter, browsers, tests) it
 * returns an in-memory adapter and logs a warning — persistence degrades to
 * process lifetime only, but the library never fails at construction.
 */
export function createDefaultFileSystem(): ReadWriteFileSystem {
  const nodeFs = getNodeFileSystemOrNull();
  if (nodeFs) return nodeFs;

  const files = new Map<string, string>();
  console.warn(
    '[agent-runtime] No native file system detected; persistence will be in-memory only. ' +
      'Pass a ReadWriteFileSystem adapter (e.g. built on expo-file-system) for durable storage.'
  );
  return {
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory '${path}'`);
      }
      return content;
    },
    async writeFile(path: string, content: string): Promise<void> {
      files.set(path, content);
    },
    async readDir(path: string): Promise<string[]> {
      const prefix = path.endsWith('/') ? path : path + '/';
      const children = new Set<string>();
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const firstSegment = rest.split('/')[0];
        if (firstSegment) children.add(firstSegment);
      }
      return Array.from(children);
    },
  };
}
