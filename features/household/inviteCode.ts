/** Uppercase and strip everything that isn't a letter or digit (dashes, spaces). */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Display an invite code grouped as XXXX-XXXX. Codes of 4 chars or fewer are returned as-is. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  if (c.length <= 4) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}`;
}
