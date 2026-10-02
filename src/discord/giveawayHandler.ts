// DISCORD GIVEAWAY: the request handler of the discord-giveaway edge function, used by the Discord bot (BotGhost)
// and by the app (account link codes). Pure: the database, the user check and the clock are injected, so it is
// tested without Deno or a network (supabase/functions/discord-giveaway/source.ts wires the real ones).
//
// Rules:
// - Every answer is JSON, { ok: true, operation, ... } or { ok: false, operation, code, error }, with a fitting HTTP
//   status. Nothing escapes as an unhandled exception (the platform would answer 500 EDGE_FUNCTION_ERROR, which
//   BotGhost shows as "502 Bad gateway").
// - Bot operations require the X-BotGhost-Secret header; only its SHA-256 is stored (discord_bot_config). The value
//   is never logged or returned.
// - Discord IDs are 19-digit snowflakes, beyond what a JSON number keeps exactly (2^53). BotGhost sends them
//   unquoted ({guild_id}), so the body is read with those numbers turned into strings before parsing.
// - A BotGhost variable that was not replaced arrives literally ("{giveaway_end}"); for the end time and the prize
//   it means "use the default" (7 days, 10,000 coins), for an ID it is a clear 400.

export interface DbError {
  status: number;
  /** Postgres / PostgREST error code (P0409, 42501…), or 'network'. */
  code: string;
  message: string;
  details?: string;
}
export type DbResult<T = unknown> = { ok: true; data: T } | { ok: false; error: DbError };

export interface GiveawayDeps {
  /** Calls a database function with the service role. */
  rpc: (name: string, args: Record<string, unknown>) => Promise<DbResult>;
  /** SHA-256 (hex) of the bot secret, or null if it can't be read or isn't configured. */
  botSecretHash: () => Promise<string | null>;
  /** The signed-in Carta user from an "Authorization: Bearer" header, or null. */
  verifyUser: (authorization: string) => Promise<{ id: string; registered: boolean } | null>;
  sha256Hex: (value: string) => Promise<string>;
  log?: (message: string) => void;
}

export interface GiveawayRequest {
  method: string;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  body: string;
}
export interface GiveawayResponse {
  status: number;
  body: Record<string, unknown>;
}

const SNOWFLAKE = /^[0-9]{15,22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER = /^\{[^{}]*\}$/;
/** Body keys that carry Discord IDs. */
const ID_KEYS = ['guildId', 'channelId', 'messageId', 'discordUserId', 'guild_id', 'channel_id', 'message_id', 'discord_user_id', 'user_id', 'userId'];
const BIG_ID = new RegExp(`("(?:${ID_KEYS.join('|')})"\\s*:\\s*)(-?\\d{16,})(?=\\s*[,}\\]])`, 'g');
/** A BotGhost variable left unquoted and unreplaced ("guildId": {guild_id}): read it as the string "{guild_id}". */
const BARE_VARIABLE = /(:\s*)\{([A-Za-z0-9_.]+)\}(?=\s*[,}\]])/g;

