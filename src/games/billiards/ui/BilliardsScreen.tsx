// The 8-Ball menu: play the computer (four levels) or a friend online (create a room and share the code, or
// join with one), plus your statistics. The online rooms use the shared room screen (code, copy, waiting).
import { useEffect, useState } from 'react';
import { ArrowLeft, Bot, KeyRound, Play, Trophy, Users } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useAccount } from '@/account/useAccount';
import { storage } from '@/storage';
import { onlineConfig } from '@/games/online/client';
import { BOT_LEVELS } from '../ai';
import type { BotLevel } from '../ai';
import { myStats } from '../api';
import type { BilliardsStats } from '../api';
import { LEVEL_KEY, loadLevel } from './level';
import { BilliardsArt } from './BilliardsArt';
import './billiards.css';

export function BilliardsScreen() {
  const { t } = useI18n();
  const { navigate, back } = useNavigation();
  const account = useAccount();
  const [level, setLevel] = useState<BotLevel>(loadLevel);
  const [stats, setStats] = useState<BilliardsStats | null>(null);
  const online = !!onlineConfig();
  const signedIn = account.status === 'user';

  useEffect(() => {
    if (!signedIn || !online) return;
    let alive = true;
    void myStats().then((s) => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, [signedIn, online]);

  const pick = (l: BotLevel) => {
    setLevel(l);
    storage.set(LEVEL_KEY, l);
  };

  return (
    <div className="bl bl-hub screen-in">
      <header className="bl-top">
        <button type="button" className="bl-icon" onClick={() => back('home')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="bl-brand">CARTA CASINO</span>
        <span className="w-9" />
      </header>
      <main className="bl-hub-main">
        <section className="bl-hero">
          <BilliardsArt size={72} />
          <div className="min-w-0">
            <h1>{t('billiards.title')}</h1>
            <p>{t('billiards.subtitle')}</p>
          </div>
        </section>

        <section className="bl-mode" aria-labelledby="bl-bot">
          <h2 id="bl-bot">
            <Bot className="w-5 h-5 text-[var(--bl-gold-hi)]" aria-hidden /> {t('billiards.vsBot')}
          </h2>
          <p>{t('billiards.vsBotHint')}</p>
          <div className="bl-levels" role="group" aria-label={t('billiards.difficulty')}>
            {BOT_LEVELS.map((l) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => pick(l)}>
                {t(`billiards.level.${l}`)}
              </button>
            ))}
          </div>
          <button type="button" className="hm-gold-btn w-full !mt-0" onClick={() => navigate('billiardsPlay')}>
            <Play className="w-5 h-5" aria-hidden /> {t('billiards.play')}
          </button>
        </section>

        <section className="bl-mode" aria-labelledby="bl-online">
          <h2 id="bl-online">
            <Users className="w-5 h-5 text-[var(--bl-gold-hi)]" aria-hidden /> {t('billiards.vsFriend')}
          </h2>
          <p>{online ? t('billiards.vsFriendHint') : t('room.noServer')}</p>
          <div className="bl-mode-actions">
            <button type="button" className="cz-btn cz-btn-primary" disabled={!online} onClick={() => navigate('room', { game: 'billiards' })}>
              <Users className="w-4 h-4" aria-hidden /> {t('billiards.createRoom')}
            </button>
            <button type="button" className="cz-btn cz-btn-secondary" disabled={!online} onClick={() => navigate('room', { game: 'billiards', join: true })}>
              <KeyRound className="w-4 h-4" aria-hidden /> {t('billiards.joinRoom')}
            </button>
          </div>
        </section>

        <section className="bl-mode" aria-labelledby="bl-stats">
          <h2 id="bl-stats">
            <Trophy className="w-5 h-5 text-[var(--bl-gold-hi)]" aria-hidden /> {t('billiards.stats.title')}
          </h2>
          {signedIn && stats ? (
            <div className="bl-stats">
              <div>
                <b>{stats.played}</b>
                <span>{t('billiards.stats.played')}</span>
              </div>
              <div>
                <b>{stats.wins}</b>
                <span>{t('billiards.stats.wins')}</span>
              </div>
              <div>
                <b>{stats.losses}</b>
                <span>{t('billiards.stats.losses')}</span>
              </div>
              <div>
                <b>{stats.bestStreak}</b>
                <span>{t('billiards.stats.bestStreak')}</span>
              </div>
              <div>
                <b>{stats.botWins}</b>
                <span>{t('billiards.stats.botWins')}</span>
              </div>
              <div>
                <b>{stats.onlineWins}</b>
                <span>{t('billiards.stats.onlineWins')}</span>
              </div>
              <div>
                <b>{stats.potted}</b>
                <span>{t('billiards.stats.potted')}</span>
              </div>
              <div>
                <b>{stats.fouls}</b>
                <span>{t('billiards.stats.fouls')}</span>
              </div>
            </div>
          ) : (
            <p>{signedIn ? t('billiards.stats.loading') : t('billiards.stats.signIn')}</p>
          )}
        </section>
      </main>
    </div>
  );
}
