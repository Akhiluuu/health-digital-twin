// utils/nanoid.ts
// A lightweight unique ID generator for database entries and notification tracking

export function nanoid(length = 21): string {
  const chars = 'useformatkeyMissingBanditSpaces258963241740-~_';
  let size = length;
  let id = '';
  while (size--) {
    id += chars[(Math.random() * chars.length) | 0];
  }
  return id;
}