const MESSAGES: Record<string, string> = {
  bad_request: 'La petición no es JSON válido.',
  payload_too_large: 'La petición es demasiado grande.',
  method_not_allowed: 'Método no permitido: usa POST.',
  unknown_operation: 'Operación desconocida.',
  missing_secret: 'Falta la cabecera X-BotGhost-Secret.',
  forbidden: 'X-BotGhost-Secret no es válido.',
  bot_not_configured: 'El secreto del bot no está configurado en el servidor.',
  unauthorized: 'Inicia sesión con una cuenta registrada.',
  unresolved_variable: 'Una variable de BotGhost no se reemplazó.',
  invalid_discord_id: 'ID de Discord no válido (debe tener entre 15 y 22 dígitos).',
  invalid_giveaway_id: 'giveawayId no válido.',
  invalid_prize: 'prizeCoins debe ser un número entero entre 1 y 1,000,000,000.',
  invalid_ends_at: 'La fecha de fin no es válida: debe ser futura (más de 1 minuto) y como máximo a 90 días.',
  invalid_request: 'Petición no válida.',
  missing_field: 'Falta un campo obligatorio.',
  active_giveaway_exists: 'Ya hay un giveaway activo. Solo puede haber uno a la vez.',
  giveaway_not_found: 'No existe ese giveaway.',
  no_active_giveaway: 'No hay ningún giveaway activo.',
  account_required: 'La cuenta de Carta no está registrada.',
  database_error: 'Error de la base de datos.',
  database_unreachable: 'No se pudo contactar con la base de datos.',
  server: 'Error interno del servidor.',
  discord_not_linked: 'Tu cuenta de Discord no está vinculada a Carta Casino. Vincúlala en Carta → Perfil → Discord.',
  giveaway_closed: 'Este giveaway ya terminó.',
  giveaway_ended: 'Este giveaway ya terminó.',
  giveaway_still_active: 'El giveaway sigue activo.',
  no_expired_giveaway: 'No hay giveaways terminados pendientes de sorteo.',
  no_entries: 'El giveaway terminó sin participantes válidos.',
  already_awarded: 'Este giveaway ya fue premiado.',
  already_ended: 'Este giveaway ya terminó sin ganador.',
  not_an_entry: 'Ese usuario no participó en el giveaway.',
  invalid_or_expired_code: 'El código no es válido o caducó.',
  discord_already_linked: 'Esa cuenta de Discord ya está vinculada a otra cuenta de Carta.',
  account_already_linked: 'Esa cuenta de Carta ya está vinculada a otra cuenta de Discord.',
  enter_ok: '✅ ¡Ya estás participando en el sorteo!',
  link_ok: '✅ Tu cuenta de Discord quedó vinculada a Carta Casino.',
  awarded: 'Premio pagado.',
};
const message = (code: string) => MESSAGES[code] ?? code;

const ok = (operation: string, data: Record<string, unknown> = {}, status = 200): GiveawayResponse => ({ status, body: { ok: true, operation, ...data } });
const fail = (operation: string | null, status: number, code: string, extra: Record<string, unknown> = {}): GiveawayResponse => ({
  status,
  body: { ok: false, ...(operation ? { operation } : {}), code, error: message(code), message: message(code), ...extra },
});

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

/**
 * JSON body with Discord IDs kept exact (unquoted 16+ digit numbers in ID fields become strings) and unquoted,
 * unreplaced BotGhost variables read as strings (so the answer can name the missing variable).
 */
export function parseBody(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text.replace(BIG_ID, '$1"$2"').replace(BARE_VARIABLE, '$1"{$2}"'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('not an object');
  return parsed as Record<string, unknown>;
}

const isPlaceholder = (v: unknown) => typeof v === 'string' && PLACEHOLDER.test(v.trim());
/** A value that means "not given": missing, null, empty, or a BotGhost variable that wasn't replaced. */
const absent = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && (v.trim() === '' || isPlaceholder(v)));

function pick(body: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (body[k] !== undefined) return body[k];
  return undefined;
}

/** A Discord ID from the body: required ones throw a clear error; optional ones return null when absent. */
export function discordId(body: Record<string, unknown>, keys: string[], required: boolean): string | null {
  const v = pick(body, keys);
  if (isPlaceholder(v)) throw new HttpError(400, 'unresolved_variable', { field: keys[0], value: String(v).trim() });
  if (absent(v)) {
    if (required) throw new HttpError(400, 'missing_field', { field: keys[0] });
    return null;
  }
  const s = typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!SNOWFLAKE.test(s)) throw new HttpError(400, 'invalid_discord_id', { field: keys[0] });
  return s;
}

function giveawayId(body: Record<string, unknown>, required: boolean): string | null {
  const v = pick(body, ['giveawayId', 'giveaway_id', 'id']);
  if (isPlaceholder(v)) throw new HttpError(400, 'unresolved_variable', { field: 'giveawayId', value: String(v).trim() });
  if (absent(v)) {
    if (required) throw new HttpError(400, 'missing_field', { field: 'giveawayId' });
    return null;
  }
  const s = String(v).trim();
  if (!UUID.test(s)) throw new HttpError(400, 'invalid_giveaway_id', { field: 'giveawayId' });
  return s;
}

