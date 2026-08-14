import type { ChunkOptions } from '../types';

/**
 * Default maximum chunk size in characters.
 */
const DEFAULT_MAX_CHUNK_SIZE = 500;

/**
 * Default overlap in characters between consecutive chunks.
 */
const DEFAULT_OVERLAP = 50;

/**
 * Split text into sentence-aware chunks for embedding and retrieval.
 *
 * Chunks are built greedily from sentences. A new chunk starts at the most
 * recent sentence boundary inside the overlap window of the previous chunk,
 * so overlapping content stays sentence-aligned whenever possible. A single
 * sentence (or word) longer than `maxChunkSize` is hard-broken at
 * `maxChunkSize` character boundaries.
 *
 * Edge cases:
 * - Empty or whitespace-only input returns `[]`.
 * - Input shorter than or equal to `maxChunkSize` returns `[text]` unchanged.
 * - A single word longer than `maxChunkSize` is broken into fixed-size pieces.
 * - `overlap` is clamped to `[0, maxChunkSize - 1]` to guarantee forward
 *   progress through the text.
 *
 * @param text - the text to chunk
 * @param options - optional overrides for `maxChunkSize` (default 500) and
 *   `overlap` (default 50)
 * @returns an array of chunk strings; never `undefined` or `null`
 */
export function chunkText(text: string, options?: Partial<ChunkOptions>): string[] {
  const maxChunkSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlap = Math.max(0, Math.min(options?.overlap ?? DEFAULT_OVERLAP, maxChunkSize - 1));

  if (typeof text !== 'string' || text.length === 0) return [];
  if (text.length <= maxChunkSize) return [text];

  // Tokenize into sentence pieces, hard-breaking any single piece that
  // exceeds maxChunkSize (e.g. a giant word or a run without delimiters).
  const pieces: string[] = [];
  for (const sentence of splitIntoSentences(text)) {
    if (sentence.length <= maxChunkSize) {
      pieces.push(sentence);
    } else {
      for (let i = 0; i < sentence.length; i += maxChunkSize) {
        pieces.push(sentence.slice(i, i + maxChunkSize));
      }
    }
  }

  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    if (current.length + piece.length <= maxChunkSize) {
      current += piece;
      continue;
    }
    // Current chunk is full — commit it and start the next one from the
    // overlap window of its tail, backed up to a sentence boundary when one
    // exists inside the window.
    chunks.push(current);
    if (overlap > 0) {
      const tail = current.slice(-overlap);
      const boundary = lastSentenceBoundaryIndex(tail);
      let nextStart = boundary >= 0 ? tail.slice(boundary + 1) : tail;
      // Clamp the overlap so it never pushes a chunk over maxChunkSize
      // (e.g. when the next piece is a hard-broken word fragment).
      if (nextStart.length + piece.length > maxChunkSize) {
        nextStart = nextStart.slice(0, Math.max(0, maxChunkSize - piece.length));
      }
      current = nextStart;
    } else {
      current = '';
    }
    current += piece;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Split text into sentence pieces, preserving the delimiters.
 */
function splitIntoSentences(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  let index = 0;

  while (index < text.length) {
    if (!isSentenceDelimiter(text[index])) {
      index += 1;
      continue;
    }
    index += 1;
    while (
      index < text.length &&
      (isSentenceDelimiter(text[index]) ||
        text[index] === ' ' ||
        text[index] === '\t' ||
        text[index] === '\r')
    ) {
      index += 1;
    }
    pieces.push(text.slice(start, index));
    start = index;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces.length > 0 ? pieces : [text];
}

function isSentenceDelimiter(value: string): boolean {
  return value === '.' || value === '!' || value === '?' || value === '\n' || value === '。';
}

/**
 * Return the index of the last sentence delimiter (`.`, `!`, `?`, `\n`, `。`)
 * in the given string, or `-1` if there is none.
 */
function lastSentenceBoundaryIndex(value: string): number {
  for (let i = value.length - 1; i >= 0; i--) {
    const c = value[i];
    if (c === '.' || c === '!' || c === '?' || c === '\n' || c === '。') {
      return i;
    }
  }
  return -1;
}
