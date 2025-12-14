/**
 * Normalization utilities for consistent data matching
 * Used for analyst, department, owner fields to ensure 
 * "Marina Dávila" matches "Marina Davila" in filters
 */

/**
 * Normalize a key for consistent matching:
 * - Convert to lowercase
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Remove accents/diacritics
 */
export function normalizeKey(value: string | null | undefined): string {
  if (!value) return '';
  
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .normalize('NFD')       // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritical marks
}

/**
 * Compare two values for equality using normalized keys
 */
export function normalizedEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeKey(a) === normalizeKey(b);
}

/**
 * Check if normalized value contains normalized search term
 */
export function normalizedIncludes(value: string | null | undefined, search: string | null | undefined): boolean {
  if (!search) return true;
  if (!value) return false;
  return normalizeKey(value).includes(normalizeKey(search));
}

/**
 * Create a normalized lookup map from a list of values
 */
export function createNormalizedMap<T>(
  items: T[],
  keyExtractor: (item: T) => string | null | undefined
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  
  for (const item of items) {
    const key = normalizeKey(keyExtractor(item));
    if (!key) continue;
    
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }
  
  return map;
}