/**
 * The end time as an ISO string, or null for the default duration. Accepts endsAt, ends_at, giveaway_end,
 * giveawayEnd, endTime, end_time: an ISO date, a Unix time in seconds or milliseconds (number or digits), or a
 * Discord timestamp tag (<t:1791401400:R>).
 */
export function endsAtFrom(body: Record<string, unknown>): string | null {
  const v = pick(body, ['endsAt', 'ends_at', 'giveaway_end', 'giveawayEnd', 'endTime', 'end_time']);
  if (absent(v)) return null;
  let ms: number;
  if (typeof v === 'number') ms = v > 1e12 ? v : v * 1000;
  else if (typeof v === 'string') {
    const s = v.trim();
    const tag = /^<t:(\d{9,11})(?::[a-zA-Z])?>$/.exec(s);
    if (tag) ms = Number(tag[1]) * 1000;
    else if (/^\d{9,13}$/.test(s)) ms = s.length >= 13 ? Number(s) : Number(s) * 1000;
    else ms = Date.parse(s);
  } else ms = NaN;
  if (!Number.isFinite(ms)) throw new HttpError(400, 'invalid_ends_at', { field: 'endsAt' });
  return new Date(ms).toISOString();
}

/** The prize, or null for the configured default (10,000). */
export function prizeFrom(body: Record<string, unknown>): number | null {
  const v = pick(body, ['prizeCoins', 'prize_coins', 'prize']);
  if (absent(v)) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim().replace(/[,_]/g, '')) ? Number(v.trim().replace(/[,_]/g, '')) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1_000_000_000) throw new HttpError(400, 'invalid_prize', { field: 'prizeCoins' });
  return n;
}

/** A giveaway row (snake_case from the table, or already camelCase from a jsonb helper) in the API's shape. */
export function giveawayView(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (r.id === undefined || r.id === null) return null;
  const g = (snake: string, camel: string) => (r[camel] !== undefined ? r[camel] : r[snake]);
  return {
    id: r.id,
    guildId: g('guild_id', 'guildId'),
    channelId: g('channel_id', 'channelId'),
    messageId: g('message_id', 'messageId') ?? null,
    prizeCoins: Number(g('prize_coins', 'prizeCoins')),
    startsAt: g('starts_at', 'startsAt'),
    endsAt: g('ends_at', 'endsAt'),
    status: r.status,
    winnerDiscordUserId: g('winner_discord_user_id', 'winnerDiscordUserId') ?? null,
    ...(r.entries !== undefined ? { entries: Number(r.entries) } : {}),
  };
}

const firstRow = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const STATUS_OF: Record<string, number> = { P0400: 400, P0401: 401, P0403: 403, P0404: 404, P0409: 409 };

/** Statuses that stay as they are with alwaysOk: the request itself or its credentials are wrong. */
const HARD_STATUSES = new Set([401, 403, 405, 413]);

/**
 * BotGhost only fills a request's response variables on a 2xx answer, so a bot can send `"alwaysOk": true`: a refusal
 * (400/404/409) then answers 200 with the same body (`ok: false`, `code`, `message`) and the real status in
 * `httpStatus`. Missing or wrong credentials and server errors keep their status.
 */
export async function handleGiveawayRequest(req: GiveawayRequest, deps: GiveawayDeps): Promise<GiveawayResponse> {
  const out = await handle(req, deps);
  if (out.status < 400 || out.status >= 500 || HARD_STATUSES.has(out.status)) return out;
  let soft = false;
  try {
    const body = parseBody(req.body);
    soft = body.alwaysOk === true || body.alwaysOk === 'true';
  } catch {
    soft = false;
  }
  return soft ? { status: 200, body: { ...out.body, httpStatus: out.status } } : out;
}

