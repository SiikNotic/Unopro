import { useEffect, useRef, useState } from 'react';
import { Hand as HandIcon, Layers, Plus, RotateCcw, Split, X } from 'lucide-react';
import { CasinoFrame } from '@/components/casino/CasinoFrame';
import { Chip, ChipAdder } from '@/components/casino/chips';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { RulesSheet } from '@/components/casino/RulesSheet';
import { SaloonBackdrop } from '@/components/casino/SaloonBackdrop';
import { CardShoe } from '@/components/casino/blackjackArt';
import { useI18n } from '@/i18n';
import { useWallet } from '@/casino/useWallet';
import { MIN_BET } from '@/casino/wallet';
import * as bj from '@/casino/blackjack';
import type { PlayingCard } from '@/casino/cards';
import { cryptoRng, secureSeed } from '@/casino/random';
import { shuffle } from '@/casino/cards';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useViewport } from '@/hooks/useViewport';
import { playSfx } from '@/audio/sfx';

// The hand in progress is kept per tab (sessionStorage), so leaving the screen or reloading the page
// never loses a bet. The wallet round id travels with it: a round is only ever paid once.
const SESSION_KEY = 'carta.blackjack';

interface SavedRound {
  roundId: string | null;
  table: bj.BlackjackState;
  lastBet: number;
}

function loadRound(): SavedRound | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Partial<SavedRound> | null;
    if (!raw || !bj.isValidTable(raw.table)) return null;
    const lastBet = typeof raw.lastBet === 'number' && Number.isInteger(raw.lastBet) && raw.lastBet >= 0 ? raw.lastBet : 0;
    return { roundId: typeof raw.roundId === 'string' ? raw.roundId : null, table: raw.table, lastBet };
  } catch {
    return null;
  }
}

/**
 * The stored copy never reveals what comes next: the undealt shoe is reshuffled with a fresh
 * cryptographic seed (and a fresh engine seed), so reading storage tells nothing about the next card.
 */
function saveRound(round: SavedRound) {
  try {
    const table = { ...round.table, shoe: shuffle(round.table.shoe, cryptoRng()), rngState: secureSeed() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...round, table }));
  } catch {
    // best effort
  }
}

/** Clears a hand from the table while keeping the shoe (used when a restored hand was already closed). */
const clearHand = (t: bj.BlackjackState): bj.BlackjackState => ({ ...t, phase: 'BETTING', hands: [], dealer: [], results: [], active: 0 });

/** Overlapping row of cards; overlaps more as the hand grows so it never gets wider than ~3 cards. */
function CardRow({ cards, width, hideHole = false, dealtFrom = 0 }: { cards: PlayingCard[]; width: number; hideHole?: boolean; dealtFrom?: number }) {
  const overlap = cards.length <= 2 ? 0.34 : cards.length <= 4 ? 0.55 : 0.68;
  return (
    <div className="flex justify-center" style={{ height: width * 1.5 }}>
      {cards.map((card, i) => (
        <PlayingCardView
          key={card.id}
          card={card}
          width={width}
          faceDown={hideHole && i === 1}
          className={i >= dealtFrom ? 'casino-deal' : ''}
          style={{ marginLeft: i > 0 ? -width * overlap : 0, animationDelay: `${Math.max(0, i - dealtFrom) * 0.12}s` }}
        />
      ))}
    </div>
  );
}

/** Empty card outline where the cards will land. */
function CardSlot({ width }: { width: number }) {
  return <div className="rounded-[10px] border border-dashed border-[rgba(232,214,170,0.28)]" style={{ width, height: width * 1.5 }} aria-hidden />;
}

function totalLabel(cards: PlayingCard[]): string {
  const { total, soft } = bj.handTotal(cards);
  return soft && total < 21 ? `${total - 10}/${total}` : String(total);
}

const OUTCOME_PILL: Record<bj.Outcome, string> = {
  blackjack: 'cz-pill-win',
  win: 'cz-pill-win',
  push: 'cz-pill-push',
  lose: 'cz-pill-lose',
};

