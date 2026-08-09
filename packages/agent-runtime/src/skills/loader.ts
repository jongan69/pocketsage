import type { SkillMetadata } from '../types';

/**
 * Parse a SKILL.md file into structured metadata and instructions.
 *
 * Expected format:
 *   # Skill Name
 *   ## Description (optional — falls back to first paragraph)
 *   ## When to Use
 *   - trigger phrase
 *   ## Tools
 *   - `tool.name({ params })` — description
 *   ## Instructions
 *   ... freeform instructions ...
 */
export function parseSkillMd(
  content: string,
  _filePath: string,
): { metadata: SkillMetadata; instructions: string } {
  const lines = content.split('\n');

  let name = 'Unknown Skill';
  let description = '';
  const triggers: string[] = [];
  const keywords: string[] = [];
  let instructions = '';
  let currentSection: 'header' | 'when' | 'tools' | 'instructions' | 'none' = 'header';

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith('# ') && currentSection === 'header') {
      name = trimmed.replace(/^#\s+/, '').trim();
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (lower.startsWith('## ') && lower.includes('when to use')) {
      currentSection = 'when';
      continue;
    }
    if (lower.startsWith('## ') && lower.includes('tool')) {
      currentSection = 'tools';
      continue;
    }
    if (lower.startsWith('## ') && lower.includes('instruction')) {
      currentSection = 'instructions';
      continue;
    }
    if (lower.startsWith('## ') && lower.includes('description')) {
      currentSection = 'none';
      continue;
    }

    switch (currentSection) {
      case 'header':
        // First non-empty paragraph becomes description
        if (trimmed && !description && !trimmed.startsWith('#')) {
          description = trimmed;
        }
        break;
      case 'when':
        if (trimmed.startsWith('-')) {
          const trigger = trimmed.replace(/^-\s*/, '').trim();
          if (trigger) triggers.push(trigger);
        }
        break;
      case 'tools':
        if (trimmed.startsWith('-')) {
          // Parse tool list for keyword extraction
          const cleaned = trimmed.replace(/^-\s*/, '');
          const nameMatch = cleaned.match(/`([a-z_]+\.[a-z_]+)`/i);
          if (nameMatch) {
            const parts = nameMatch[1].split('.');
            keywords.push(...parts);
          }
        }
        break;
      case 'instructions':
        instructions += (instructions ? '\n' : '') + trimmed;
        break;
    }
  }

  // If no description found, use first line after title
  if (!description) {
    for (const line of lines) {
      const t = line.trim();
      if (t && !t.startsWith('#') && !t.startsWith('##')) {
        description = t;
        break;
      }
    }
  }

  // Extract keywords from name
  const nameLower = name.toLowerCase();
  for (const word of nameLower.split(/\s+/)) {
    if (word.length > 2 && !keywords.includes(word)) {
      keywords.push(word);
    }
  }

  return {
    metadata: {
      name: name.toLowerCase().replace(/\s+/g, '-'),
      description: description || name,
      version: '0.1.0',
      keywords: [...new Set(keywords)],
      triggers,
      skillMdPath: _filePath,
    },
    instructions: instructions || `${name} skill loaded successfully.`,
  };
}
