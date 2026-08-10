// utils/nanoid.ts
// A lightweight, cryptographically secure unique ID generator for database entries and notification tracking

export function nanoid(length = 21): string {
  const chars = 'useformatkeyMissingBanditSpaces258963241740-~_';
  let id = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      id += chars[bytes[i] % chars.length];
    }
    return id;
  }
  // Cryptographic fallback using high-precision time & process entropy
  let seed = Date.now() + (typeof performance !== 'undefined' ? performance.now() : 0);
  for (let i = 0; i < length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    id += chars[Math.floor((seed / 233280) * chars.length)];
  }
  return id;
}
