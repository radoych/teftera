import type { DashboardSection, DashboardSectionKey } from './types';

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[] = [
  { key: 'categories', visible: true },
  { key: 'recent', visible: true },
];

const KNOWN_KEYS: DashboardSectionKey[] = ['categories', 'recent'];

/**
 * Normalize stored sections: keep stored order, append any known section that is
 * missing (visible), and drop unknown keys. Forward/backward-safe so adding a
 * new section key later just appends it for existing users.
 */
export function resolveDashboardSections(
  stored?: DashboardSection[] | null,
): DashboardSection[] {
  if (!stored || stored.length === 0) {
    return DEFAULT_DASHBOARD_SECTIONS.map((s) => ({ ...s }));
  }
  const seen = new Set<DashboardSectionKey>();
  const result: DashboardSection[] = [];
  for (const s of stored) {
    if (KNOWN_KEYS.includes(s.key) && !seen.has(s.key)) {
      result.push({ key: s.key, visible: s.visible !== false });
      seen.add(s.key);
    }
  }
  for (const key of KNOWN_KEYS) {
    if (!seen.has(key)) result.push({ key, visible: true });
  }
  return result;
}

/** Immutably move an array item from one index to another. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr.slice();
  }
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** Toggle one section's visibility by key (immutable). */
export function setSectionVisible(
  sections: DashboardSection[],
  key: DashboardSectionKey,
  visible: boolean,
): DashboardSection[] {
  return sections.map((s) => (s.key === key ? { ...s, visible } : s));
}
