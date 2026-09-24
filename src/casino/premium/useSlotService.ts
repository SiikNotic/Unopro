import { useMemo, useRef } from 'react';
import { useWallet } from '../useWallet';
import { storage } from '@/storage';
import { createLocalSlotService, RECEIPTS_KEY } from './localHouse';
import { createRemoteSlotService } from './remoteHouse';
import { createAnonAuth } from './anonAuth';
import { remoteConfig } from './config';
import type { SlotService } from './service';

const receiptStore = { get: () => storage.get<unknown>(RECEIPTS_KEY), set: (v: unknown) => storage.set(RECEIPTS_KEY, v) };

/** The server when one is configured at build time, otherwise the local house on the wallet ledger. */
export function useSlotService(): SlotService {
  const { balance, bookInstantRound, wasSettled } = useWallet();
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  return useMemo(() => {
    const remote = remoteConfig();
    if (remote) {
      return createRemoteSlotService({
        url: remote.apiUrl,
        getToken: createAnonAuth({ authUrl: remote.authUrl, apiKey: remote.apiKey }),
        headers: { apikey: remote.apiKey },
      });
    }
    return createLocalSlotService({ book: bookInstantRound, wasSettled, getBalance: () => balanceRef.current, store: receiptStore });
  }, [bookInstantRound, wasSettled]);
}
