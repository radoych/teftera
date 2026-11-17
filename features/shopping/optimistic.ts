// features/shopping/optimistic.ts — optimistic writes reconciled with the household sync. Pure.
//
// Why not just "update local state, then let the next refetch replace it"
// (spec §8.4)? Because the shared sync (features/sync/householdSync.ts) can
// apply a load that STARTED BEFORE our write committed but LANDS AFTER it —
// e.g. a realtime event from the other phone in flight while we check an
// item. Overwriting local state with that stale result would un-check the
// row, and the echo of our own write is then skipped by the sync's settle
// window, so the stale state could stick until the next change.
//
// So server rows and pending ops are kept apart and the view is always
// `applyPending(server, ops)`:
//   1. `run(op, write)` records the op and publishes the overlaid view at once.
//   2. Writes run one at a time in call order (check → uncheck reaches the DB
//      in that order).
//   3. A failed write drops its op (the view reverts) and reports the error.
//   4. A committed write stamps its op with a commit clock tick and asks for a
//      refresh. Each load captures `mark()` (the clock) BEFORE fetching; when
//      it lands, `setServer(data, mark)` drops exactly the ops committed
//      before that fetch began — the data is guaranteed to contain them.
//      Ops committed later, or still in flight, stay overlaid.
// The realtime echo of our own write, whether it reloads or is skipped by the
// settle window, therefore never makes the UI flicker or regress.
import type { ShoppingList, ShoppingListItem } from './types';

export type PendingOp =
  | { kind: 'check'; itemId: string; checkedAt: string | null; checkedBy: string | null }
  | { kind: 'addItem'; item: ShoppingListItem }
  | { kind: 'updateItem'; itemId: string; name: string; quantity: string | null }
  | { kind: 'removeItem'; itemId: string }
  | { kind: 'clearChecked'; listId: string }
  | { kind: 'setCard'; listId: string; cardId: string | null }
  | { kind: 'removeList'; listId: string };

export interface ShoppingData {
  lists: ShoppingList[];
  items: ShoppingListItem[];
}

const EMPTY: ShoppingData = { lists: [], items: [] };

function applyOne(data: ShoppingData, op: PendingOp): ShoppingData {
  switch (op.kind) {
    case 'check':
      return {
        ...data,
        items: data.items.map((i) =>
          i.id === op.itemId ? { ...i, checked_at: op.checkedAt, checked_by: op.checkedBy } : i,
        ),
      };
    case 'addItem':
      // The insert carries a client-generated id, so once the server row is
      // back it simply wins — same id, same React key, no remount.
      return data.items.some((i) => i.id === op.item.id)
        ? data
        : { ...data, items: [...data.items, op.item] };
    case 'updateItem':
      return {
        ...data,
        items: data.items.map((i) =>
          i.id === op.itemId ? { ...i, name: op.name, quantity: op.quantity } : i,
        ),
      };
    case 'removeItem':
      return { ...data, items: data.items.filter((i) => i.id !== op.itemId) };
    case 'clearChecked':
      return {
        ...data,
        items: data.items.filter((i) => !(i.list_id === op.listId && i.checked_at !== null)),
      };
    case 'setCard':
      return {
        ...data,
        lists: data.lists.map((l) =>
          l.id === op.listId ? { ...l, loyalty_card_id: op.cardId } : l,
        ),
      };
    case 'removeList':
      return {
        lists: data.lists.filter((l) => l.id !== op.listId),
        items: data.items.filter((i) => i.list_id !== op.listId),
      };
  }
}

/** Server rows with the pending ops replayed on top, in order. */
export function applyPending(server: ShoppingData, ops: readonly PendingOp[]): ShoppingData {
  return ops.reduce(applyOne, server);
}

export interface OptimisticEngineDeps {
  /** Receives every new overlaid view (write it to the store). */
  publish: (view: ShoppingData) => void;
  /** Ask for a reload after a commit. Fire-and-forget. */
  refresh: () => void;
  /** A write failed and its op was reverted (log). */
  onError: (err: unknown, op: PendingOp) => void;
}

export interface OptimisticEngine {
  /** Commit clock — read it before a fetch starts, pass it to `setServer` with the result. */
  mark: () => number;
  /** A load landed: replace server rows, drop ops committed before `mark`, publish. */
  setServer: (data: ShoppingData, mark: number) => void;
  /** Apply `op` now, run `write` after earlier writes; resolves false (reverted) on failure. */
  run: (op: PendingOp, write: () => Promise<void>) => Promise<boolean>;
  /** The current overlaid view. */
  view: () => ShoppingData;
  pendingCount: () => number;
  /** Signed out / left the household: forget everything. */
  reset: () => void;
}

interface Entry {
  op: PendingOp;
  /** Commit-clock tick at which the write succeeded; null = still in flight. */
  committedAt: number | null;
}

export function createOptimisticEngine(deps: OptimisticEngineDeps): OptimisticEngine {
  let server: ShoppingData = EMPTY;
  let entries: Entry[] = [];
  let clock = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let current: ShoppingData = EMPTY;

  const publish = () => {
    current = applyPending(
      server,
      entries.map((e) => e.op),
    );
    deps.publish(current);
  };

  const remove = (entry: Entry) => {
    const before = entries.length;
    entries = entries.filter((e) => e !== entry);
    return entries.length !== before;
  };

  return {
    mark: () => clock,

    setServer(data, mark) {
      server = data;
      entries = entries.filter((e) => e.committedAt === null || e.committedAt > mark);
      publish();
    },

    run(op, write) {
      const entry: Entry = { op, committedAt: null };
      entries = [...entries, entry];
      publish();
      const result = queue.then(write).then(
        () => {
          // Detached by reset() → nothing to reconcile.
          if (!entries.includes(entry)) return true;
          clock += 1;
          entry.committedAt = clock;
          deps.refresh();
          return true;
        },
        (err: unknown) => {
          if (remove(entry)) publish();
          deps.onError(err, op);
          return false;
        },
      );
      queue = result;
      return result;
    },

    view: () => current,
    pendingCount: () => entries.length,

    reset() {
      server = EMPTY;
      entries = [];
      publish();
    },
  };
}
