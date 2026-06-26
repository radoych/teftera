import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/** Monotonic suffix so every subscription gets a distinct channel topic. */
let channelSeq = 0;

/**
 * Subscribe to live changes on a household's transactions. Returns a cleanup
 * function that removes the channel.
 *
 * The topic carries a per-call sequence suffix because realtime-js's
 * `channel(topic)` returns an EXISTING channel when one with the same topic is
 * still registered, and `removeChannel()` only deregisters asynchronously. With
 * a fixed topic, a fast unmount→remount (cleanup's removal not yet resolved)
 * would get the still-subscribed channel back and `.on()` would throw
 * "cannot add postgres_changes callbacks after subscribe()". A unique topic per
 * call guarantees a fresh, unsubscribed channel; the stale one is removed by its
 * own cleanup. At steady state there is exactly one channel per household.
 */
export function subscribeToTransactions(
  client: SupabaseClient,
  householdId: string,
  onChange: () => void,
): () => void {
  const channel: RealtimeChannel = client
    .channel(`transactions:${householdId}:${(channelSeq += 1)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `household_id=eq.${householdId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
