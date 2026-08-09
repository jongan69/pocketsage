/**
 * RFC 4122 v4 UUID generation.
 *
 * Prefers `crypto.randomUUID()` when the runtime exposes it (Hermes on newer
 * React Native builds), otherwise falls back to `crypto.getRandomValues`,
 * and finally to a Math.random-based implementation. Every path produces a
 * standards-compliant UUID string.
 */

function generateRandomFallback(): string {
  const bytes = new Uint8Array(16);
  const cryptoImpl = globalThis.crypto;
  if (cryptoImpl && typeof cryptoImpl.getRandomValues === 'function') {
    cryptoImpl.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Set version (4) and variant (10) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuid(): string {
  const cryptoImpl = globalThis.crypto;
  if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') {
    return cryptoImpl.randomUUID();
  }
  return generateRandomFallback();
}
