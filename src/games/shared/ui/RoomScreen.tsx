import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Check, CircleUserRound, CloudOff, Copy, Crown, KeyRound, LogOut, Play, Timer, Users, Zap } from 'lucide-react';
import { useNavigation } from '@/components/Navigation';
import { useI18n } from '@/i18n';
import { useProfileName } from '@/settings/profile';
import { useAccount } from '@/account/useAccount';
import type { OnlineGame, Screen, TableGame } from '@/types/navigation';
import { usePreferences } from '@/settings/usePreferences';
import { newRoomCode, parseRoomCode } from '../multiplayer/roomCode';
import { loadBingoSetup, loadDominoSetup, saveBingoSetup, saveDominoSetup } from '../setup';
import { GameSceneBackground } from '../scenes/GameScenes';
import { onlineConfig, roomCall } from '@/games/online/client';
import type { OnlineConfig } from '@/games/online/client';
import { useOnlineRoom } from '@/games/online/useOnlineRoom';
import { matchScreen } from '@/games/online/screens';
import { OnlineGate } from '@/games/online/OnlineGate';
import { COIN_GAMES, QUICK_GAMES, SEAT_RANGE } from '@/games/online/protocol';
import type { RoomErrorCode, RoomGame, RoomView } from '@/games/online/protocol';
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
  if (!cfg) return game === 'domino' || game === 'bingo' ? <OfflineRoom game={game} /> : <NoServer game={game} />;
  if (params.room) return <Lobby code={params.room} />;
  return <RoomEntry game={game} cfg={cfg} joining={params.join === true} />;
}

/** Where "back" goes from the room screen of this game. */
const backScreen = (game: OnlineGame): Screen => ({ domino: 'dominoSetup', bingo: 'bingoSetup', carta: 'cartaSetup', blackjack: 'blackjackSetup', roulette: 'rouletteSetup' } as const)[game];

/** Name of the game in room titles. */
const gameName = (game: OnlineGame, t: (k: string) => string) => (game === 'domino' || game === 'bingo' ? t(`hub.${game}.name`) : t(`room.games.${game}`));

