import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { MACHINE_IDS } from '@/casino/premium/engine';
import { PRESENTATION } from '@/components/slots/presentation';
import { MACHINES } from '@/casino/premium/machines';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking arbitrary JSON
type Dict = Record<string, any>;

const keys = (o: unknown, prefix = ''): string[] =>
  o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k)) : [prefix];

describe('locales', () => {
  it('Spanish and English have exactly the same keys', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it('every slot machine and symbol has a name in both languages', () => {
    for (const dict of [es, en] as unknown as Dict[]) {
      for (const id of MACHINE_IDS) {
        expect(dict.slotsPremium.machines[id].name).toBeTruthy();
        expect(dict.slotsPremium.machines[id].tag).toBeTruthy();
        for (const skin of Object.values(PRESENTATION[id].symbols)) expect(dict.slotsPremium.sym[skin.label], `${id}:${skin.label}`).toBeTruthy();
        for (const k of ['about', 'featureRule', 'cheer', 'ready', ...(MACHINES[id].features.freeSpins ? ['freeRule'] : [])]) expect(dict.slotsPremium.machines[id][k], `${id}.${k}`).toBeTruthy();
      }
    }
  });

  it('has a message for every spin error', () => {
    const codes = ['insufficient_funds', 'invalid_bet', 'invalid_machine', 'conflict', 'unauthorized', 'rate_limited', 'offline', 'network', 'timeout', 'server', 'bad_response', 'uncertain'];
    for (const dict of [es, en] as unknown as Dict[]) for (const c of codes) expect(dict.slotsPremium.errors[c]).toBeTruthy();
  });
});