async function handle(req: GiveawayRequest, deps: GiveawayDeps): Promise<GiveawayResponse> {
  const log = deps.log ?? (() => {});
  let operation: string | null = null;

  /** Calls the database; a database refusal becomes an HttpError with its own code and status. */
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const res = await deps.rpc(name, args);
    if (res.ok) return res.data;
    const e = res.error;
    if (e.code === 'network') throw new HttpError(503, 'database_unreachable');
    const known = STATUS_OF[e.code];
    if (known) throw new HttpError(known, e.message || 'invalid_request', e.details ? { detail: e.details } : {});
    if (e.code === '22007' || e.code === '22008') throw new HttpError(400, 'invalid_ends_at');
    if (e.code === '22P02') throw new HttpError(400, 'invalid_request');
    log(`discord-giveaway ${operation ?? '-'}: database ${e.code} ${e.message}`);
    throw new HttpError(500, 'database_error', { dbCode: e.code });
  };
  const current = async () => giveawayView(await call('discord_current_giveaway', {}));
  /** A reason-carrying result row ({ ok, reason, ... }): 200 when ok, 409 otherwise, with a readable message. */
  const outcome = (op: string, row: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => {
    const r = row ?? {};
    const reason = typeof r.reason === 'string' ? r.reason : null;
    const body = { ...r, ...extra, ...(reason ? { reason, message: message(reason) } : r.ok === true ? { message: message(`${op}_ok`) } : {}) };
    return r.ok === true ? ok(op, body) : fail(op, reason === 'giveaway_not_found' ? 404 : 409, reason ?? 'invalid_request', body);
  };

  try {
    if (req.method === 'GET') return ok('health', { service: 'discord-giveaway', status: 'healthy' });
    if (req.method !== 'POST') return fail(null, 405, 'method_not_allowed');
    if (req.body.length > 8192) return fail(null, 413, 'payload_too_large');
    let body: Record<string, unknown>;
    try {
      body = parseBody(req.body);
    } catch {
      return fail(null, 400, 'bad_request');
    }
    operation = typeof body.op === 'string' ? body.op.trim().toLowerCase() : typeof body.operation === 'string' ? body.operation.trim().toLowerCase() : '';
    const op = operation;

    // The app: a signed-in player asks for a link code (no bot secret).
    if (op === 'link_code') {
      const user = await deps.verifyUser(req.headers['authorization'] ?? '');
      if (!user?.registered) return fail(op, 401, 'unauthorized');
      const code = await call('discord_issue_link_code', { p_user: user.id });
      return ok(op, { code });
    }

    // Everything else: the bot, with its secret.
    const supplied = (req.headers['x-botghost-secret'] ?? '').trim();
    if (!supplied) return fail(op || null, 401, 'missing_secret');
    const expected = await deps.botSecretHash();
    if (!expected) return fail(op || null, 503, 'bot_not_configured');
    if (supplied.length > 512 || !timingSafeEqual(await deps.sha256Hex(supplied), expected.toLowerCase())) return fail(op || null, 403, 'forbidden');

    switch (op) {
      case 'link': {
        const discordUserId = discordId(body, ['discordUserId', 'discord_user_id', 'userId', 'user_id'], true);
        const code = String(pick(body, ['code']) ?? '').trim();
        if (!code || isPlaceholder(code)) throw new HttpError(400, isPlaceholder(code) ? 'unresolved_variable' : 'missing_field', { field: 'code' });
        const row = firstRow(await call('discord_consume_link_code', { p_code: code, p_discord_user_id: discordUserId })) as Record<string, unknown> | null;
        return outcome(op, row);
      }

      case 'create': {
        const guildId = discordId(body, ['guildId', 'guild_id'], true);
        const channelId = discordId(body, ['channelId', 'channel_id'], true);
        const messageId = discordId(body, ['messageId', 'message_id'], false);
        const prizeCoins = prizeFrom(body);
        const endsAt = endsAtFrom(body);
        try {
          const row = firstRow(
            await call('discord_create_giveaway', { p_guild_id: guildId, p_channel_id: channelId, p_message_id: messageId, p_prize_coins: prizeCoins, p_ends_at: endsAt })
          );
          const giveaway = giveawayView(row);
          if (!giveaway) throw new HttpError(500, 'database_error');
          return ok(op, { giveaway, endsAtSource: endsAt ? 'request' : 'default', prizeSource: prizeCoins !== null ? 'request' : 'default' });
        } catch (e) {
          if (e instanceof HttpError && e.code === 'active_giveaway_exists') {
            return fail(op, 409, 'active_giveaway_exists', { activeGiveaway: await current().catch(() => null) });
          }
          throw e;
        }
      }

      case 'message': {
        const id = giveawayId(body, false);
        const messageId = discordId(body, ['messageId', 'message_id'], true);
        const row = firstRow(await call('discord_set_giveaway_message', { p_giveaway_id: id, p_message_id: messageId }));
        return ok(op, { giveaway: giveawayView(row) });
      }

      case 'enter': {
        const discordUserId = discordId(body, ['discordUserId', 'discord_user_id', 'userId', 'user_id'], true);
        const id = giveawayId(body, false);
        const messageId = id ? null : discordId(body, ['messageId', 'message_id'], false);
        if (id || !messageId) {
          const target = id ?? ((await current())?.id as string | undefined) ?? null;
          if (!target) return fail(op, 404, 'no_active_giveaway');
          const row = firstRow(await call('discord_enter_giveaway', { p_giveaway_id: target, p_discord_user_id: discordUserId })) as Record<string, unknown> | null;
          return outcome(op, row, { giveawayId: target });
        }
        const row = firstRow(await call('discord_enter_giveaway_by_message', { p_message_id: messageId, p_discord_user_id: discordUserId })) as Record<string, unknown> | null;
        return outcome(op, row);
      }

      case 'entries': {
        const id = giveawayId(body, false) ?? (((await current())?.id as string | undefined) ?? null);
        if (!id) return fail(op, 404, 'no_active_giveaway');
        const rows = await call('discord_list_entries', { p_giveaway_id: id });
        const entries = Array.isArray(rows) ? rows.map((x) => String((x as Record<string, unknown>).discord_user_id)) : [];
        return ok(op, { giveawayId: id, count: entries.length, entries });
      }

      case 'draw': {
        const id = giveawayId(body, false);
        const row = firstRow(await call('discord_draw_giveaway', { p_giveaway_id: id })) as Record<string, unknown> | null;
        return outcome(op, row);
      }

      case 'award': {
        const id = giveawayId(body, true);
        const discordUserId = discordId(body, ['discordUserId', 'discord_user_id', 'userId', 'user_id'], true);
        const row = firstRow(await call('discord_award_giveaway', { p_giveaway_id: id, p_discord_user_id: discordUserId })) as Record<string, unknown> | null;
        return outcome(op, row);
      }

      case 'status':
      case 'current': {
        const id = giveawayId(body, false);
        const discordUserId = discordId(body, ['discordUserId', 'discord_user_id', 'userId', 'user_id'], false);
        let giveaway: Record<string, unknown> | null;
        if (id) {
          const rows = await call('discord_giveaway_by_id', { p_giveaway_id: id });
          giveaway = giveawayView(rows);
          if (!giveaway) return fail(op, 404, 'giveaway_not_found');
        } else {
          giveaway = await current();
          if (!giveaway) return fail(op, 404, 'no_active_giveaway', { giveaway: null });
        }
        const linked = discordUserId ? (await call('discord_is_linked', { p_discord_user_id: discordUserId })) === true : undefined;
        return ok(op, { giveaway, ...(linked !== undefined ? { linked } : {}) });
      }

      case 'tick': {
        const result = (await call('discord_giveaway_tick', {})) as Record<string, unknown>;
        const pending = await call('discord_pending_announcements', {});
        return ok(op, {
          drawn: result?.drawn ?? [],
          created: giveawayView(result?.created),
          active: giveawayView(result?.active),
          pending,
        });
      }

      case 'pending': {
        const pending = (await call('discord_pending_announcements', {})) as Record<string, unknown>;
        return ok(op, { ...pending });
      }

      case 'announced': {
        const id = giveawayId(body, true);
        const marked = (await call('discord_mark_announced', { p_giveaway_id: id })) === true;
        return marked ? ok(op, { giveawayId: id }) : fail(op, 409, 'invalid_request', { giveawayId: id });
      }

      default:
        return fail(op || null, 400, 'unknown_operation', { operations: ['link_code', 'link', 'create', 'message', 'enter', 'entries', 'draw', 'award', 'status', 'current', 'tick', 'pending', 'announced'] });
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(operation || null, e.status, e.code, e.extra);
    log(`discord-giveaway ${operation ?? '-'}: ${e instanceof Error ? e.message : String(e)}`);
    return fail(operation || null, 500, 'server');
  }
}
