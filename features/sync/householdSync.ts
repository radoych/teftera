// features/sync/householdSync.ts — shared load/refresh/realtime plumbing for household data.
import { supabase } from '@/services/supabase';
import { trailingDebounce } from '@/lib/debounce';
import { subscribeToHouseholdTable, type HouseholdTable } from './realtimeChannel';

/** Realtime-change debounce before a reload (ms). */
export const SYNC_DEBOUNCE_MS = 400;
/** A realtime event this soon after a completed load is assumed to be our own write echoing back (ms). */
export const SYNC_SETTLE_MS = 750;

export interface HouseholdSyncOptions<T> {
  /** Dev-log prefix, e.g. 'transactions'. */
  label: string;
  /** Tables whose changes trigger a reload; all funnel into one debounced reload. */
  tables: readonly HouseholdTable[];
  /** Fetch the household's data. Pure I/O — must not touch stores. */
  load: (householdId: string) => Promise<T>;
  /** Write a fresh result into the store. Skipped for results that went stale. */
  apply: (data: T, householdId: string) => void;
  /** Clear the store (signed out / left the household). */
  reset: () => void;
  /** Runs once when a household's sync starts, before the first load. */
  onStart?: (householdId: string) => void;
  /** Runs when a background (mount / realtime) load fails. Explicit refreshes reject instead. */
  onError?: (err: unknown) => void;
  debounceMs?: number;
  settleMs?: number;
}

export interface HouseholdSyncDeps {
  subscribe: (table: HouseholdTable, householdId: string, onChange: () => void) => () => void;
  now: () => number;
}

export const defaultHouseholdSyncDeps: HouseholdSyncDeps = {
  subscribe: (table, householdId, onChange) =>
    subscribeToHouseholdTable(supabase, table, householdId, onChange),
  now: () => Date.now(),
};

export interface HouseholdSync {
  /**
   * Reload now and resolve once the store holds data fetched *after* this call
   * (so it is safe to call right after a write). Calls made while a load is in
   * flight share one follow-up load. Rejects if that load fails.
   */
  refresh: (householdId: string) => Promise<void>;
  /** Initial load + realtime subscriptions for one household. Returns the cleanup. */
  start: (householdId: string) => () => void;
  /** Drop any in-flight result and clear the store. */
  reset: () => void;
}

/**
 * Build the sync for one household-scoped dataset. One instance per feature,
 * at module level; screens call `refresh`, the (app) layout mounts the hook
 * (`useHouseholdSync(sync)`).
 *
 * Reload coalescing (code-review P1):
 * - at most one load runs at a time; explicit `refresh` calls that arrive
 *   while one is in flight share a single follow-up load (a load that started
 *   before a write cannot be trusted to contain it);
 * - a realtime change coalesces onto an in-flight / queued load, and is
 *   skipped entirely within `settleMs` of a completed load — that event is
 *   almost always the echo of the write we just refreshed for. Trade-off: a
 *   change from the other phone inside that window waits for the next event or
 *   refresh.
 * - results from a superseded household (cleanup / reset ran since the load
 *   began) are dropped instead of applied.
 */
export function createHouseholdSync<T>(
  options: HouseholdSyncOptions<T>,
  deps: HouseholdSyncDeps = defaultHouseholdSyncDeps,
): HouseholdSync {
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  const settleMs = options.settleMs ?? SYNC_SETTLE_MS;

  let generation = 0;
  let inFlight: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  let lastLoadedAt = Number.NEGATIVE_INFINITY;

  function supersede(): void {
    generation += 1;
    inFlight = null;
    queued = null;
    lastLoadedAt = Number.NEGATIVE_INFINITY;
  }

  function backgroundError(gen: number) {
    return (err: unknown) => {
      if (gen !== generation) return;
      if (__DEV__) console.warn(`[${options.label}] load failed`, err);
      options.onError?.(err);
    };
  }

  let loadSeq = 0;

  function runLoad(householdId: string): Promise<void> {
    const gen = generation;
    const seq = (loadSeq += 1);
    const p = (async () => {
      try {
        // Deferred a tick so `inFlight` is assigned before any `finally` runs,
        // even if `load` throws synchronously.
        const data = await Promise.resolve().then(() => options.load(householdId));
        if (gen !== generation) return;
        options.apply(data, householdId);
        lastLoadedAt = deps.now();
      } finally {
        if (gen === generation && seq === loadSeq) inFlight = null;
      }
    })();
    inFlight = p;
    return p;
  }

  function refresh(householdId: string): Promise<void> {
    if (queued) return queued;
    const current = inFlight;
    if (!current) return runLoad(householdId);
    const gen = generation;
    const next: Promise<void> = current
      .catch(() => undefined)
      .then(() => {
        if (gen !== generation) return;
        if (queued === next) queued = null;
        return runLoad(householdId);
      });
    queued = next;
    return next;
  }

  function onRealtimeChange(householdId: string): void {
    if (inFlight || queued) return;
    if (deps.now() - lastLoadedAt < settleMs) return;
    runLoad(householdId).catch(backgroundError(generation));
  }

  function start(householdId: string): () => void {
    supersede();
    const gen = generation;
    options.onStart?.(householdId);
    runLoad(householdId).catch(backgroundError(gen));

    const reload = trailingDebounce(() => onRealtimeChange(householdId), debounceMs);
    const unsubscribers = options.tables.map((table) =>
      deps.subscribe(table, householdId, () => reload.call()),
    );

    return () => {
      if (gen === generation) supersede();
      reload.cancel();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }

  function reset(): void {
    supersede();
    options.reset();
  }

  return { refresh, start, reset };
}
