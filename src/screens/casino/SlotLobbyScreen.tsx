import { useNavigation } from '@/components/Navigation';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { SymbolArt } from '@/components/slots/SymbolArt';
import { THEMES, themeStyle } from '@/components/slots/themes';
import '@/components/slots/premiumSlots.css';
import { MACHINE_IDS } from '@/casino/premium/engine';
import { useI18n } from '@/i18n';

/** All slot machines: the eight premium machines plus the original Gold Rush saloon machine. */
export function SlotLobbyScreen() {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  return (
    <CasinoFrame title={t('slotsPremium.lobbyTitle')} subtitle={t('slotsPremium.lobbySubtitle')} back="home" scenario="lounge" maxWidth="max-w-4xl">
      <p className="text-sm text-[var(--cz-muted)] px-1">{t('slotsPremium.lobbyHint')}</p>
      <div className="ps-lobby-grid">
        {MACHINE_IDS.map((id) => {
          const th = THEMES[id];
          return (
            <button key={id} type="button" className="ps-tile" style={themeStyle(th)} onClick={() => navigate('slotMachine', { machine: id })}>
              <span className="ps-tile-inner">
                <span className="ps-tile-reels" aria-hidden>
                  {(['seven', 'star', 'gold'] as const).map((s) => (
                    <span key={s}>
                      <SymbolArt skin={th.symbols[s]} wild={s === 'star'} />
                    </span>
                  ))}
                </span>
                <span className="ps-tile-name">
                  <span aria-hidden>{th.emoji} </span>
                  {t(`slotsPremium.machines.${id}.name`)}
                </span>
                <span className="ps-tile-tag">{t(`slotsPremium.machines.${id}.tag`)}</span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="ps-tile"
          style={{ '--ps-metal1': '#e9c77a', '--ps-metal2': '#6b4516', '--ps-bg1': '#2b1608', '--ps-bg2': '#120903', '--ps-glow': 'rgba(230,170,80,0.5)' } as React.CSSProperties}
          onClick={() => navigate('slots')}
        >
          <span className="ps-tile-inner">
            <span className="ps-tile-reels" aria-hidden>
              {(['seven', 'eagle', 'gold'] as const).map((s) => (
                <span key={s} className="!bg-[#fffaf0]">
                  <SlotSymbolIcon symbol={s} className="w-[78%] h-[78%]" />
                </span>
              ))}
            </span>
            <span className="ps-tile-name">
              <span aria-hidden>🤠 </span>
              {t('casino.slots.marquee')}
            </span>
            <span className="ps-tile-tag">{t('slotsPremium.goldRushTag')}</span>
          </span>
        </button>
      </div>
    </CasinoFrame>
  );
}
