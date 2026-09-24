import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, CircleDot, Club, Layers, Lightbulb, Play, Repeat, Sparkles, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { GameCard } from '@/components/table/GameCard';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import { useI18n } from '@/i18n';
import type { Card } from '@/game/engine';
import type { Screen } from '@/types/navigation';

type TopicId = 'cards' | 'turns' | 'specials' | 'uno' | 'strategy' | 'blackjack' | 'roulette' | 'slots';

interface Topic {
  id: TopicId;
  icon: LucideIcon;
  group: 'carta' | 'casino';
  /** Where "Try it" takes you. */
  target: Screen;
}

const TOPICS: Topic[] = [
  { id: 'cards', icon: Layers, group: 'carta', target: 'gameModes' },
  { id: 'turns', icon: Repeat, group: 'carta', target: 'gameModes' },
  { id: 'specials', icon: Zap, group: 'carta', target: 'gameModes' },
  { id: 'uno', icon: AlertCircle, group: 'carta', target: 'gameModes' },
  { id: 'strategy', icon: Lightbulb, group: 'carta', target: 'gameModes' },
  { id: 'blackjack', icon: Club, group: 'casino', target: 'blackjack' },
  { id: 'roulette', icon: CircleDot, group: 'casino', target: 'roulette' },
  { id: 'slots', icon: Sparkles, group: 'casino', target: 'slots' },
];

const card = (id: string, color: Card['color'], type: Card['type'], value: Card['value'] = null): Card => ({ id, color, type, value });

