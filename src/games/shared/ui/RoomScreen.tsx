import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Check, CloudOff, Copy, Crown, KeyRound, LogOut, Play, Users } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useProfileName } from '@/settings/profile';
import { useAccount } from '@/account/useAccount';
import type { TableGame } from '@/types/navigation';
import { newRoomCode, parseRoomCode } from '../multiplayer/roomCode';
import { loadBingoSetup, loadDominoSetup, saveBingoSetup, saveDominoSetup } from '../setup';
import { GameSceneBackground } from '../scenes/GameScenes';
import { onlineConfig, roomCall } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';
import { useOnlineRoom } from '@/games/online/useOnlineRoom';
import { OnlineGate } from '@/games/online/OnlineGate';
import type { RoomErrorCode } from '@/games/online/protocol';
import './hub.css';

/**
 * Online rooms. With the server configured: create a room (you host it), share the code, friends join,
 * everyone taps Ready, the host starts; empty seats are played by the server's bots. Without a server
 * (a build with no Supabase settings) the screen says so and offers a match against bots instead.
 */
export function RoomScreen() {
  const { params } = useNavigation();
  const cfg = useMemo(() => onlineConfig(), []);
  const game = params.game ?? 'domino';
  if (!cfg) return <OfflineRoom game={game} />;
  if (params.room) return <Lobby code={params.room} />;
  return <RoomEntry game={game} cfg={cfg} joining={params.join === true} />;
}

function Shell({ game, title, onBack, children }: { game: TableGame; title: string; onBack: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={`ms ${game === 'domino' ? 'hub-domino' : 'hub-bingo'} screen-in`}>
      <GameSceneBackground scene={game === 'domino' ? 'lounge' : 'hall'} />
      <header className="ms-top">
        <button type="button" className="cz-btn cz-btn-secondary cz-icon-btn" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-extrabold text-lg truncate">{title}</h1>
      </header>
      <main className="ms-main">{children}</main>
    </div>
  );
}

