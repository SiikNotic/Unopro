import { useEffect, useRef, useState } from 'react';
import { Hand as HandIcon, HelpCircle, Plus, RotateCcw, Split, Square, Layers, Trash2, X } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { Chip, ChipSelector } from '@/components/casino/chips';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { CardShoe, ChipStacks, DiscardTray, FeltArt } from '@/components/casino/blackjackArt';
import { SaloonBackdrop } from '@/components/casino/SaloonBackdrop';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { MIN_BET } from '@/casino/wallet';
import * as bj from '@/casino/blackjack';
import type { PlayingCard } from '@/casino/cards';
import { randomSeed } from '@/game/engine';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { playSfx } from '@/audio/sfx';

// The table survives leaving the screen (not a reload), so a hand in progress is never lost by navigating.
let savedTable: bj.BlackjackState | null = null;
let savedBet = 0;

function CardRow({ cards, width, hideHole = false, dealtFrom = 0 }: { cards: PlayingCard[]; width: number; hideHole?: boolean; dealtFrom?: number }) {
  return (
    <div className="flex justify-center" style={{ minHeight: width * 1.5 }}>
      {cards.map((card, i) => (
        <PlayingCardView
          key={card.id}
          card={card}
          width={width}
          faceDown={hideHole && i === 1}
          className={i >= dealtFrom ? 'casino-deal' : ''}
          style={{ marginLeft: i > 0 ? -width * (cards.length > 3 ? 0.62 : 0.42) : 0, animationDelay: `${Math.max(0, i - dealtFrom) * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function totalLabel(cards: PlayingCard[]): string {
  const { total, soft } = bj.handTotal(cards);
  return soft && total < 21 ? `${total - 10}/${total}` : String(total);
}

const OUTCOME_PLAQUE: Record<bj.Outcome, string> = {
  blackjack: 'bj-plaque-win',
  win: 'bj-plaque-win',
  push: 'bj-plaque-push',
  lose: 'bj-plaque-lose',
};

function RulesSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="gr5-help-backdrop" onClick={onClose}>
      <div className="gr5-help p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="bj-help-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 id="bj-help-title" className="gr-title text-xl">{t('casino.blackjack.helpTitle')}</h2>
          <button type="button" className="gr5-btn w-10 h-10 min-h-0 p-0" onClick={onClose} aria-label={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="flex flex-col gap-2 text-sm text-white/85 list-disc pl-5">
          {['goal', 'values', 'actions', 'dealer', 'pays'].map((k) => (
            <li key={k}>{t(`casino.blackjack.help.${k}`)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BlackjackScreen() {
  const { t } = useI18n();
  const { balance, spend, credit } = useWallet();
  const reduced = useReducedMotion();
  const vw = useViewport().width;
  const [table, setTable] = useState<bj.BlackjackState>(() => savedTable ?? bj.createBlackjack(randomSeed()));
  const [bet, setBet] = useState(savedBet);
  const [lastBet, setLastBet] = useState(savedBet);
  const [chip, setChip] = useState(25);
  const [help, setHelp] = useState(false);
  // Dealer cards revealed so far once the round settles (one by one, for suspense).
  const [dealerShown, setDealerShown] = useState(table.phase === 'SETTLED' ? table.dealer.length : 2);
  const prevPhase = useRef(table.phase);
  const resultPending = useRef(false);

  useEffect(() => {
    savedTable = table;
    savedBet = bet;
  }, [table, bet]);

  const settledVisible = table.phase === 'SETTLED' && dealerShown >= table.dealer.length;

  // Reveal the dealer's hand card by card, then play the result sound.
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = table.phase;
    if (table.phase !== 'SETTLED' || was === 'SETTLED') return;
    if (reduced) {
      setDealerShown(table.dealer.length);
      return;
    }
    setDealerShown(2);
    let shown = 2;
    const id = window.setInterval(() => {
      shown++;
      if (shown > table.dealer.length) {
        window.clearInterval(id);
        return;
      }
      setDealerShown(shown);
      playSfx('cardPlay');
    }, 480);
    return () => window.clearInterval(id);
  }, [table, reduced]);

  useEffect(() => {
    if (!settledVisible || !resultPending.current) return;
    resultPending.current = false;
    const outcomes = table.results.map((r) => r.outcome);
    if (outcomes.includes('blackjack') || outcomes.includes('win')) playSfx('cashIn');
    else if (outcomes.every((o) => o === 'push')) playSfx('chip');
    else playSfx('defeat');
  }, [settledVisible, table.results]);

  /** Moves to the next table state, paying out when the round has just settled. */
  const apply = (next: bj.BlackjackState, fromPhase: bj.Phase = table.phase) => {
    if (next.phase === 'SETTLED' && fromPhase !== 'SETTLED') {
      credit(bj.totalPayout(next));
      resultPending.current = true;
    }
    setTable(next);
  };

  const betting = table.phase !== 'PLAYER';
  const addChip = () => {
    if (bet + chip > balance) return;
    playSfx('chip');
    setBet((b) => b + chip);
  };

  const dealWith = (amount: number) => {
    if (amount < MIN_BET || !spend(amount)) {
      playSfx('error');
      return;
    }
    playSfx('roundStart');
    setLastBet(amount);
    setBet(0);
    setDealerShown(2);
    // A fresh round starts from betting, even when the previous one is still on the table.
    apply(bj.deal(table, amount), 'BETTING');
  };

  const doExtra = (action: 'double' | 'split') => {
    if (!spend(bj.extraStake(table, action))) {
      playSfx('error');
      return;
    }
    playSfx('chip');
    apply(action === 'double' ? bj.double(table) : bj.split(table));
  };

  const cardWidth = Math.round(Math.min(92, Math.max(50, vw * 0.16)));
  const handWidth = table.hands.length > 1 ? Math.round(cardWidth * 0.8) : cardWidth;
  const inPlay = table.phase === 'PLAYER';
  const dealerCards = inPlay ? table.dealer : table.dealer.slice(0, dealerShown);
  const netResult = settledVisible ? bj.totalPayout(table) - table.hands.reduce((s, h) => s + h.bet, 0) : 0;
  const hasRound = table.hands.length > 0;
  const extraDouble = bj.canDouble(table) && balance >= bj.extraStake(table, 'double');
  const extraSplit = bj.canSplit(table) && balance >= bj.extraStake(table, 'split');
  const dealerBust = settledVisible && bj.isBust(table.dealer);

  // Result plaque: the reason for a single hand, the net for split hands.
  let banner = '';
  if (settledVisible) {
    if (table.hands.length === 1) {
      const hand = table.hands[0];
      banner = t(`casino.blackjack.reason.${bj.resultReason(hand, table.dealer)}`, {
        player: bj.handTotal(hand.cards).total,
        dealer: bj.handTotal(table.dealer).total,
      });
    } else banner = netResult > 0 ? t('casino.youWon', { amount: netResult }) : netResult < 0 ? t('casino.youLost', { amount: -netResult }) : t('casino.blackjack.pushed');
  }
  const bannerTone = netResult > 0 ? 'bj-banner-win' : netResult < 0 ? 'bj-banner-lose' : '';

  return (
    <CasinoFrame title={t('casino.blackjack.short')} subtitle={t('casino.blackjack.rules')} back="casino" scenario="lounge" backdrop={<SaloonBackdrop />}>
      {help && <RulesSheet onClose={() => setHelp(false)} />}

      <section className="bj-table mx-auto w-full max-w-[760px]" aria-label={t('casino.blackjack.table')}>
        {['8%', '30%', '50%', '70%', '92%'].map((left, i) => (
          <span key={left} className="bj-stud" style={{ left, bottom: i === 0 || i === 4 ? '26%' : i === 2 ? '3px' : '9%', transform: 'translateX(-50%)' }} aria-hidden />
        ))}
        <div className="bj-felt px-2 pt-2 pb-10 sm:pb-14 flex flex-col items-center gap-2" style={{ minHeight: cardWidth * 4.6 + 60 }}>
          <FeltArt topText={t('casino.blackjack.feltTop')} bottomText={t('casino.blackjack.feltBottom')} />
          <div className="absolute left-2 top-2 sm:left-5 sm:top-3 opacity-90">
            <DiscardTray width={Math.round(cardWidth * 0.5)} />
          </div>
          <CardShoe className="absolute right-2 top-2 sm:right-5 sm:top-3 w-14 h-10 sm:w-24 sm:h-[68px] drop-shadow-lg" />

          {/* Dealer */}
          <div className="relative flex flex-col items-center gap-1.5 mt-1">
            {hasRound ? (
              <CardRow cards={dealerCards} width={cardWidth} hideHole={inPlay} dealtFrom={inPlay ? 0 : 2} />
            ) : (
              <div style={{ height: cardWidth * 1.5 }} />
            )}
            <span className={`bj-plaque text-xs sm:text-sm ${dealerBust ? 'bj-plaque-lose' : ''}`}>
              {t('casino.blackjack.dealer')}
              {hasRound && <strong>{dealerBust ? t('casino.blackjack.bust') : totalLabel(inPlay ? table.dealer.slice(0, 1) : dealerCards)}</strong>}
            </span>
          </div>

          {/* Result plaque */}
          <div className="relative min-h-[52px] flex items-center justify-center px-3 my-1" role="status" aria-live="polite">
            {settledVisible && <p className={`bj-banner text-sm sm:text-lg ${bannerTone}`}>{banner}</p>}
            {!hasRound && <p className="text-white/70 text-sm text-center max-w-[240px]">{t('casino.blackjack.placeBet')}</p>}
          </div>

          {/* Player hands */}
          <div className="relative flex justify-center gap-3 sm:gap-8 w-full">
            {hasRound &&
              table.hands.map((hand, i) => {
                const active = inPlay && i === table.active && table.hands.length > 1;
                const result = settledVisible ? table.results[i] : undefined;
                return (
                  <div key={i} className={`flex flex-col items-center gap-1.5 rounded-2xl p-1 transition-shadow ${active ? 'ring-2 ring-gold-400/80 bg-black/10' : ''}`}>
                    <CardRow cards={hand.cards} width={handWidth} />
                    <span className={`bj-plaque text-xs sm:text-sm ${result ? OUTCOME_PLAQUE[result.outcome] : ''}`}>
                      {result ? t(`casino.blackjack.outcome.${result.outcome}`) : t('casino.blackjack.total')}
                      <strong>{totalLabel(hand.cards)}</strong>
                    </span>
                    <span className="flex items-center gap-1 text-white text-xs font-bold tabular-nums">
                      <Chip value={hand.bet} size={20} label="" />
                      {hand.bet}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Bet spot with the player's chip stacks beside it */}
          {betting && (
            <div className="relative flex items-end justify-center gap-3 sm:gap-6 mt-1">
              <ChipStacks balance={balance - bet} size={vw < 380 ? 22 : 28} />
              <button
                type="button"
                onClick={addChip}
                disabled={bet + chip > balance}
                className="bj-spot w-[88px] h-[88px] sm:w-24 sm:h-24 flex flex-col items-center justify-center gap-1 text-white disabled:opacity-60"
                aria-label={t('casino.addChip', { amount: chip })}
              >
                {bet > 0 ? (
                  <>
                    <Chip value={bet} size={44} />
                    <span className="text-xs font-extrabold tabular-nums">{bet}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-6 h-6 text-[#e9c46a]" aria-hidden />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-[#e9c46a]">{t('casino.bet')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Controls */}
      <div className="bj-rail mx-auto w-full max-w-[760px] p-3 sm:p-4 flex flex-col gap-3">
        {inPlay ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className="gr5-btn" onClick={() => { playSfx('draw'); apply(bj.hit(table)); }}>
              <Plus className="w-5 h-5" /> {t('casino.blackjack.hit')}
            </button>
            <button type="button" className="gr5-btn" onClick={() => { playSfx('turn'); apply(bj.stand(table)); }}>
              <HandIcon className="w-5 h-5" /> {t('casino.blackjack.stand')}
            </button>
            <button type="button" className="gr5-btn" disabled={!extraDouble} onClick={() => doExtra('double')}>
              <Layers className="w-5 h-5" /> {t('casino.blackjack.double')}
            </button>
            <button type="button" className="gr5-btn" disabled={!extraSplit} onClick={() => doExtra('split')}>
              <Split className="w-5 h-5" /> {t('casino.blackjack.split')}
            </button>
          </div>
        ) : (
          <>
            <ChipSelector selected={chip} onSelect={(v) => { setChip(v); playSfx('chip'); }} max={Math.max(0, balance - bet)} />
            <div className="flex gap-2">
              <button type="button" className="gr5-btn w-12 shrink-0 p-0" aria-label={t('casino.clear')} title={t('casino.clear')} disabled={bet === 0} onClick={() => setBet(0)}>
                <Trash2 className="w-5 h-5" />
              </button>
              {bet === 0 && lastBet > 0 && table.phase === 'SETTLED' ? (
                <button type="button" className="gr5-btn gr5-btn-on flex-1" disabled={lastBet > balance} onClick={() => dealWith(lastBet)}>
                  <RotateCcw className="w-4 h-4" /> {t('casino.rebet', { amount: lastBet })}
                </button>
              ) : (
                <button type="button" className="gr5-btn gr5-btn-on flex-1" disabled={bet < MIN_BET} onClick={() => dealWith(bet)}>
                  <Square className="w-4 h-4" /> {t('casino.blackjack.deal')}
                </button>
              )}
              <button type="button" className="gr5-btn w-12 shrink-0 p-0" aria-label={t('casino.blackjack.helpTitle')} title={t('casino.blackjack.helpTitle')} onClick={() => setHelp(true)}>
                <HelpCircle className="w-5 h-5" />
              </button>
            </div>
            <p className="text-center text-[11px] text-white/55">{t('casino.minBet', { amount: MIN_BET })}</p>
          </>
        )}
      </div>
    </CasinoFrame>
  );
}
