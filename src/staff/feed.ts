// Live updates for the staff dashboard: coalesces bursts of database changes into one refresh, ignores
// events it has already seen (reconnects can replay), and cleans up everything it started.
import type { LiveChange } from '@/account/live';

export interface StaffFeedOptions {
  /** Opens the subscription; resolves to its closer. */
  subscribe: (onChange: (c: LiveChange) => void) => Promise<() => void>;
  /** Called once per burst, with the tables that changed. */
  onRefresh: (tables: Set<string>) => void;
  debounceMs?: number;
}

export function createStaffFeed(opts: StaffFeedOptions) {
  const wait = opts.debounceMs ?? 400;
  const seen = new Set<string>();
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let close: (() => void) | null = null;
  let stopped = false;

  const onChange = (c: LiveChange) => {
    if (stopped) return;
    // The audit log is append-only: an id seen once is never news again.
    if (c.table === 'admin_audit' && c.row?.id !== undefined) {
      const key = `a${String(c.row.id)}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 2000) seen.clear();
    }
    pending.add(c.table);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const tables = pending;
      pending = new Set();
      if (!stopped) opts.onRefresh(tables);
    }, wait);
  };

  return {
    async start() {
      const c = await opts.subscribe(onChange);
      if (stopped) c();
      else close = c;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      close?.();
      close = null;
    },
    /** For tests. */
    get active() {
      return !stopped && close !== null;
    },
  };
}
