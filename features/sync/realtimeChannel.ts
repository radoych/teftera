import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Household-scoped tables the app watches over realtime. Each one must have a
 * `household_id` column, be in the `supabase_realtime` publication, and use
 * `replica identity full` — the `household_id=eq.` filter cannot match a
 * DELETE event otherwise.
 */
export type HouseholdTable =
  | 'transactions'
  | 'vendors'
  | 'vendor_aliases'
  | 'loyalty_cards'
  | 'shopping_lists'
  | 'shopping_list_items';

/** Monotonic suffix so every subscription gets a distinct channel topic. */
let channelSeq = 0;

/**
 * Subscribe to live changes on one household-scoped table. Returns a cleanup
 * function that removes the channel.
 *
 * The topic carries a per-call sequence suffix because realtime-js's
 * `channel(topic)` returns an EXISTING channel when one with the same topic is
 * still registered, and `removeChannel()` only deregisters asynchronously. With
 * a fixed topic, a fast unmount→remount (cleanup's removal not yet resolved)
 * would get the still-subscribed channel back and `.on()` would throw
 * "cannot add postgres_changes callbacks after subscribe()". A unique topic per
 * call guarantees a fresh, unsubscribed channel; the stale one is removed by its
 * own cleanup. At steady state there is exactly one channel per table per
 * household.
 */
export function subscribeToHouseholdTable(
  client: SupabaseClient,
  table: HouseholdTable,
  householdId: string,
  onChange: () => void,
): () => void {
  const channel: RealtimeChannel = client
    .channel(`${table}:${householdId}:${(channelSeq += 1)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `household_id=eq.${householdId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/** Kept for existing callers. */
export const subscribeToTransactions = (
  client: SupabaseClient,
  householdId: string,
  onChange: () => void,
): (() => void) => subscribeToHouseholdTable(client, 'transactions', householdId, onChange);
