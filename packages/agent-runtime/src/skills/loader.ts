import type { Skill, SkillMetadata, Tool } from './types';
import { createDefaultFileSystem, joinPath, type ReadWriteFileSystem } from '../utils';

/**
 * The result of parsing a SKILL.md file.
 */
export interface ParsedSkillMd {
  /** Structured metadata extracted from the markdown. */
  metadata: SkillMetadata;
  /** Everything after the `## Instructions` section, trimmed. */
  instructions: string;
}

/**
 * Expected SKILL.md format:
 *
 * ```markdown
 * # Skill Name
 *
 * One-line description (or a `## Description` section).
 *
 * ## When to Use
 * - trigger phrase
 *
 * ## Tools
 * - `tool.name({ params })` — description
 *
 * ## Instructions
 * ... freeform instructions injected into the system prompt ...
 * ```
 */
export function parseSkillMd(content: string, filePath: string): ParsedSkillMd {
  const fallback: ParsedSkillMd = {
    metadata: {
      name: 'untitled-skill',
      description: '',
      version: '0.1.0',
      keywords: [],
      triggers: [],
      skillMdPath: filePath,
    },
    instructions: '',
  };

  if (typeof content !== 'string' || content.trim().length === 0) {
    return fallback;
  }

  try {
    const lines = content.split(/\r?\n/);

    // # Skill Name
    let name = fallback.metadata.name;
    for (const line of lines) {
      const match = line.match(/^#\s+(\S.*)$/);
      if (match) {
        name = match[1].trim();
        break;
      }
    }

    // Split into sections by `## Heading`.
    const sections = parseSections(lines);

    // ## Description — falls back to the first paragraph after the title.
    let description = sections.get('description')?.trim() ?? '';
    if (description.length === 0) {
      description = firstParagraphAfterTitle(lines);
    }

    // ## When to Use — list items become triggers.
    const triggers = listItems(sections.get('when to use'));

    // ## Tools — extract tool names (full definitions come from skill.ts).
    const toolNames = extractToolNames(sections.get('tools'));

    // Everything after `## Instructions` (raw, trimmed).
    const instructions = sections.get('instructions')?.trim() ?? '';

    const keywords = extractKeywords(name, description, ...triggers, ...toolNames);

    return {
      metadata: {
        name,
        description: description || name,
        version: '0.1.0',
        keywords,
        triggers,
        skillMdPath: filePath,
      },
      instructions,
    };
  } catch {
    // Never throw on parse — return best-effort defaults.
    return fallback;
  }
}

/**
 * Options for {@link loadSkillFromDirectory} and {@link loadSkillsFromDirectory}.
 */
export interface SkillLoaderOptions {
  /**
   * File system adapter. Defaults to a Node/Bun-aware implementation;
   * pass an `expo-file-system`-based adapter on React Native.
   */
  fileSystem?: ReadWriteFileSystem;
  /**
   * Loads the skill implementation module (`skill.ts`) for a directory.
   *
   * Cross-platform module loading can't be done generically — the host
   * passes its own loader (e.g. Metro's `require.context` or a static map
   * of imports). Defaults to a dynamic `import()` (Node/Bun only).
   */
  loadSkillModule?: (skillTsPath: string) => Promise<Partial<Skill>>;
}

/**
 * Load a skill from a directory containing `SKILL.md` and `skill.ts`.
 *
 * The directory structure:
 *
 * ```text
 * skills/calendar/
 *   SKILL.md        # parsed by parseSkillMd
 *   skill.ts        # default export: Partial<Skill> with tools
 * ```
 *
 * The `skill.ts` module supplies `tools`; metadata and instructions come from
 * `SKILL.md`. When the module cannot be loaded, the skill is returned with
 * empty tools and a warning (metadata is still valid).
 *
 * @param directoryPath - the skill directory
 * @param options - file system / module loader overrides
 * @returns the fully assembled skill
 */
export async function loadSkillFromDirectory(
  directoryPath: string,
  options?: SkillLoaderOptions,
): Promise<Skill> {
  const fileSystem = options?.fileSystem ?? createDefaultFileSystem();
  const skillMdPath = joinPath(directoryPath, 'SKILL.md');

  let content: string;
  try {
    content = await fileSystem.readFile(skillMdPath);
  } catch (error) {
    throw new Error(
      `loadSkillFromDirectory: could not read SKILL.md at "${skillMdPath}". ` +
        'On React Native, pass a SkillLoaderOptions.fileSystem adapter built on expo-file-system. ' +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const parsed = parseSkillMd(content, skillMdPath);

  let tools: Record<string, Tool> = {};
  const skillTsPath = joinPath(directoryPath, 'skill.ts');
  try {
    const module = options?.loadSkillModule
      ? await options.loadSkillModule(skillTsPath)
      : await loadSkillModuleDefault(skillTsPath);
    tools = (module?.tools ?? {}) as Record<string, Tool>;
  } catch (error) {
    console.warn(
      `[agent-runtime] Failed to load skill implementation from "${skillTsPath}"; ` +
        'the skill is registered without tools.',
      error,
    );
  }

  return {
    metadata: parsed.metadata,
    tools,
    instructions: parsed.instructions,
  };
}

/**
 * Load all skills from a directory of skill subdirectories.
 *
 * Each direct child directory containing a `SKILL.md` is loaded via
 * {@link loadSkillFromDirectory}. Child directories without a `SKILL.md` are
 * skipped.
 *
 * @param skillsDirectoryPath - directory containing one subdirectory per skill
 * @param options - file system / module loader overrides
 * @returns the loaded skills (one per child directory with a `SKILL.md`)
 */
export async function loadSkillsFromDirectory(
  skillsDirectoryPath: string,
  options?: SkillLoaderOptions,
): Promise<Skill[]> {
  const fileSystem = options?.fileSystem ?? createDefaultFileSystem();
  if (typeof fileSystem.readDir !== 'function') {
    throw new Error(
      'loadSkillsFromDirectory requires a fileSystem with readDir(). ' +
        'On React Native, pass a SkillLoaderOptions.fileSystem adapter built on expo-file-system.',
    );
  }

  const children = await fileSystem.readDir(skillsDirectoryPath);
  const skills: Skill[] = [];
  for (const child of children) {
    const childPath = joinPath(skillsDirectoryPath, child);
    try {
      skills.push(await loadSkillFromDirectory(childPath, options));
    } catch (error) {
      console.warn(
        `[agent-runtime] Skipping "${childPath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return skills;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split markdown lines into `## Heading` → body sections (case-insensitive).
 */
function parseSections(lines: string[]): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines) {
    const match = line.match(/^##\s+(\S.*)$/);
    if (match) {
      current = match[1].trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
    } else if (current) {
      sections.get(current)!.push(line);
    }
  }
  const result = new Map<string, string>();
  for (const [key, body] of sections) {
    result.set(key, body.join('\n').trim());
  }
  return result;
}

/**
 * Find the first non-empty, non-heading paragraph after the `#` title.
 */
function firstParagraphAfterTitle(lines: string[]): string {
  let afterTitle = false;
  for (const line of lines) {
    if (line.match(/^#\s+/)) {
      afterTitle = true;
      continue;
    }
    if (afterTitle) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('#')) {
        return trimmed;
      }
    }
  }
  return '';
}

/**
 * Extract list items from a section body: `- item`, `* item`, `1. item`.
 * Non-list non-empty lines are kept as-is (best-effort for prose bodies).
 */
function listItems(body: string | undefined): string[] {
  if (!body) return [];
  const items: string[] = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      const item = bullet[1].trim();
      if (item.length > 0) items.push(item);
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      const item = numbered[1].trim();
      if (item.length > 0) items.push(item);
      continue;
    }
    items.push(line);
  }
  return items;
}

/**
 * Extract tool names from the `## Tools` section body.
 *
 * Recognizes `` - `tool.name({ params })` — description ``, `` - `toolName` ``,
 * `- **toolName** — description`, and bare first-word entries.
 */
function extractToolNames(body: string | undefined): string[] {
  if (!body) return [];
  const names = new Set<string>();
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const backtick = line.match(/`([^`]+)`/);
    if (backtick) {
      const token = backtick[1].trim();
      const callMatch = token.match(/^([A-Za-z_][\w.]*)\s*\(/);
      if (callMatch) {
        names.add(callMatch[1]);
        continue;
      }
      const bare = token.replace(/[{}(),]/g, '').trim();
      if (bare.length > 0 && !/\s/.test(bare)) names.add(bare);
      continue;
    }

    const bold = line.match(/\*\*([^*]+)\*\*/);
    if (bold) {
      const name = bold[1].trim();
      if (name.length > 0 && !/\s/.test(name)) names.add(name);
      continue;
    }

    const firstWord = line.replace(/^[-*•\d.)\s]+/, '').split(/\s+/)[0] ?? '';
    if (/^[A-Za-z_]/.test(firstWord)) names.add(firstWord);
  }
  return Array.from(names);
}

/**
 * Keywords derived from the title, description, triggers, and tool names.
 */
function extractKeywords(...sources: string[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const source of sources) {
    for (const raw of source.split(/[^A-Za-z0-9_'.-]+/)) {
      const word = raw.toLowerCase().replace(/^['.-]+|['.-]+$/g, '');
      if (word.length < 3 || STOPWORDS.has(word)) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      keywords.push(word);
    }
  }
  return keywords;
}

/** Common English stopwords excluded from keyword extraction. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these',
  'those', 'it', 'its', 'you', 'your', 'yours', 'we', 'our', 'ours', 'they',
  'their', 'them', 'not', 'no', 'as', 'at', 'by', 'from', 'up', 'down', 'about',
  'into', 'over', 'after', 'under', 'using', 'use', 'uses', 'when', 'what',
  'which', 'who', 'whom', 'how', 'can', 'could', 'should', 'would', 'will',
  'has', 'have', 'had', 'do', 'does', 'did', 'if', 'then', 'than', 'so', 'too',
  'very', 'just', 'also', 'more', 'most', 'some', 'any', 'all', 'each', 'other',
  'such', 'only', 'own', 'same', 'both', 'between', 'through', 'during',
]);

/**
 * Default skill-module loader: dynamic `import()` (Node/Bun).
 */
async function loadSkillModuleDefault(skillTsPath: string): Promise<Partial<Skill>> {
  const imported = await import(skillTsPath);
  const mod = imported?.default ?? imported;
  return (mod ?? {}) as Partial<Skill>;
}
