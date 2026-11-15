import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeToHouseholdTable, subscribeToTransactions } from './realtimeChannel';

/**
 * Faithful fake of realtime-js's channel reuse semantics (RealtimeClient.js):
 * channel(topic) returns an EXISTING channel when one with the same topic is
 * still registered, and removeChannel() removes it only asynchronously. This
 * reproduces the production crash where a fast unmount→remount reuses an
 * already-subscribed channel and `.on()` throws.
 */
class FakeChannel {
  subscribed = false;
  onCalls = 0;
  constructor(public topic: string) {}
  on(): this {
    if (this.subscribed) {
      throw new Error(
        `cannot add \`postgres_changes\` callbacks for ${this.topic} after \`subscribe()\`.`,
      );
    }
    this.onCalls += 1;
    return this;
  }
  subscribe(): this {
    this.subscribed = true;
    return this;
  }
}

class FakeClient {
  channels: FakeChannel[] = [];
  channel(topic: string): FakeChannel {
    const realtimeTopic = `realtime:${topic}`;
    const exists = this.channels.find((c) => c.topic === realtimeTopic);
    if (exists) return exists;
    const chan = new FakeChannel(realtimeTopic);
    this.channels.push(chan);
    return chan;
  }
  // Async, like realtime-js: the channel lingers until the unsubscribe resolves.
  removeChannel(chan: FakeChannel): Promise<'ok'> {
    return Promise.resolve().then(() => {
      this.channels = this.channels.filter((c) => c !== chan);
      return 'ok' as const;
    });
  }
}

function fakeClient(): { client: SupabaseClient; fake: FakeClient } {
  const fake = new FakeClient();
  return { client: fake as unknown as SupabaseClient, fake };
}

describe('subscribeToTransactions', () => {
  it('subscribes a channel and wires the change callback', () => {
    const { client, fake } = fakeClient();
    const cleanup = subscribeToTransactions(client, 'H', () => {});

    expect(fake.channels).toHaveLength(1);
    const chan = fake.channels[0];
    expect(chan).toBeDefined();
    expect(chan!.subscribed).toBe(true);
    expect(chan!.onCalls).toBe(1);

    cleanup();
  });

  it('does not reuse an already-subscribed channel across a fast remount', () => {
    const { client } = fakeClient();

    // Mount, then unmount — removeChannel is async and has NOT resolved yet.
    const cleanup1 = subscribeToTransactions(client, 'H', () => {});
    cleanup1();

    // Remount before the async removal completes (the production race).
    expect(() => subscribeToTransactions(client, 'H', () => {})).not.toThrow();
  });
});

describe('subscribeToHouseholdTable', () => {
  it('filters the named table by household and gives each table its own topic', () => {
    const { client, fake } = fakeClient();
    const on = jest.spyOn(FakeChannel.prototype, 'on');
    const a = subscribeToHouseholdTable(client, 'vendors', 'H', () => {});
    const b = subscribeToHouseholdTable(client, 'vendor_aliases', 'H', () => {});

    expect(fake.channels.map((c) => c.topic.split(':')[1])).toEqual(['vendors', 'vendor_aliases']);
    expect(on.mock.calls[0]).toEqual([
      'postgres_changes',
      { event: '*', schema: 'public', table: 'vendors', filter: 'household_id=eq.H' },
      expect.any(Function),
    ]);

    on.mockRestore();
    a();
    b();
  });
});
