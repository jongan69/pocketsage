/**
 * Single-flight generation queue.
 *
 * The ExecuTorch JSI bridge is NOT thread-safe. Concurrent LLM calls will
 * crash the native runtime. This queue ensures only one generation runs at
 * a time. Subsequent calls wait for the active one to complete.
 *
 * Adapted from PrepAI's single-flight pattern.
 */

let generationTail: Promise<void> = Promise.resolve();

/**
 * Enqueue an async operation so it runs after any in-progress generation.
 * Returns a promise that resolves with the operation's result.
 */
export async function enqueueGeneration<T>(work: () => Promise<T>): Promise<T> {
  const previous = generationTail;

  let release!: () => void;
  generationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Wait for the previous operation to finish
  await previous;

  try {
    return await work();
  } finally {
    release();
  }
}

/** Reset the queue (useful in tests). */
export function resetGenerationQueue(): void {
  generationTail = Promise.resolve();
}
