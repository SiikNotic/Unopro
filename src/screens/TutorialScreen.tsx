// Tutorials: every lesson of every game in the catalog (src/games/catalog.ts), so the list always matches the
// games the app really has. Each lesson: an intro, a picture and its steps (objective, how to start, how to play,
// rules, coins, how to win), in Spanish and English.
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, Coins, Globe, Layers, Lightbulb, Play, Repeat, Users, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { useNavigation } from '@/components/Navigation';
import { GameCard } from '@/components/table/GameCard';
import { PlayingCardView } from '@/components/casino/PlayingCardView';
import { SlotSymbolIcon } from '@/components/casino/slotSymbols';
import '@/components/casino/casino.css';
import { useI18n } from '@/i18n';
import type { Card } from '@/game/engine';
import type { Screen } from '@/types/navigation';
import { gameInfo, gamesIn, GENERAL_TOPICS, TOPIC_ORDER } from '@/games/catalog';
import type { GameId, GameSection, TopicId } from '@/games/catalog';
import { GameIcon } from '@/games/GameIcon';

/** How many steps each lesson has (s1…sN in the translations). */
const STEPS: Record<TopicId, number> = {
  coins: 4, online: 4, cards: 3, turns: 3, specials: 3, uno: 3, strategy: 3, cartaModes: 4, domino: 5, bingo: 5, jewels: 5,
  crash: 4, horse: 4, airhockey: 4, blackjack: 4, roulette: 4, poker: 4, slots: 3, premiumSlots: 5,
};

/** Carta's lessons get their own icons (the game has several); the rest use the game's picture. */
const TOPIC_ICON: Partial<Record<TopicId, LucideIcon>> = { coins: Coins, online: Globe, cards: Layers, turns: Repeat, specials: Zap, uno: AlertCircle, strategy: Lightbulb, cartaModes: Users };

interface Topic {
  id: TopicId;
  game: GameId | null;
  /** Where "Try it" takes you. */
  target: Screen;
}

const TOPICS: Topic[] = TOPIC_ORDER.map(({ id, game }) => ({ id, game, target: game ? gameInfo(game).screen : id === 'coins' ? 'bank' : 'gameModes' }));

function TopicIcon({ topic }: { topic: Topic }) {
  const Icon = TOPIC_ICON[topic.id];
  if (Icon) return <Icon className="w-5 h-5" aria-hidden />;
  return topic.game ? <GameIcon id={topic.game} /> : null;
}

/** For the lessons without a drawn illustration: the game's picture and three key facts. */
function Facts({ topic }: { topic: Topic }) {
  const { t } = useI18n();
  const facts = (t(`tutorial.topics.${topic.id}.facts`) as string).split('|');
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-[rgba(216,178,106,0.4)] bg-[rgba(216,178,106,0.1)] text-[var(--cz-gold)] [&_svg]:max-h-12">
        <TopicIcon topic={topic} />
      </span>
      <div className="grid w-full grid-cols-3 gap-2 text-center">
        {facts.map((f) => (
          <div key={f} className="rounded-xl border border-white/10 bg-white/5 px-1.5 py-2.5 text-[12px] font-semibold leading-tight text-white/90">
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

const card = (id: string, color: Card['color'], type: Card['type'], value: Card['value'] = null): Card => ({ id, color, type, value });

/** Small illustration for each lesson, built from the game's real components. */
function Visual({ topic }: { topic: Topic }) {
  const { t } = useI18n();
  const w = { '--cw': '58px' } as React.CSSProperties;
  switch (topic.id) {
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
    default:
      return <Facts topic={topic} />;
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
          <Visual topic={topic} />
        </div>
        <ol className="flex flex-col gap-3">
          {Array.from({ length: STEPS[topic.id] }, (_, i) => i + 1).map((n) => (
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
          <Play className="w-5 h-5" /> {t(!topic.game ? 'tutorial.tryPlace' : topic.game === 'carta' ? 'tutorial.tryCarta' : 'tutorial.tryGame')}
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

export function TutorialScreen() {
  const { t } = useI18n();
  const { params, navigate, back } = useNavigation();
  // The open lesson lives in the navigation history, so the phone's back button returns to the topics.
  const topic = TOPICS.find((x) => x.id === params.topic);
  if (topic)
    return (
      <Lesson
        topic={topic}
        onBack={() => back('tutorial')}
        onGo={(id) => navigate('tutorial', { topic: id }, { replace: true })}
      />
    );

  const row = (x: Topic) => (
    <button key={x.id} type="button" className="cz-row" onClick={() => navigate('tutorial', { topic: x.id })}>
      <span className="cz-row-icon overflow-hidden">
        <TopicIcon topic={x} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-bold text-white text-[15px]">{t(`tutorial.topics.${x.id}.title`)}</span>
        <span className="block text-xs text-[var(--cz-muted)] mt-0.5 leading-snug">{t(`tutorial.topics.${x.id}.summary`)}</span>
      </span>
      <ChevronRight className="w-5 h-5 text-[var(--cz-muted)] shrink-0" aria-hidden />
    </button>
  );
  const byId = (id: TopicId) => TOPICS.find((x) => x.id === id)!;

  return (
    <ScreenContainer title={t('tutorial.title')} subtitle={t('tutorial.subtitle')}>
      <div className="flex flex-col gap-6">
        <section className="animate-slide-up">
          <h2 className="cz-label mb-2 px-1">{t('tutorial.groups.general')}</h2>
          <div className="flex flex-col gap-2">{GENERAL_TOPICS.map((id) => row(byId(id)))}</div>
        </section>
        {(['table', 'puzzle', 'casino'] as GameSection[]).map((section) => (
          <section key={section} className="animate-slide-up">
            <h2 className="cz-label mb-2 px-1">{t(`tutorial.groups.${section}`)}</h2>
            <div className="flex flex-col gap-2">
              {gamesIn(section).map((g) =>
                g.tutorials.length === 1 ? (
                  row(byId(g.tutorials[0]))
                ) : (
                  <div key={g.id} className="flex flex-col gap-2">
                    <p className="mt-1 flex items-center gap-2 px-1 text-[13px] font-bold text-white/85">
                      {t(g.nameKey)} <span className="text-[11px] font-semibold text-[var(--cz-muted)]">· {t('tutorial.lessons', { n: g.tutorials.length })}</span>
                    </p>
                    {g.tutorials.map((id) => row(byId(id)))}
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </ScreenContainer>
  );
}