function Shell({ game, title, onBack, children }: { game: OnlineGame; title: string; onBack: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={`ms ${game === 'bingo' ? 'hub-bingo' : 'hub-domino'} screen-in`}>
      <GameSceneBackground scene={game === 'bingo' ? 'hall' : 'lounge'} />
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
function RoomEntry({ game, cfg, joining }: { game: OnlineGame; cfg: OnlineConfig; joining: boolean }) {
  const { t } = useI18n();
  const { back, navigate } = useNavigation();
  const [profileName, saveName] = useProfileName();
  const account = useAccount();
  const accountName = account.status === 'user' ? (account.profile?.username ?? null) : null;
  const signedIn = !!accountName;
  // A guest types a name; a signed-in player always plays as their username (read live, so it's there
  // even when the account finished loading after this screen opened).
  const [typed, setName] = useState(profileName || '');
  const name = accountName ?? typed;
  // If the account can't be read (network), fall back to typing a name rather than blocking rooms.
  const waitingForAccount = account.status === 'loading' || (account.status === 'user' && !account.profile && !account.coinsError);
  const { preferences } = usePreferences();
  const range = SEAT_RANGE[game];
  const [seats, setSeats] = useState(range.quick);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'quick' | 'form'>(null);
  const [error, setError] = useState<RoomErrorCode | 'bad_code' | 'no_name' | null>(null);
  const [mode, setMode] = useState<'create' | 'join'>(joining ? 'join' : 'create');
  const coins = (COIN_GAMES as readonly string[]).includes(game);
  const quick = (QUICK_GAMES as readonly string[]).includes(game);
  // Coin tables: only a registered account (the server checks it again).
  const needAccount = coins && !(account.status === 'user' && account.coins?.registered);

  const open = (v: RoomView) => {
    if (v.status === 'lobby') navigate('room', { game: v.game, room: v.code }, { replace: true });
    else navigate(matchScreen(v.game), { room: v.code }, { replace: true });
  };

  const cleanName = () => {
    const clean = name.trim().slice(0, 16);
    if (!clean) {
      setError('no_name');
      return null;
    }
    if (!signedIn) saveName(clean);
    return clean;
  };

  const playNow = async () => {
    const clean = cleanName();
    if (!clean) return;
    setBusy('quick');
    setError(null);
    const res = await roomCall(cfg, { op: 'quick', game: game as RoomGame, name: clean });
    setBusy(null);
    if (!res.ok) return setError(res.code);
    open(res.view);
  };

  const submit = async () => {
    const clean = cleanName();
    if (!clean) return;
    const joinCode = mode === 'join' ? parseRoomCode(code) : null;
    if (mode === 'join' && !joinCode) return setError('bad_code');
    setBusy('form');
    setError(null);
    const d = loadDominoSetup();
    const b = loadBingoSetup();
    const settings = game === 'domino' ? { difficulty: d.difficulty, target: d.target } : game === 'bingo' ? { difficulty: b.difficulty, speed: b.speed } : { difficulty: preferences.difficulty };
    const res = mode === 'join' ? await roomCall(cfg, { op: 'join', code: joinCode!, name: clean }) : await roomCall(cfg, { op: 'create', game: game as RoomGame, seats, name: clean, settings });
    setBusy(null);
    if (!res.ok) return setError(res.code);
    open(res.view);
  };

  return (
    <Shell game={game} title={t(mode === 'join' ? 'room.joinTitle' : quick ? 'room.onlineTitle' : 'room.createTitle', { game: gameName(game, t) })} onBack={() => back(backScreen(game))}>
      {needAccount && (
        <section className="ms-panel flex gap-3 items-start" role="note">
          <CircleUserRound className="w-5 h-5 shrink-0 mt-0.5 text-[var(--cz-gold)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="ms-note !text-white/85">{t('room.coinTableNeedsAccount')}</p>
            <button type="button" className="cz-btn cz-btn-primary cz-btn-sm mt-2" onClick={() => navigate('account')}>
              {t('account.signUp')}
            </button>
          </div>
        </section>
      )}
      {quick && !needAccount && (
        <section className="ms-panel text-center">
          <p className="ms-note mb-3">{t(coins ? 'room.quickHintCoins' : 'room.quickHint')}</p>
          <button type="button" className="cz-btn cz-btn-primary cz-btn-game w-full" onClick={() => void playNow()} disabled={!!busy || waitingForAccount} aria-busy={busy === 'quick'}>
            <Zap className="w-5 h-5" /> {busy === 'quick' ? t('online.connecting') : t('room.playNow')}
          </button>
        </section>
      )}
      {quick && !needAccount && (
        <div className="ms-seg" role="tablist" aria-label={t('room.privateRoom')}>
          <button type="button" role="tab" aria-selected={mode === 'create'} aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
            {t('room.createPrivate')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'join'} aria-pressed={mode === 'join'} onClick={() => setMode('join')}>
            {t('room.joinWithCode')}
          </button>
        </div>
      )}
      {!needAccount && (
      <section className="ms-panel">
        <label className="ms-label" htmlFor="room-name">
          {t('room.yourName')}
        </label>
        <input id="room-name" className="rm-input !tracking-normal !normal-case" maxLength={16} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('room.namePlaceholder')} readOnly={signedIn} aria-readonly={signedIn} />
        {signedIn && <p className="ms-note mt-1">{t('room.accountName')}</p>}
        {mode === 'join' ? (
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
              {Array.from({ length: range.max - range.min + 1 }, (_, i) => i + range.min).map((n) => (
                <button key={n} type="button" aria-pressed={seats === n} onClick={() => setSeats(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="ms-note mt-2">{t(coins ? 'room.seatsNoteTable' : 'room.seatsNote')}</p>
          </div>
        )}
        <button type="button" className={`cz-btn ${quick ? 'cz-btn-secondary' : 'cz-btn-primary'} cz-btn-game w-full mt-5`} onClick={submit} disabled={!!busy || waitingForAccount} aria-busy={busy === 'form' || waitingForAccount}>
          {mode === 'join' ? <KeyRound className="w-5 h-5" /> : <Users className="w-5 h-5" />} {busy === 'form' ? t('online.connecting') : t(mode === 'join' ? 'room.join' : 'room.create')}
        </button>
      </section>
      )}
      {error && (
        <p className="ms-note mt-1 !text-[#ffb3b3] text-center" role="alert">
          {error === 'bad_code' ? t('room.badCode') : error === 'no_name' ? t('room.needName') : t(`online.errors.${error}`)}
        </p>
      )}
    </Shell>
  );
}

/** A room game other than Domino / Bingo in a build without the online server. */
function NoServer({ game }: { game: OnlineGame }) {
  const { t } = useI18n();
  const { back } = useNavigation();
  return (
    <Shell game={game} title={t('room.onlineTitle', { game: gameName(game, t) })} onBack={() => back(backScreen(game))}>
      <div className="ms-panel flex gap-3 items-start" role="note">
        <CloudOff className="w-5 h-5 shrink-0 mt-0.5 text-[var(--cz-gold)]" aria-hidden />
        <p className="ms-note !text-white/80">{t('room.noServer')}</p>
      </div>
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
    if (v?.status === 'playing') navigate(matchScreen(v.game), { room: code }, { replace: true });
  }, [v?.status, v?.game, code, navigate]);
  // Public rooms start by themselves: a countdown.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!v?.startsAt) return;
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [v?.startsAt]);
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
    <Shell game={v.game} title={t('room.createTitle', { game: gameName(v.game, t) })} onBack={leave}>
      {v.startsAt !== null && (
        <section className="ms-panel text-center" role="status" aria-live="polite">
          <p className="font-display font-bold text-lg inline-flex items-center gap-2">
            <Timer className="w-5 h-5 text-[var(--cz-gold)]" aria-hidden />
            {t('room.startsIn', { s: Math.max(0, Math.ceil((v.startsAt - (clock + (v.serverNow - Date.now()))) / 1000)) })}
          </p>
          <p className="ms-note mt-1">{t('room.publicHint')}</p>
        </section>
      )}
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
        <p className="ms-note mt-1">{t('room.shareHint', { game: gameName(v.game, t) })}</p>
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
