import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaffFeed } from '../feed';
import type { LiveChange } from '@/account/live';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness() {
  let emit: (c: LiveChange) => void = () => {};
  const close = vi.fn();
  const onRefresh = vi.fn();
  const feed = createStaffFeed({
    subscribe: async (cb) => {
      emit = cb;
      return close;
    },
    onRefresh,
    debounceMs: 300,
  });
  return { feed, close, onRefresh, emit: (c: LiveChange) => emit(c) };
}

describe('staff live feed', () => {
  it('coalesces a burst of changes into one refresh', async () => {
    const h = harness();
    await h.feed.start();
    h.emit({ table: 'account_wallets', eventType: 'UPDATE', row: { user_id: 'a' } });
    h.emit({ table: 'admin_audit', eventType: 'INSERT', row: { id: 1 } });
    h.emit({ table: 'account_bans', eventType: 'INSERT', row: { id: 7 } });
    expect(h.onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
    expect([...h.onRefresh.mock.calls[0][0]].sort()).toEqual(['account_bans', 'account_wallets', 'admin_audit']);
  });

  it('ignores a replayed audit entry (no duplicate events)', async () => {
    const h = harness();
    await h.feed.start();
    h.emit({ table: 'admin_audit', eventType: 'INSERT', row: { id: 42 } });
    vi.advanceTimersByTime(300);
    h.emit({ table: 'admin_audit', eventType: 'INSERT', row: { id: 42 } });
    vi.advanceTimersByTime(300);
    expect(h.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('stop closes the subscription once and nothing fires afterwards (no leaks)', async () => {
    const h = harness();
    await h.feed.start();
    expect(h.feed.active).toBe(true);
    h.emit({ table: 'account_wallets', eventType: 'UPDATE', row: {} });
    h.feed.stop();
    h.feed.stop();
    vi.advanceTimersByTime(1000);
    h.emit({ table: 'account_wallets', eventType: 'UPDATE', row: {} });
    vi.advanceTimersByTime(1000);
    expect(h.onRefresh).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.feed.active).toBe(false);
  });

  it('stopping before the subscription opened still closes it when it arrives', async () => {
    const h = harness();
    const started = h.feed.start();
    h.feed.stop();
    await started;
    expect(h.close).toHaveBeenCalledTimes(1);
  });
});
