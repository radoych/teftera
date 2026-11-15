/**
 * Up to two uppercase initials from a display name ("Радослав Иванов" → "РИ").
 * Splits on any whitespace and takes whole code points, so a name starting
 * with an emoji or astral character is not cut in half. Empty → "?".
 */
export function initials(displayName: string): string {
  const letters = displayName
    .trim()
    .split(/\s+/)
    .map((part) => Array.from(part)[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  return letters.toUpperCase() || '?';
}