export function BlackjackScreen() {
  const { t } = useI18n();
  const { balance, startRound, raiseStake, settleRound, isOpen, openStake } = useWallet();
  const reduced = useReducedMotion();
  const { width: vw, height: vh } = useViewport();
  const [initial] = useState(() => {
    const saved = loadRound();
    if (!saved) return { roundId: null, table: bj.createBlackjack(secureSeed()), lastBet: 0 };
    if (saved.table.phase !== 'PLAYER') return { ...saved, roundId: null };
    // A hand in play is only resumed if its wallet round is still open and the bets on the table are
    // exactly what the wallet took. Otherwise it was closed elsewhere or edited: the hand is void.
    const stake = saved.roundId ? openStake(saved.roundId) : null;
    const onTable = saved.table.hands.reduce((sum, h) => sum + h.bet, 0);
    if (stake === null || stake !== onTable) return { ...saved, roundId: null, table: clearHand(saved.table) };
    return saved;
  });
  const [table, setTable] = useState<bj.BlackjackState>(initial.table);
  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(initial.lastBet);
  const [help, setHelp] = useState(false);
  const [voided, setVoided] = useState(false);
  // Dealer cards revealed so far once the round settles (one by one, for suspense).
  const [dealerShown, setDealerShown] = useState(table.phase === 'SETTLED' ? table.dealer.length : 2);
  const prevPhase = useRef(table.phase);
  const resultPending = useRef(false);
  // The latest table and round, read synchronously so a second tap acts on the updated state.
  const tableRef = useRef(table);
  const roundRef = useRef<string | null>(initial.roundId);
  const lockUntil = useRef<Record<string, number>>({});

  useEffect(() => {
    saveRound({ roundId: roundRef.current, table, lastBet });
  }, [table, lastBet]);

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

  /** Ignores a repeat of the same action within a short window (double taps, key repeat). */
  const guarded = (key: string, fn: () => void) => {
    const now = performance.now();
    if (now < (lockUntil.current[key] ?? 0)) return;
    lockUntil.current[key] = now + 250;
    fn();
  };

  /** Moves the table forward from its latest state; pays the round the moment it settles, once. */
  const act = (step: (current: bj.BlackjackState) => bj.BlackjackState) => {
    const current = tableRef.current;
    // The round was closed in another tab (e.g. a duplicated tab): this copy of the hand can't be played.
    if (current.phase === 'PLAYER' && (!roundRef.current || !isOpen(roundRef.current))) {
      const cleared = clearHand(current);
      tableRef.current = cleared;
      roundRef.current = null;
      setTable(cleared);
      setVoided(true);
      playSfx('error');
      return;
    }
    const next = step(current);
    if (next === current) return;
    tableRef.current = next;
    setTable(next);
    if (next.phase === 'SETTLED' && current.phase !== 'SETTLED' && roundRef.current) {
      settleRound(roundRef.current, bj.totalPayout(next));
      resultPending.current = true;
    }
  };

  const addChip = (value: number) => {
    if (bet + value > balance) return;
    playSfx('chip');
    setBet((b) => b + value);
  };

  const dealWith = (amount: number) =>
    guarded('deal', () => {
      if (tableRef.current.phase === 'PLAYER') return;
      const id = amount >= MIN_BET ? startRound('blackjack', amount, null) : null;
      if (!id) {
        playSfx('error');
        return;
      }
      roundRef.current = id;
      setVoided(false);
      playSfx('roundStart');
      setLastBet(amount);
      setBet(0);
      setDealerShown(2);
      // A fresh round starts from betting, even when the previous one is still on the table.
      prevPhase.current = 'BETTING';
      if (tableRef.current.phase === 'SETTLED') tableRef.current = { ...tableRef.current, phase: 'BETTING' };
      act((current) => bj.deal(current, amount));
    });

  const doExtra = (action: 'double' | 'split') =>
    guarded(action, () => {
      const current = tableRef.current;
      const allowed = action === 'double' ? bj.canDouble(current) : bj.canSplit(current);
      if (!allowed || !roundRef.current || !raiseStake(roundRef.current, bj.extraStake(current, action))) {
        playSfx('error');
        return;
      }
      playSfx('chip');
      act(action === 'double' ? bj.double : bj.split);
    });

  const hit = () => guarded('hit', () => { playSfx('draw'); act(bj.hit); });
  const stand = () => guarded('stand', () => { playSfx('turn'); act(bj.stand); });

  const inPlay = table.phase === 'PLAYER';
  const hasRound = table.hands.length > 0;
  const split = table.hands.length > 1;
  // Cards fit both the width and the height of the phone, so dealer and player hands always show whole.
  const cardWidth = Math.round(Math.min(vw >= 768 ? 128 : 104, Math.max(52, Math.min(vw * (split ? 0.16 : 0.21), (vh - 330) / 3.4))));
  const dealerCards = inPlay ? table.dealer : table.dealer.slice(0, dealerShown);
  const netResult = settledVisible ? bj.totalPayout(table) - table.hands.reduce((s, h) => s + h.bet, 0) : 0;
  const doubleStake = bj.canDouble(table) ? bj.extraStake(table, 'double') : 0;
  const canDoubleNow = bj.canDouble(table) && balance >= doubleStake;
  const canSplitNow = bj.canSplit(table) && balance >= bj.extraStake(table, 'split');
  const dealerBust = settledVisible && bj.isBust(table.dealer);
  const tableBet = inPlay || settledVisible ? table.hands.reduce((s, h) => s + h.bet, 0) : bet;

  // One line in the middle of the table that says what happened.
  let message = '';
  let tone = '';
  if (settledVisible) {
    if (!split) {
      const hand = table.hands[0];
      message = t(`casino.blackjack.reason.${bj.resultReason(hand, table.dealer)}`, {
        player: bj.handTotal(hand.cards).total,
        dealer: bj.handTotal(table.dealer).total,
      });
    } else message = netResult > 0 ? t('casino.youWon', { amount: netResult }) : netResult < 0 ? t('casino.youLost', { amount: -netResult }) : t('casino.blackjack.pushed');
    tone = netResult > 0 ? 'cz-pill-win' : netResult < 0 ? 'cz-pill-lose' : 'cz-pill-push';
  } else if (table.phase === 'SETTLED') {
    message = t('casino.blackjack.dealerPlays');
  } else if (inPlay) {
    message = split ? t('casino.blackjack.playHand', { n: table.active + 1 }) : t('casino.blackjack.yourMove');
  } else if (voided) {
    message = t('casino.blackjack.voided');
  } else {
    message = bet > 0 ? t('casino.blackjack.readyToDeal') : t('casino.blackjack.placeBet');
  }

  const dealDisabled = bet < MIN_BET;
  const rebet = bet === 0 && lastBet > 0 && table.phase === 'SETTLED';

  const dock = inPlay ? (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="cz-btn cz-btn-primary cz-btn-lg" onClick={hit}>
          <Plus className="w-5 h-5" /> {t('casino.blackjack.hit')}
        </button>
        <button type="button" className="cz-btn cz-btn-strong cz-btn-lg" onClick={stand}>
          <HandIcon className="w-5 h-5" /> {t('casino.blackjack.stand')}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="cz-btn cz-btn-secondary" disabled={!canDoubleNow} onClick={() => doExtra('double')}>
          <Layers className="w-4 h-4" /> {t('casino.blackjack.double')}
          {doubleStake > 0 && <span className="cz-num text-[var(--cz-muted)] font-semibold">+{doubleStake}</span>}
        </button>
        <button type="button" className="cz-btn cz-btn-secondary" disabled={!canSplitNow} onClick={() => doExtra('split')}>
          <Split className="w-4 h-4" /> {t('casino.blackjack.split')}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <ChipAdder onAdd={addChip} max={Math.max(0, balance - bet)} />
        </div>
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" disabled={bet === 0} onClick={() => setBet(0)} aria-label={t('casino.clear')} title={t('casino.clear')}>
          <X className="w-5 h-5" />
        </button>
      </div>
      {rebet ? (
        <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full" disabled={lastBet > balance} onClick={() => dealWith(lastBet)}>
          <RotateCcw className="w-5 h-5" /> {t('casino.rebet', { amount: lastBet })}
        </button>
      ) : (
        <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full" disabled={dealDisabled} onClick={() => dealWith(bet)}>
          {bet > 0 ? t('casino.blackjack.dealFor', { amount: bet }) : t('casino.minBet', { amount: MIN_BET })}
        </button>
      )}
    </div>
  );

  return (
    <CasinoFrame
      title={t('casino.blackjack.short')}
      subtitle={t('casino.blackjack.rules')}
      back="gameModes"
      scenario="lounge"
      backdrop={<SaloonBackdrop />}
      onHelp={() => setHelp(true)}
      dock={dock}
    >
      {help && (
        <RulesSheet
          title={t('casino.blackjack.helpTitle')}
          items={['goal', 'values', 'actions', 'dealer', 'pays'].map((k) => t(`casino.blackjack.help.${k}`))}
          onClose={() => setHelp(false)}
        />
      )}

      <section className="cz-felt flex-1 flex flex-col items-center justify-center gap-3 sm:gap-6 px-3 py-4 sm:px-8 sm:py-8 min-h-[340px]" aria-label={t('casino.blackjack.table')}>
        <CardShoe className="hidden sm:block absolute right-6 top-5 w-20 h-14 opacity-90" />

        {/* Dealer */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="cz-label text-[rgba(232,214,170,0.75)]">{t('casino.blackjack.dealer')}</span>
            {hasRound && (
              <span className={`cz-pill ${dealerBust ? 'cz-pill-lose' : ''}`}>{dealerBust ? t('casino.blackjack.bust') : totalLabel(inPlay ? table.dealer.slice(0, 1) : dealerCards)}</span>
            )}
          </div>
          {hasRound ? (
            <CardRow cards={dealerCards} width={cardWidth} hideHole={inPlay} dealtFrom={inPlay ? 0 : 2} />
          ) : (
            <div className="flex gap-2"><CardSlot width={cardWidth} /><CardSlot width={cardWidth} /></div>
          )}
        </div>

        {/* Status line */}
        <div className="min-h-[40px] flex flex-col items-center justify-center gap-1 text-center px-2" role="status" aria-live="polite">
          {settledVisible ? (
            <span className={`cz-pill ${tone} min-h-[36px] px-4 text-sm sm:text-base casino-pop`}>{message}</span>
          ) : (
            <span className="text-sm text-[rgba(243,238,227,0.78)]">{message}</span>
          )}
          {!hasRound && <span className="cz-felt-print text-[10px] sm:text-xs">{t('casino.blackjack.feltTop')} · {t('casino.blackjack.feltBottom')}</span>}
        </div>

        {/* Player */}
        <div className="flex flex-col items-center gap-2 w-full">
          {hasRound ? (
            <div className={`flex justify-center w-full ${split ? 'gap-3 sm:gap-10' : ''}`}>
              {table.hands.map((hand, i) => {
                const active = inPlay && split && i === table.active;
                const result = settledVisible ? table.results[i] : undefined;
                return (
                  <div key={i} className={`flex flex-col items-center gap-2 rounded-2xl px-1.5 py-1.5 transition-colors ${active ? 'bg-black/20 ring-1 ring-[var(--cz-gold)]' : ''}`}>
                    <CardRow cards={hand.cards} width={cardWidth} />
                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                      <span className={`cz-pill ${result ? OUTCOME_PILL[result.outcome] : ''}`}>
                        {result ? `${t(`casino.blackjack.outcome.${result.outcome}`)} · ${bj.handTotal(hand.cards).total}` : totalLabel(hand.cards)}
                      </span>
                      <span className="cz-pill" aria-label={t('casino.betOf', { amount: hand.bet })}>
                        <Chip value={hand.bet} size={16} label="" /> {hand.bet}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2"><CardSlot width={cardWidth} /><CardSlot width={cardWidth} /></div>
          )}
          {!hasRound && (
            <div className="flex items-center gap-2 min-h-[28px]">
              <span className="cz-label text-[rgba(232,214,170,0.75)]">{t('casino.blackjack.you')}</span>
              {tableBet > 0 && (
                <span className="cz-pill">
                  <Chip value={tableBet} size={16} label="" /> {tableBet}
                </span>
              )}
            </div>
          )}
        </div>
      </section>
    </CasinoFrame>
  );
}
