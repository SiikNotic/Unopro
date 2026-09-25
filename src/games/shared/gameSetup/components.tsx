// Building blocks of GameSetupScreen. Each one renders a piece of a SetupModel; none knows about a game.
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Bot, Check, Crown, Play, Smartphone, UserRound } from 'lucide-react';
import { useI18n } from '@/i18n';
import { playSfx } from '@/audio/sfx';
import { usePreferences, vibrate } from '@/settings/usePreferences';
import { Toggle } from '@/components/ui/Toggle';
import type { Choice, RuleModel, SeatModel, Selector, SetupAction } from './types';

/** A light tap: sound and haptics only when the player has them on. */
function useTap() {
  const { preferences } = usePreferences();
  return () => {
    playSfx('chip');
    vibrate(preferences.haptics, 12);
  };
}

export function SetupSection({ id, label, aside, children }: { id: string; label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="gs-section" aria-labelledby={`gs-${id}`}>
      <div className="gs-section-head">
        <h2 id={`gs-${id}`} className="gs-label">
          {label}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Big segmented selector with a sliding highlight (the pattern of every choice on the setup screen). */
export function SegmentedSelector<V extends string | number>({ label, selector, size = 'md' }: { label: string; selector: Selector<V>; size?: 'md' | 'lg' }) {
  const tap = useTap();
  const index = Math.max(0, selector.options.findIndex((o) => o.value === selector.value));
  const n = selector.options.length;
  const style = { '--gs-n': n, '--gs-i': index } as CSSProperties;
  return (
    <div className={`gs-seg ${size === 'lg' ? 'is-lg' : ''}`} role="radiogroup" aria-label={label} style={style}>
      <span className="gs-seg-glow" aria-hidden />
      {selector.options.map((o: Choice<V>) => {
        const on = o.value === selector.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => {
              if (on) return;
              tap();
              selector.onChange(o.value);
            }}
          >
            <span className="gs-seg-label">{o.label}</span>
            {o.hint && <span className="gs-seg-hint">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PlayerCountSelector({ selector }: { selector: Selector<number> }) {
  const { t } = useI18n();
  return <SegmentedSelector label={t('setup.players')} selector={selector} size="lg" />;
}

export function BotDifficultySelector({ selector }: { selector: Selector<string> }) {
  const { t } = useI18n();
  return <SegmentedSelector label={t('setup.difficulty')} selector={selector} />;
}

const SEAT_ICON = { you: UserRound, bot: Bot, local: Smartphone, dealer: Crown, open: null } as const;

function Seat({ seat, index }: { seat: SeatModel; index: number }) {
  const tap = useTap();
  const { preferences } = usePreferences();
  const Icon = SEAT_ICON[seat.kind];
  const ref = useRef<HTMLElement>(null);
  const first = useRef(true);
  // A short pop when the seat changes kind (not on first render).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!preferences.animations) return;
    ref.current?.animate?.([{ transform: 'scale(0.92)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }, [seat.kind, preferences.animations]);
  const body = (
    <>
      {seat.team && <span className={`gs-team is-${seat.team.toLowerCase()}`}>{seat.team}</span>}
      <span className="gs-av">{Icon ? <Icon className="w-5 h-5" aria-hidden /> : null}</span>
      <span className="gs-seat-name">{seat.label}</span>
      {seat.sub && <small>{seat.sub}</small>}
    </>
  );
  const cls = `gs-seat is-${seat.kind}`;
  const style = { animationDelay: `${index * 40}ms` };
  return seat.onToggle ? (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      role="listitem"
      className={`${cls} is-tappable`}
      style={style}
      aria-label={seat.toggleLabel}
      onClick={() => {
        tap();
        seat.onToggle!();
      }}
    >
      {body}
    </button>
  ) : (
    <div ref={ref as React.RefObject<HTMLDivElement>} role="listitem" className={cls} style={style}>
      {body}
    </div>
  );
}

export function PlayerSeatSelector({ seats, note }: { seats: SeatModel[]; note?: string }) {
  const { t } = useI18n();
  return (
    <>
      <div className="gs-seats" role="list" aria-label={t('setup.seats')} style={{ '--gs-cols': Math.min(seats.length, 6), '--gs-cols-m': seats.length <= 4 ? seats.length : 3 } as CSSProperties}>
        {seats.map((s, i) => (
          <Seat key={i} seat={s} index={i} />
        ))}
      </div>
      {note && <p className="gs-note mt-2.5">{note}</p>}
    </>
  );
}

export function GameRulesSelector({ rules }: { rules: RuleModel[] }) {
  const tap = useTap();
  return (
    <div className="gs-rules">
      {rules.map((r) =>
        r.kind === 'choice' ? (
          <div key={r.id} className="gs-rule">
            <span className="gs-rule-label">{r.label}</span>
            <SegmentedSelector label={r.label} selector={r} />
          </div>
        ) : r.kind === 'toggle' ? (
          <div key={r.id} className="gs-rule is-toggle">
            <span className="min-w-0 flex-1">
              <span className="gs-rule-label !mb-0">{r.label}</span>
              {r.hint && <span className="gs-rule-hint">{r.hint}</span>}
            </span>
            <Toggle
              checked={r.checked}
              label={r.label}
              onChange={(v) => {
                tap();
                r.onChange(v);
              }}
            />
          </div>
        ) : (
          <div key={r.id} className="gs-rule">
            <span className="gs-rule-label">{r.label}</span>
            <ul className="gs-info">
              {r.items.map((item) => (
                <li key={item}>
                  <Check className="w-3.5 h-3.5 shrink-0" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

export function ScenarioSelector({ selector }: { selector: Selector<string> }) {
  const { t } = useI18n();
  const tap = useTap();
  return (
    <div className="gs-chips" role="radiogroup" aria-label={t('setup.scene')}>
      {selector.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === selector.value}
          className="gs-chip"
          onClick={() => {
            if (o.value === selector.value) return;
            tap();
            selector.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GameSetupSummary({ items }: { items: string[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <p className="gs-summary" aria-label={t('setup.summary')}>
      {items.map((s, i) => (
        <span key={i}>{s}</span>
      ))}
    </p>
  );
}

export function StartGameButton({ action }: { action: SetupAction }) {
  const { preferences } = usePreferences();
  return (
    <button
      type="button"
      className="gs-start"
      disabled={action.disabled}
      onClick={() => {
        vibrate(preferences.haptics, 25);
        action.onClick();
      }}
    >
      {action.icon ?? <Play className="w-5 h-5" fill="currentColor" aria-hidden />}
      <span className="truncate">{action.label}</span>
    </button>
  );
}