/** Small illustration for each lesson, built from the game's real components. */
function Visual({ id }: { id: TopicId }) {
  const { t } = useI18n();
  const w = { '--cw': '58px' } as React.CSSProperties;
  switch (id) {
    case 'cards':
      return (
        <div className="flex flex-wrap justify-center gap-2">
          {[card('a', 'RED', 'NUMBER', 7), card('b', 'BLUE', 'SKIP'), card('c', 'GREEN', 'REVERSE'), card('d', 'YELLOW', 'DRAW_TWO'), card('e', 'WILD', 'WILD'), card('f', 'WILD', 'WILD_DRAW_FOUR')].map((c) => (
            <GameCard key={c.id} card={c} style={w} />
          ))}
        </div>
      );
    case 'turns':
      return (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">{t('tutorial.visual.onTable')}</span>
            <GameCard card={card('t', 'GREEN', 'NUMBER', 5)} style={w} />
          </div>
          <div className="flex gap-3">
            {[
              { c: card('h1', 'GREEN', 'NUMBER', 2), ok: true, why: 'sameColor' },
              { c: card('h2', 'RED', 'NUMBER', 5), ok: true, why: 'sameNumber' },
              { c: card('h3', 'BLUE', 'NUMBER', 8), ok: false, why: 'noMatch' },
            ].map(({ c, ok, why }) => (
              <div key={c.id} className="flex flex-col items-center gap-1.5">
                <GameCard card={c} style={{ ...w, opacity: ok ? 1 : 0.5 }} />
                <span className={`text-[11px] font-semibold text-center leading-tight ${ok ? 'text-success-500' : 'text-danger-400'}`}>{t(`tutorial.visual.${why}`)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'specials':
      return (
        <div className="flex flex-wrap justify-center gap-2">
          {[card('s1', 'BLUE', 'SKIP'), card('s2', 'GREEN', 'REVERSE'), card('s3', 'RED', 'DRAW_TWO'), card('s4', 'WILD', 'WILD'), card('s5', 'WILD', 'WILD_DRAW_FOUR')].map((c) => (
            <GameCard key={c.id} card={c} style={w} />
          ))}
        </div>
      );
    case 'uno':
      return (
        <div className="flex items-center justify-center gap-4">
          <div className="flex">
            <GameCard card={card('u1', 'YELLOW', 'NUMBER', 3)} style={w} />
            <GameCard card={card('u2', 'BLUE', 'NUMBER', 9)} style={{ ...w, marginLeft: -24 }} />
          </div>
          <ArrowRight className="w-5 h-5 text-ink-400" aria-hidden />
          <span className="rounded-full bg-gradient-to-br from-gold-400 to-rose-600 px-3 py-1 text-sm font-extrabold text-ink-950">{t('table.uno')}</span>
        </div>
      );
    case 'strategy':
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['0–9', 'numbers'],
            ['20', 'actions'],
            ['50', 'wilds'],
          ].map(([pts, k]) => (
            <div key={k} className="rounded-xl bg-white/5 border border-white/10 px-2 py-3">
              <div className="font-display font-extrabold text-xl text-gold-400">{pts}</div>
              <div className="text-[11px] text-ink-400 mt-0.5">{t(`tutorial.visual.${k}`)}</div>
            </div>
          ))}
        </div>
      );
    case 'blackjack':
      return (
        <div className="flex items-center justify-center gap-3">
          <div className="flex">
            <PlayingCardView card={{ id: 'a', rank: 'A', suit: 'S' }} width={62} />
            <PlayingCardView card={{ id: 'k', rank: 'K', suit: 'H' }} width={62} style={{ marginLeft: -20 }} />
          </div>
          <span className="cz-pill cz-pill-win text-sm">21 · Blackjack</span>
        </div>
      );
    case 'roulette':
      return (
        <div className="flex flex-wrap justify-center gap-1.5">
          {[
            ['0', 'roulette-green'],
            ['1', 'roulette-red'],
            ['2', 'roulette-black'],
            ['3', 'roulette-red'],
          ].map(([n, cls]) => (
            <span key={n} className={`roulette-spot ${cls} w-11`}>{n}</span>
          ))}
          <span className="roulette-spot roulette-outside px-3">1.ª 12</span>
          <span className="roulette-spot roulette-red px-3">{t('casino.roulette.red')}</span>
        </div>
      );
    case 'slots':
      return (
        <div className="flex items-center justify-center gap-2">
          {(['seven', 'seven', 'seven', 'star'] as const).map((s, i) => (
            <span key={i} className={`rounded-xl bg-[#fffaf0] p-1.5 ${i === 3 ? 'ml-3 ring-2 ring-gold-400' : ''}`}>
              <SlotSymbolIcon symbol={s} className="w-10 h-10" />
            </span>
          ))}
        </div>
      );
  }
}

function Lesson({ topic, onBack, onGo }: { topic: Topic; onBack: () => void; onGo: (id: TopicId) => void }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const index = TOPICS.findIndex((x) => x.id === topic.id);
  const prev = TOPICS[index - 1];
  const next = TOPICS[index + 1];
  const k = (s: string) => `tutorial.topics.${topic.id}.${s}`;

  return (
    <ScreenContainer title={t(k('title'))} subtitle={t('tutorial.lessonOf', { n: index + 1, total: TOPICS.length })} onBack={onBack} backLabel={t('tutorial.backToTopics')}>
      <article key={topic.id} className="flex flex-col gap-4 cz-fade-in">
        <p className="text-[15px] leading-relaxed text-white/85">{t(k('intro'))}</p>
        <div className="cz-panel p-4">
          <Visual id={topic.id} />
        </div>
        <ol className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="cz-panel p-4 flex gap-3">
              <span className="flex-none w-7 h-7 rounded-full bg-[rgba(216,178,106,0.14)] border border-[rgba(216,178,106,0.35)] text-[var(--cz-gold)] text-xs font-bold flex items-center justify-center">{n}</span>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-white text-[15px]">{t(k(`s${n}t`))}</h3>
                <p className="text-sm text-white/75 leading-relaxed mt-1">{t(k(`s${n}b`))}</p>
              </div>
            </li>
          ))}
        </ol>

        <button type="button" className="cz-btn cz-btn-primary cz-btn-lg w-full mt-1" onClick={() => navigate(topic.target)}>
          <Play className="w-5 h-5" /> {t(topic.group === 'casino' ? 'tutorial.tryGame' : 'tutorial.tryCarta')}
        </button>

        <nav className="grid grid-cols-2 gap-2" aria-label={t('tutorial.lessonNav')}>
          <button type="button" className="cz-btn cz-btn-secondary justify-start min-w-0" disabled={!prev} onClick={() => prev && onGo(prev.id)}>
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">{prev ? t(`tutorial.topics.${prev.id}.title`) : t('tutorial.previous')}</span>
          </button>
          <button type="button" className="cz-btn cz-btn-secondary justify-end min-w-0" disabled={!next} onClick={() => next && onGo(next.id)}>
            <span className="truncate">{next ? t(`tutorial.topics.${next.id}.title`) : t('tutorial.next')}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </nav>
        <button type="button" className="cz-btn cz-btn-quiet w-full" onClick={onBack}>
          {t('tutorial.allTopics')}
        </button>
      </article>
    </ScreenContainer>
  );
}

// The open lesson survives leaving the screen (e.g. to try a game) and coming back.
let savedTopic: TopicId | null = null;

export function TutorialScreen() {
  const { t } = useI18n();
  const [open, setOpen] = useState<TopicId | null>(savedTopic);

  useEffect(() => {
    savedTopic = open;
    window.scrollTo({ top: 0 });
  }, [open]);

  const topic = TOPICS.find((x) => x.id === open);
  if (topic) return <Lesson topic={topic} onBack={() => setOpen(null)} onGo={setOpen} />;

  return (
    <ScreenContainer title={t('tutorial.title')} subtitle={t('tutorial.subtitle')}>
      <div className="flex flex-col gap-6">
        {(['carta', 'casino'] as const).map((group) => (
          <section key={group} className="animate-slide-up">
            <h2 className="cz-label mb-2 px-1">{t(`tutorial.groups.${group}`)}</h2>
            <div className="flex flex-col gap-2">
              {TOPICS.filter((x) => x.group === group).map((x) => (
                <button key={x.id} type="button" className="cz-row" onClick={() => setOpen(x.id)}>
                  <span className="cz-row-icon">
                    <x.icon className="w-5 h-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-bold text-white text-[15px]">{t(`tutorial.topics.${x.id}.title`)}</span>
                    <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(`tutorial.topics.${x.id}.summary`)}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ScreenContainer>
  );
}
