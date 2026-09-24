import { useMemo, useState } from 'react';
import { ArrowLeft, Bot, CloudOff, Copy, Crown, Play } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { newRoomCode, parseRoomCode } from '../multiplayer/roomCode';
import { loadBingoSetup, loadDominoSetup, saveBingoSetup, saveDominoSetup } from '../setup';
import { GameSceneBackground } from '../scenes/GameScenes';
import './hub.css';

/**
 * The lobby a real online match will use: room code, seats filling up, ready, start. The realtime server is
 * not connected yet, so this screen says so plainly: nobody can join the code, and "start" fills the empty
 * seats with bots on this device.
 */
export function RoomScreen() {
  const { t } = useI18n();
  const { params, back, navigate } = useNavigation();
  const game = params.game ?? 'domino';
  const joining = params.join === true;
  const code = useMemo(() => newRoomCode(), []);
  const min = game === 'domino' ? 2 : 1;
  const [seats, setSeats] = useState(4);
  const [typed, setTyped] = useState('');
  const [joinResult, setJoinResult] = useState<'bad' | 'offline' | null>(null);
  const [copied, setCopied] = useState(false);

  const startWithBots = () => {
    if (game === 'domino') {
      saveDominoSetup({ ...loadDominoSetup(), seats: seats as 2 | 3 | 4, others: ['bot', 'bot', 'bot'] });
    } else saveBingoSetup({ ...loadBingoSetup(), players: seats as 1 | 2 | 3 | 4 });
    navigate(game, {}, { replace: true });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`ms ${game === 'domino' ? 'hub-domino' : 'hub-bingo'} screen-in`}>
      <GameSceneBackground scene={game === 'domino' ? 'lounge' : 'hall'} />
      <header className="ms-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={() => back(game === 'domino' ? 'dominoSetup' : 'bingoSetup')} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-extrabold text-lg">{t(joining ? 'room.joinTitle' : 'room.createTitle', { game: t(`hub.${game}.name`) })}</h1>
      </header>
      <main className="ms-main">
        <div className="ms-panel flex gap-3 items-start" role="note">
          <CloudOff className="w-5 h-5 shrink-0 mt-0.5 text-[var(--cz-gold)]" aria-hidden />
          <p className="ms-note !text-white/80">{t('room.offline')}</p>
        </div>

        {joining ? (
          <section className="ms-panel">
            <label className="ms-label" htmlFor="room-code">
              {t('room.codeLabel')}
            </label>
            <input
              id="room-code"
              className="rm-input"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={7}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setJoinResult(null);
              }}
              placeholder="AB7K2"
            />
            <button type="button" className="cz-btn cz-btn-primary w-full mt-3" onClick={() => setJoinResult(parseRoomCode(typed) ? 'offline' : 'bad')}>
              {t('room.join')}
            </button>
            {joinResult && (
              <p className="ms-note mt-3" role="alert">
                {t(joinResult === 'bad' ? 'room.badCode' : 'room.cannotJoin')}
              </p>
            )}
          </section>
        ) : (
          <>
            <section className="ms-panel text-center">
              <span className="ms-label">{t('room.code')}</span>
              <div className="rm-code" aria-label={t('room.codeAria', { code: code.split('').join(' ') })}>
                {code.split('').map((c, i) => (
                  <span key={i} aria-hidden>
                    {c}
                  </span>
                ))}
              </div>
              <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm mt-2" onClick={copy}>
                <Copy className="w-4 h-4" /> {copied ? t('room.copied') : t('room.copy')}
              </button>
            </section>
            <section className="ms-panel">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="ms-label !mb-0">{t('room.players', { n: 1, total: seats })}</span>
                <div className="ms-seg !grid-flow-col" role="group" aria-label={t('setup.players')}>
                  {Array.from({ length: 4 - min + 1 }, (_, i) => i + min).map((n) => (
                    <button key={n} type="button" className="!min-h-[34px] !px-3" aria-pressed={seats === n} onClick={() => setSeats(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                <li className="rm-seat">
                  <Crown className="w-4 h-4 text-[var(--cz-gold)]" aria-hidden />
                  <span className="font-bold">{t('games.you')}</span>
                  <span className="ml-auto text-xs text-emerald-300 font-bold">{t('room.ready')}</span>
                </li>
                {Array.from({ length: seats - 1 }, (_, i) => (
                  <li key={i} className="rm-seat is-waiting">
                    <span className="text-sm">{t('room.waiting')}</span>
                    <span className="rm-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full mt-4" onClick={startWithBots}>
                {seats > 1 ? <Bot className="w-5 h-5" /> : <Play className="w-5 h-5" />} {seats > 1 ? t('room.startBots') : t('room.start')}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
