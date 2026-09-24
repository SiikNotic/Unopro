import { useEffect, useRef, useState } from 'react';
import { Hand as HandIcon, Plus, RotateCcw, Split, Square, Layers, Trash2 } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { Chip, ChipSelector } from '@/components/casino/chips';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { Button } from '@/components/ui/Button';
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

function TotalBadge({ cards, highlight }: { cards: PlayingCard[]; highlight?: boolean }) {
  const { total, soft } = bj.handTotal(cards);
  const shown = soft && total < 21 ? `${total - 10}/${total}` : String(total);
  return (
    <span className={`inline-flex items-center justify-center min-w-[40px] h-7 px-2 rounded-full text-sm font-extrabold tabular-nums shadow ${highlight ? 'bg-gold-400 text-ink-950' : 'bg-black/55 text-white'}`}>
      {shown}
    </span>
  );
}

const OUTCOME_STYLE: Record<bj.Outcome, string> = {
  blackjack: 'bg-gradient-to-b from-gold-400 to-gold-600 text-ink-950',
  win: 'bg-success-500 text-ink-950',
  push: 'bg-white/85 text-ink-950',
  lose: 'bg-danger-500 text-white',
};

export function BlackjackScreen() {
  const { t } = useI18n();
  const { balance, spend, credit } = useWallet();
  const reduced = useReducedMotion();
  const vw = useViewport().width;
  const [table, setTable] = useState<bj.BlackjackState>(() => savedTable ?? bj.createBlackjack(randomSeed()));
  const [bet, setBet] = useState(savedBet);
  const [lastBet, setLastBet] = useState(savedBet);
  const [chip, setChip] = useState(25);
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

  const cardWidth = Math.round(Math.min(84, Math.max(52, vw * 0.17)));
  const handWidth = table.hands.length > 1 ? Math.round(cardWidth * 0.8) : cardWidth;
  const inPlay = table.phase === 'PLAYER';
  const dealerCards = inPlay ? table.dealer : table.dealer.slice(0, dealerShown);
  const netResult = settledVisible ? bj.totalPayout(table) - table.hands.reduce((s, h) => s + h.bet, 0) : 0;
  const hasRound = table.hands.length > 0;
  const extraDouble = bj.canDouble(table) && balance >= bj.extraStake(table, 'double');
  const extraSplit = bj.canSplit(table) && balance >= bj.extraStake(table, 'split');

  return (
    <CasinoFrame title={t('casino.blackjack.short')} subtitle={t('casino.blackjack.rules')} back="casino" scenario="lounge">
      <section className="casino-felt mx-2 mt-1 px-3 py-4 sm:px-6 sm:py-6 flex flex-col items-center gap-3" aria-label={t('casino.blackjack.table')}>
        {/* Dealer */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          <div className="flex items-center gap-2 text-white/80 text-xs font-bold uppercase tracking-widest">
            {t('casino.blackjack.dealer')}
            {hasRound && <TotalBadge cards={inPlay ? table.dealer.slice(0, 1) : dealerCards} />}
          </div>
          {hasRound ? (
            <CardRow cards={dealerCards} width={cardWidth} hideHole={inPlay} dealtFrom={inPlay ? 0 : 2} />
          ) : (
            <div style={{ height: cardWidth * 1.5 }} className="flex items-center">
              <PlayingCardView card={{ id: 'back', rank: 'A', suit: 'S' }} faceDown width={cardWidth} className="opacity-60" />
            </div>
          )}
        </div>

        <p className="casino-felt-print text-[10px] sm:text-xs text-center">{t('casino.blackjack.feltPrint')}</p>

        {/* Player hands */}
        <div className="flex justify-center gap-3 sm:gap-8 w-full">
          {hasRound ? (
            table.hands.map((hand, i) => {
              const active = inPlay && i === table.active && table.hands.length > 1;
              const result = settledVisible ? table.results[i] : undefined;
              return (
                <div key={i} className={`flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-shadow ${active ? 'ring-2 ring-gold-400/80 bg-black/10' : ''}`}>
                  <CardRow cards={hand.cards} width={handWidth} />
                  <div className="flex items-center gap-1.5">
                    <TotalBadge cards={hand.cards} highlight={active} />
                    <span className="flex items-center gap-1 text-white text-xs font-bold tabular-nums">
                      <Chip value={hand.bet} size={22} label="" />
                      {hand.bet}
                    </span>
                  </div>
                  {result && (
                    <span className={`casino-pop rounded-full px-3 py-0.5 text-xs font-extrabold uppercase tracking-wide shadow ${OUTCOME_STYLE[result.outcome]}`}>
                      {t(`casino.blackjack.outcome.${result.outcome}`)}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ height: cardWidth * 1.5 }} className="flex items-center text-white/60 text-sm text-center px-4">
              {t('casino.blackjack.placeBet')}
            </div>
          )}
        </div>

        {/* Bet spot */}
        {betting && (
          <button
            type="button"
            onClick={addChip}
            disabled={bet + chip > balance}
            className="mt-1 w-24 h-24 rounded-full border-2 border-dashed border-white/35 flex flex-col items-center justify-center gap-1 text-white hover:border-gold-400/80 transition-colors disabled:opacity-60"
            aria-label={t('casino.addChip', { amount: chip })}
          >
            {bet > 0 ? (
              <>
                <Chip value={bet} size={44} />
                <span className="text-xs font-extrabold tabular-nums">{bet}</span>
              </>
            ) : (
              <>
                <Plus className="w-6 h-6 text-white/70" aria-hidden />
                <span className="text-[11px] font-bold uppercase tracking-wide text-white/70">{t('casino.bet')}</span>
              </>
            )}
          </button>
        )}
      </section>

      {settledVisible && (
        <p className={`text-center font-display font-extrabold text-lg casino-pop ${netResult > 0 ? 'text-gold-400' : netResult < 0 ? 'text-white/75' : 'text-white'}`} role="status">
          {netResult > 0 ? t('casino.youWon', { amount: netResult }) : netResult < 0 ? t('casino.youLost', { amount: -netResult }) : t('casino.blackjack.pushed')}
        </p>
      )}

      {/* Controls */}
      <div className="glass-strong rounded-3xl p-3 sm:p-4 flex flex-col gap-3">
        {inPlay ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button icon={<Plus className="w-5 h-5" />} onClick={() => { playSfx('draw'); apply(bj.hit(table)); }}>
              {t('casino.blackjack.hit')}
            </Button>
            <Button variant="secondary" icon={<HandIcon className="w-5 h-5" />} onClick={() => { playSfx('turn'); apply(bj.stand(table)); }}>
              {t('casino.blackjack.stand')}
            </Button>
            <Button variant="secondary" icon={<Layers className="w-5 h-5" />} disabled={!extraDouble} onClick={() => doExtra('double')}>
              {t('casino.blackjack.double')}
            </Button>
            <Button variant="secondary" icon={<Split className="w-5 h-5" />} disabled={!extraSplit} onClick={() => doExtra('split')}>
              {t('casino.blackjack.split')}
            </Button>
          </div>
        ) : (
          <>
            <ChipSelector selected={chip} onSelect={(v) => { setChip(v); playSfx('chip'); }} max={Math.max(0, balance - bet)} />
            <div className="flex gap-2">
              <button
                type="button"
                aria-label={t('casino.clear')}
                title={t('casino.clear')}
                disabled={bet === 0}
                onClick={() => setBet(0)}
                className="btn-game btn-secondary shrink-0 w-12 min-h-[48px] rounded-2xl flex items-center justify-center"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              {bet === 0 && lastBet > 0 && table.phase === 'SETTLED' ? (
                <Button className="flex-1" icon={<RotateCcw className="w-4 h-4" />} disabled={lastBet > balance} onClick={() => dealWith(lastBet)}>
                  {t('casino.rebet', { amount: lastBet })}
                </Button>
              ) : (
                <Button className="flex-1" icon={<Square className="w-4 h-4" />} disabled={bet < MIN_BET} onClick={() => dealWith(bet)}>
                  {t('casino.blackjack.deal')}
                </Button>
              )}
            </div>
            <p className="text-center text-[11px] text-ink-400">{t('casino.minBet', { amount: MIN_BET })}</p>
          </>
        )}
      </div>
    </CasinoFrame>
  );
}