/** Create a room or join one with a code. */
function RoomEntry({ game, cfg, joining }: { game: TableGame; cfg: OnlineConfig; joining: boolean }) {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const [profileName, saveName] = useProfileName();
  const account = useAccount();
  const [name, setName] = useState(profileName || account.user?.name || '');
  const [seats, setSeats] = useState(4);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RoomErrorCode | 'bad_code' | 'no_name' | null>(null);
  const min = game === 'domino' ? 2 : 1;

  const submit = async () => {
    const clean = name.trim().slice(0, 16);
    if (!clean) return setError('no_name');
    const joinCode = joining ? parseRoomCode(code) : null;
    if (joining && !joinCode) return setError('bad_code');
    setBusy(true);
    setError(null);
    saveName(clean);
    const d = loadDominoSetup();
    const b = loadBingoSetup();
    const res = joining
      ? await roomCall(cfg, { op: 'join', code: joinCode!, name: clean })
      : await roomCall(cfg, { op: 'create', game, seats, name: clean, settings: game === 'domino' ? { difficulty: d.difficulty, target: d.target } : { difficulty: b.difficulty, speed: b.speed } });
    setBusy(false);
    if (!res.ok) return setError(res.code);
    navigate('room', { game: res.view.game, room: res.view.code }, { replace: true });
  };

  return (
    <Shell game={game} title={t(joining ? 'room.joinTitle' : 'room.createTitle', { game: t(`hub.${game}.name`) })} onBack={() => back(game === 'domino' ? 'dominoSetup' : 'bingoSetup')}>
      <section className="ms-panel">
        <label className="ms-label" htmlFor="room-name">
          {t('room.yourName')}
        </label>
        <input id="room-name" className="rm-input !tracking-normal !normal-case" maxLength={16} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('room.namePlaceholder')} />
        {joining ? (
          <>
            <label className="ms-label mt-4" htmlFor="room-code">
              {t('room.codeLabel')}
            </label>
            <input id="room-code" className="rm-input" inputMode="text" autoComplete="off" autoCapitalize="characters" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB7K2" />
          </>
        ) : (
          <div className="mt-4">
            <span className="ms-label">{t('room.seatsLabel')}</span>
            <div className="ms-seg" role="group" aria-label={t('room.seatsLabel')}>
              {Array.from({ length: 4 - min + 1 }, (_, i) => i + min).map((n) => (
                <button key={n} type="button" aria-pressed={seats === n} onClick={() => setSeats(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="ms-note mt-2">{t('room.seatsNote')}</p>
          </div>
        )}
        <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full mt-5" onClick={submit} disabled={busy} aria-busy={busy}>
          {joining ? <KeyRound className="w-5 h-5" /> : <Users className="w-5 h-5" />} {busy ? t('online.connecting') : t(joining ? 'room.join' : 'room.create')}
        </button>
        {error && (
          <p className="ms-note mt-3 !text-[#ffb3b3]" role="alert">
            {error === 'bad_code' ? t('room.badCode') : error === 'no_name' ? t('room.needName') : t(`online.errors.${error}`)}
          </p>
        )}
      </section>
    </Shell>
  );
}

/** The room before the match: code, who's in, ready, start. Updates live. */
function Lobby({ code }: { code: string }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const room = useOnlineRoom(code);
  const [copied, setCopied] = useState(false);
  const v = room.view;
  useEffect(() => {
    if (v?.status === 'playing') navigate(v.game, { room: code }, { replace: true });
  }, [v?.status, v?.game, code, navigate]);
  const home = () => navigate('home', {}, { replace: true });
  if (!v || v.status !== 'lobby') return <OnlineGate view={v} error={room.error} onExit={home} />;

  const me = v.members.find((m) => m.seat === v.you)!;
  const allReady = v.members.every((m) => m.ready);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const leave = async () => {
    await room.send({ op: 'leave' });
    home();
  };
  const seats = Array.from({ length: v.seats }, (_, i) => `s${i}`);

  return (
    <Shell game={v.game} title={t('room.createTitle', { game: t(`hub.${v.game}.name`) })} onBack={leave}>
      <section className="ms-panel text-center">
        <span className="ms-label">{t('room.code')}</span>
        <div className="rm-code" aria-label={t('room.codeAria', { code: v.code.split('').join(' ') })}>
          {v.code.split('').map((c, i) => (
            <span key={i} aria-hidden>
              {c}
            </span>
          ))}
        </div>
        <button type="button" className="cz-btn cz-btn-quiet cz-btn-sm mt-2" onClick={copy}>
          <Copy className="w-4 h-4" /> {copied ? t('room.copied') : t('room.copy')}
        </button>
        <p className="ms-note mt-1">{t('room.shareHint', { game: t(`hub.${v.game}.name`) })}</p>
      </section>
      <section className="ms-panel">
        <span className="ms-label">{t('room.players', { n: v.members.length, total: v.seats })}</span>
        <ul className="flex flex-col gap-2" aria-live="polite">
          {seats.map((seat) => {
            const m = v.members.find((x) => x.seat === seat);
            if (!m)
              return (
                <li key={seat} className="rm-seat is-waiting">
                  <span className="text-sm">{t('room.waiting')}</span>
                  <span className="rm-dots" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="ml-auto text-[11px] inline-flex items-center gap-1 opacity-80">
                    <Bot className="w-3.5 h-3.5" aria-hidden /> {t('room.botIfEmpty')}
                  </span>
                </li>
              );
            return (
              <li key={seat} className="rm-seat">
                {m.host ? <Crown className="w-4 h-4 text-[var(--cz-gold)]" aria-label={t('room.host')} /> : <Users className="w-4 h-4 opacity-60" aria-hidden />}
                <span className="font-bold truncate">
                  {m.name}
                  {m.seat === v.you ? ` · ${t('games.you')}` : ''}
                </span>
                <span className={`ml-auto text-xs font-bold ${m.ready ? 'text-emerald-300' : 'text-white/50'}`}>{m.ready ? t('room.ready') : t('room.notReady')}</span>
              </li>
            );
          })}
        </ul>
        {me.host ? (
          <>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full mt-4" disabled={!allReady} onClick={() => void room.send({ op: 'start' })}>
              <Play className="w-5 h-5" /> {t('room.startOnline')}
            </button>
            {!allReady && <p className="ms-note mt-2 text-center">{t('room.waitReady')}</p>}
          </>
        ) : (
          <>
            <button type="button" className={`cz-btn ${me.ready ? 'cz-btn-secondary' : 'cz-btn-primary'} cz-btn-game w-full mt-4`} onClick={() => void room.send({ op: 'ready', ready: !me.ready })} aria-pressed={me.ready}>
              <Check className="w-5 h-5" /> {me.ready ? t('room.notReadyAction') : t('room.readyAction')}
            </button>
            <p className="ms-note mt-2 text-center">{t('room.hostStarts')}</p>
          </>
        )}
        <button type="button" className="cz-btn cz-btn-quiet w-full mt-2" onClick={leave}>
          <LogOut className="w-4 h-4" /> {t('room.leave')}
        </button>
      </section>
    </Shell>
  );
}

/** A build without the online server: say so, and offer bots. */
function OfflineRoom({ game }: { game: TableGame }) {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const code = useMemo(() => newRoomCode(), []);
  const min = game === 'domino' ? 2 : 1;
  const [seats, setSeats] = useState(4);
  const startWithBots = () => {
    if (game === 'domino') saveDominoSetup({ ...loadDominoSetup(), seats: seats as 2 | 3 | 4, others: ['bot', 'bot', 'bot'] });
    else saveBingoSetup({ ...loadBingoSetup(), players: seats as 1 | 2 | 3 | 4 });
    navigate(game, {}, { replace: true });
  };
  return (
    <Shell game={game} title={t('room.createTitle', { game: t(`hub.${game}.name`) })} onBack={() => back(game === 'domino' ? 'dominoSetup' : 'bingoSetup')}>
      <div className="ms-panel flex gap-3 items-start" role="note">
        <CloudOff className="w-5 h-5 shrink-0 mt-0.5 text-[var(--cz-gold)]" aria-hidden />
        <p className="ms-note !text-white/80">{t('room.offline')}</p>
      </div>
      <section className="ms-panel">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="ms-label !mb-0">{t('room.players', { n: 1, total: seats })}</span>
          <div className="ms-seg !grid-flow-col" role="group" aria-label={t('setup.players')}>
            {Array.from({ length: 4 - min + 1 }, (_, i) => i + min).map((n) => (
              <button key={n} type="button" className="!min-h-[34px] !px-3" aria-pressed={seats === n} onClick={() => setSeats(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="ms-note">{t('room.code')}: {code}</p>
        <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full mt-4" onClick={startWithBots}>
          <Bot className="w-5 h-5" /> {seats > 1 ? t('room.startBots') : t('room.start')}
        </button>
      </section>
    </Shell>
  );
}
