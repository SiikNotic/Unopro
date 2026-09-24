import { Play } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { Cabinet, MachineLogo } from '@/components/slots/Cabinet';
import { SymbolArt } from '@/components/slots/SymbolArt';
import { art3d } from '@/components/slots/art3d';
import { MachineFacts, Sheet } from '@/components/slots/SlotSheets';
import { PRESENTATION } from '@/components/slots/presentation';
import '@/components/slots/premiumSlots.css';
import { isMachineId, MACHINE_IDS } from '@/casino/premium/engine';
import type { MachineId } from '@/casino/premium/engine';
import { MACHINES } from '@/casino/premium/machines';
import { useI18n } from '@/i18n';

const VOL_BARS = { low: 1, medium: 2, 'medium-high': 3, high: 4 } as const;

/** Signature symbols of a machine: its top symbol, its wild and its scatter (or next best). */
function signature(id: MachineId): string[] {
  const m = MACHINES[id];
  const wild = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'wild');
  const scatter = Object.keys(m.symbols).find((s) => m.symbols[s].kind === 'scatter');
  const second = Object.keys(m.symbols).find((s) => s !== m.top && m.symbols[s].kind === 'regular');
  return [m.top, wild ?? second!, scatter ?? second!].filter((s, i, a) => a.indexOf(s) === i).concat(second ? [second] : []).slice(0, 3);
}

function Art({ id, symbols }: { id: MachineId; symbols: string[] }) {
  const m = MACHINES[id];
  const look = PRESENTATION[id];
  return (
    <div className="sl-art mc-window" aria-hidden>
      {symbols.map((s) => (
        <span key={s} className="ps-tile-sym ps-reel">
          <SymbolArt def={look.symbols[s]} style={look.style} kind={m.symbols[s].kind} src={art3d(id, s)} />
        </span>
      ))}
    </div>
  );
}

function Tile({ id, onOpen }: { id: MachineId; onOpen: () => void }) {
  const { t } = useI18n();
  const m = MACHINES[id];
  return (
    <button type="button" className={`sl-tile mc-${id}`} style={PRESENTATION[id].palette as React.CSSProperties} onClick={onOpen} aria-label={t('slotsPremium.openPreview', { name: t(`slotsPremium.machines.${id}.name`) })}>
      <Cabinet id={id} compact>
        <header className="mc-top">
          <MachineLogo id={id} name={t(`slotsPremium.machines.${id}.name`)} />
          <span className="sl-status">{t('slotsPremium.available')}</span>
        </header>
        <Art id={id} symbols={signature(id)} />
        <span className="sl-meta">
          <span className="inline-flex items-center gap-1.5" title={t('slotsPremium.facts.volatility')}>
            <span className="sl-vol" aria-hidden>
              {[1, 2, 3, 4].map((n) => (
                <i key={n} className={n <= VOL_BARS[m.volatility] ? 'on' : ''} style={{ height: 4 + n * 3 }} />
              ))}
            </span>
            {t(`slotsPremium.volatility.${m.volatility}`)}
          </span>
          <span className="whitespace-nowrap">{t('slotsPremium.upTo', { x: m.maxWin.toLocaleString() })}</span>
        </span>
        <span className="sl-play">{t('slotsPremium.play')}</span>
      </Cabinet>
    </button>
  );
}

function Preview({ id, onPlay, onClose }: { id: MachineId; onPlay: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const m = MACHINES[id];
  const all = Object.keys(m.symbols).slice(0, 5);
  return (
    <Sheet title={t(`slotsPremium.machines.${id}.name`)} onClose={onClose}>
      <div className={`sl-tile mc-${id} pointer-events-none`} style={PRESENTATION[id].palette as React.CSSProperties}>
        <Cabinet id={id} compact>
          <header className="mc-top">
            <MachineLogo id={id} name={t(`slotsPremium.machines.${id}.name`)} />
            <span className="mc-sub block">{t(`slotsPremium.machines.${id}.tag`)}</span>
          </header>
          <Art id={id} symbols={all} />
        </Cabinet>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/85">{t(`slotsPremium.machines.${id}.about`)}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/85">
        <strong className="text-[var(--cz-gold)]">{t('slotsPremium.rules.feature')}: </strong>
        {t(`slotsPremium.machines.${id}.featureRule`)}
      </p>
      <div className="mt-4">
        <MachineFacts machine={id} />
      </div>
      <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full mt-4" onClick={onPlay}>
        <Play className="w-5 h-5" /> {t('slotsPremium.playNamed', { name: t(`slotsPremium.machines.${id}.name`) })}
      </button>
    </Sheet>
  );
}

/** All slot machines. Lobby → preview → PLAY → machine; the preview is a history step (back closes it). */
export function SlotLobbyScreen() {
  const { t } = useI18n();
  const { navigate, back, params } = useNavigation();
  const previewing = isMachineId(params.machine) ? params.machine : null;

  return (
    <CasinoFrame title={t('slotsPremium.lobbyTitle')} subtitle={t('slotsPremium.lobbySubtitle')} back="home" scenario="lounge" maxWidth="max-w-4xl">
      <p className="text-sm text-[var(--cz-muted)] px-1">{t('slotsPremium.lobbyHint')}</p>
      <div className="sl-grid">
        {MACHINE_IDS.map((id) => (
          <Tile key={id} id={id} onOpen={() => navigate('slotLobby', { machine: id })} />
        ))}
        <button type="button" className="sl-tile" onClick={() => navigate('slots')}>
          <div className="mc" style={{ '--m-bg': '#2b1608', '--m-reel': '#fffaf0', '--m-text': '#fff3dc', '--spin-face': 'linear-gradient(180deg,#f5c451,#b57b16)', '--spin-ink': '#2b1608', '--spin-ring': '#6b4516' } as React.CSSProperties}>
            <div className="mc-shell" style={{ padding: 4, borderRadius: 18, background: 'linear-gradient(160deg,#e9c77a,#6b4516)' }}>
              <div className="mc-cab" style={{ borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 10px', background: 'radial-gradient(120% 70% at 50% 0%, #4a2610, #1d0e05)' }}>
                <header className="mc-top">
                  <span className="mc-logo block" style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: '#f5c451' }}>{t('casino.slots.marquee')}</span>
                  <span className="sl-status">{t('slotsPremium.available')}</span>
                </header>
                <div className="sl-art" aria-hidden>
                  {(['seven', 'eagle', 'gold'] as const).map((s) => (
                    <span key={s} style={{ borderRadius: 8 }}>
                      <SlotSymbolIcon symbol={s} className="w-[80%] h-[80%]" />
                    </span>
                  ))}
                </div>
                <span className="sl-meta"><span>{t('slotsPremium.goldRushTag')}</span></span>
                <span className="sl-play">{t('slotsPremium.play')}</span>
              </div>
            </div>
          </div>
        </button>
      </div>
      {previewing && <Preview id={previewing} onClose={() => back('slotLobby')} onPlay={() => navigate('slotMachine', { machine: previewing }, { replace: true })} />}
    </CasinoFrame>
  );
}
