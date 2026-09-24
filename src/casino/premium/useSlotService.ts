import { useMemo, useRef } from 'react';
import { useWallet } from '../useWallet';
import { storage } from '@/storage';
import { createLocalSlotService, RECEIPT_PREFIX } from './localHouse';
import { createRemoteSlotService } from './remoteHouse';
import { createAnonAuth } from './anonAuth';
import { remoteConfig } from './config';
import type { SlotService } from './service';
import { onlineConfig, tokenFor } from '@/games/online/client';
import { casinoUrl } from '@/account/casinoApi';

export const receiptStore = {
  all(): unknown[] {
    const out: unknown[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(RECEIPT_PREFIX)) out.push(storage.get<unknown>(k));
      }
    } catch {
      // storage unavailable: no receipts
    }
    return out;
  },
  put: (id: string, v: unknown) => storage.set(RECEIPT_PREFIX + id, v),
  remove: (id: string) => storage.remove(RECEIPT_PREFIX + id),
};

// The journal used to be one shared list (lost entries when two tabs booked at once): drop the old key.
storage.remove('carta.slots.receipts');

/** The server when one is configured at build time, otherwise the local house on the wallet ledger. */
export function useSlotService(): SlotService {
  const { balance, bookInstantRound, wasSettled, mode } = useWallet();
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  return useMemo(() => {
    // A signed-in player plays for account coins: the casino server decides and books every spin.
    const online = mode === 'account' ? onlineConfig() : null;
    if (online) {
      return createRemoteSlotService({ url: casinoUrl(online), getToken: () => tokenFor(online), headers: { apikey: online.apiKey } });
    }
    const remote = remoteConfig();
    if (remote) {
      return createRemoteSlotService({
        url: remote.apiUrl,
        getToken: createAnonAuth({ authUrl: remote.authUrl, apiKey: remote.apiKey }),
        headers: { apikey: remote.apiKey },
      });
    }
    return createLocalSlotService({ book: bookInstantRound, wasSettled, getBalance: () => balanceRef.current, store: receiptStore });
  }, [mode, bookInstantRound, wasSettled]);
}
