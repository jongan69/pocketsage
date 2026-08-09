import * as FileSystem from 'expo-file-system';
import type { Skill } from '@pocketsage/agent-runtime';

const DOCUMENT_DIR = FileSystem.documentDirectory ?? '';

function resolvePath(inputPath: string): string {
  const clean = (inputPath || '').replace(/^\.\/|^\/+|\/+$/g, '');
  if (clean === '' || clean === '.') return DOCUMENT_DIR;
  return `${DOCUMENT_DIR}${clean}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}

export const filesSkill: Skill = {
  metadata: {
    name: 'files',
    description: 'Read, write, and list files on your device',
    version: '0.1.0',
    keywords: ['file', 'files', 'document', 'documents', 'folder', 'directory', 'read', 'write', 'save'],
    triggers: [
      'list files',
      'read file',
      'write to file',
      'save this',
      'what files do I have',
      'find document',
      'open file',
    ],
  },
  tools: {
    'files.list': {
      definition: {
        name: 'files.list',
        description: 'List files and directories at a path. All paths are sandboxed to the app documents directory.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path relative to documents (empty string or "." for root)',
            },
          },
          required: [],
        },
      },
      execute: async ({ path }) => {
        const targetPath = resolvePath((path as string) || '');
        try {
          const entries = await FileSystem.readDirectoryAsync(targetPath);
          const items = await Promise.all(
            entries.map(async (name) => {
              const fullPath = `${targetPath}${name}`;
              try {
                const info = await FileSystem.getInfoAsync(fullPath, { size: true });
                return {
                  name,
                  isDirectory: info.isDirectory ?? false,
                  size: info.size ?? 0,
                  modificationTime: info.modificationTime
                    ? new Date(info.modificationTime * 1000).toISOString()
                    : null,
                };
              } catch {
                return { name, isDirectory: false, size: 0, modificationTime: null };
              }
            }),
          );

          items.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          return { path: (path as string) || '.', count: items.length, items };
        } catch (error) {
          throw new Error(
            `Cannot list directory "${path || '.'}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    },

    'files.read': {
      definition: {
        name: 'files.read',
        description: 'Read a file as text. File path is relative to the app documents directory.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to documents directory' },
          },
          required: ['path'],
        },
        requiresConfirmation: false,
      },
      execute: async ({ path }) => {
        if (!path) throw new Error('File path is required.');
        const targetPath = resolvePath(path as string);
        const exists = await fileExists(targetPath);
        if (!exists) throw new Error(`File not found: ${path}`);

        const content = await FileSystem.readAsStringAsync(targetPath, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const maxPreview = 10000;
        const truncated = content.length > maxPreview;
        const preview = truncated ? content.slice(0, maxPreview) : content;

        return {
          path: path as string,
          size: content.length,
          content: preview,
          truncated,
          note: truncated ? `File is ${content.length} characters. Showing first ${maxPreview}.` : undefined,
        };
      },
    },

    'files.write': {
      definition: {
        name: 'files.write',
        description: 'Write text content to a file. Creates the file if it does not exist.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to documents directory' },
            content: { type: 'string', description: 'Text content to write' },
          },
          required: ['path', 'content'],
        },
        requiresConfirmation: true,
      },
      execute: async ({ path, content }) => {
        if (!path) throw new Error('File path is required.');
        const targetPath = resolvePath(path as string);
        const existed = await fileExists(targetPath);

        // Ensure parent directory exists
        const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
        if (parentDir && parentDir !== DOCUMENT_DIR) {
          const parentInfo = await FileSystem.getInfoAsync(parentDir);
          if (!parentInfo.exists) {
            await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
          }
        }

        await FileSystem.writeAsStringAsync(targetPath, content as string, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        return {
          path: path as string,
          written: (content as string).length,
          operation: existed ? 'overwritten' : 'created',
        };
      },
    },
  },
  instructions: '',
};
