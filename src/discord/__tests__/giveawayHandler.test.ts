// The discord-giveaway edge function's handler, with a fake database: BotGhost's real request bodies (giveaway_end,
// endsAt, unquoted 19-digit IDs, unreplaced variables), the bot secret, the one-active rule, readable JSON errors
// instead of crashes, and every operation the bot and the app use.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { cycleView, endsAtFrom, giveawayView, handleGiveawayRequest, parseBody, prizeFrom } from '../giveawayHandler';
import type { DbResult, GiveawayDeps, GiveawayRequest } from '../giveawayHandler';

const SECRET = 'test-secret-value-0123456789abcdef';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const GUILD = '1554894448767401984';
const CHANNEL = '1554894449572581489';
const ROW = {
  id: '3e5d93b7-dc64-40cf-87d3-42d3417ce7eb',
  guild_id: GUILD,
  channel_id: CHANNEL,
  message_id: null,
  prize_coins: 10000,
  max_winners: 1,
  starts_at: '2026-10-01T00:00:00+00:00',
  ends_at: '2026-10-07T19:30:00+00:00',
  status: 'active',
  winner_discord_user_id: null,
};

function setup(responses: Record<string, (args: Record<string, unknown>) => DbResult | Promise<DbResult>> = {}, overrides: Partial<GiveawayDeps> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const logs: string[] = [];
  const deps: GiveawayDeps = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const r = responses[name];
      if (!r) return { ok: true, data: null } as DbResult;
      return r(args);
    }),
    botSecretHash: async () => sha(SECRET),
    verifyUser: async () => null,
    sha256Hex: async (v) => sha(v),
    log: (m) => logs.push(m),
    ...overrides,
  };
  const send = (body: unknown, opts: { secret?: string | null; method?: string; raw?: boolean; auth?: string } = {}) => {
    const req: GiveawayRequest = {
      method: opts.method ?? 'POST',
      headers: { 'x-botghost-secret': opts.secret === null ? undefined : (opts.secret ?? SECRET), authorization: opts.auth },
      body: opts.raw ? String(body) : JSON.stringify(body),
    };
    return handleGiveawayRequest(req, deps);
  };
  return { deps, calls, logs, send };
}

const created = (args: Record<string, unknown>): DbResult => ({
  ok: true,
  data: { ...ROW, ends_at: args.p_ends_at ?? '2026-10-09T00:00:00+00:00', prize_coins: args.p_prize_coins ?? 10000, guild_id: args.p_guild_id, channel_id: args.p_channel_id },
});

describe('op=create from BotGhost', () => {
  it('accepts giveaway_end (the exact BotGhost body) and answers with the real row', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const res = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, messageId: '', prizeCoins: 10000, giveaway_end: '2026-10-07T19:30:00Z' });
    expect(res.status).toBe(200);
    expect(calls[0]).toEqual({
      name: 'discord_create_giveaway',
      args: { p_guild_id: GUILD, p_channel_id: CHANNEL, p_message_id: null, p_prize_coins: 10000, p_ends_at: '2026-10-07T19:30:00.000Z' },
    });
    expect(res.body).toMatchObject({
      ok: true,
      operation: 'create',
      endsAtSource: 'request',
      giveaway: { id: ROW.id, guildId: GUILD, channelId: CHANNEL, prizeCoins: 10000, endsAt: '2026-10-07T19:30:00.000Z', status: 'active' },
    });
  });

  it('accepts endsAt the same way (compatibility)', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const res = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, messageId: '', prizeCoins: 10000, endsAt: '2026-10-07T19:30:00Z' });
    expect(res.status).toBe(200);
    expect(calls[0].args.p_ends_at).toBe('2026-10-07T19:30:00.000Z');
  });

  it('keeps 19-digit IDs exact when BotGhost sends them as unquoted numbers', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const raw = `{"op":"create","guildId":${GUILD},"channelId":${CHANNEL},"messageId":"","prizeCoins":10000,"giveaway_end":"2026-10-07T19:30:00Z"}`;
    const res = await send(raw, { raw: true });
    expect(res.status).toBe(200);
    expect(calls[0].args.p_guild_id).toBe(GUILD);
    expect(calls[0].args.p_channel_id).toBe(CHANNEL);
    // what JSON.parse alone would have produced (the bug that stored rounded IDs)
    expect(String(JSON.parse(raw).channelId)).toBe('1554894449572581400');
  });

  it('an unreplaced {giveaway_end} (BotGhost test request) uses the default duration instead of crashing', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const res = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, messageId: '', prizeCoins: 10000, giveaway_end: '{giveaway_end}' });
    expect(res.status).toBe(200);
    expect(calls[0].args.p_ends_at).toBeNull();
    expect(res.body.endsAtSource).toBe('default');
  });

  it('no end time and no prize: the database applies the configured 7 days and 10,000 coins', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const res = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL });
    expect(res.status).toBe(200);
    expect(calls[0].args).toMatchObject({ p_prize_coins: null, p_ends_at: null });
    expect(res.body).toMatchObject({ endsAtSource: 'default', prizeSource: 'default' });
  });

  it('an unreplaced ID variable is a clear 400, not a database error', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const res = await send({ op: 'create', guildId: '{guild_id}', channelId: CHANNEL, prizeCoins: 10000 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, operation: 'create', code: 'unresolved_variable', field: 'guildId' });
    expect(typeof res.body.error).toBe('string');
    expect(calls).toHaveLength(0);
  });

  it('an unquoted, unreplaced variable ("guildId": {guild_id}) names the variable instead of "invalid JSON"', async () => {
    const { send } = setup({ discord_create_giveaway: created });
    const res = await send(`{"op":"create","guildId":{guild_id},"channelId":${CHANNEL},"prizeCoins":10000}`, { raw: true });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'unresolved_variable', field: 'guildId', value: '{guild_id}' });
  });

  it('bad values answer 400 with a code', async () => {
    const { send } = setup({ discord_create_giveaway: created });
    expect((await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, giveaway_end: 'next tuesday-ish' })).body).toMatchObject({ code: 'invalid_ends_at' });
    expect((await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, prizeCoins: -5 })).body).toMatchObject({ code: 'invalid_prize' });
    expect((await send({ op: 'create', guildId: '123', channelId: CHANNEL })).body).toMatchObject({ code: 'invalid_discord_id' });
    expect((await send({ op: 'create', channelId: CHANNEL })).body).toMatchObject({ code: 'missing_field', field: 'guildId' });
  });

  it('a second giveaway while one is active: 409 with the active one', async () => {
    const { send } = setup({
      discord_create_giveaway: () => ({ ok: false, error: { status: 400, code: 'P0409', message: 'active_giveaway_exists' } }),
      discord_current_giveaway: () => ({ ok: true, data: { id: ROW.id, guildId: GUILD, channelId: CHANNEL, prizeCoins: 10000, endsAt: ROW.ends_at, status: 'active', entries: 3 } }),
    });
    const res = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, prizeCoins: 10000 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: 'active_giveaway_exists', activeGiveaway: { id: ROW.id, entries: 3 } });
  });

  it('a database range check (end time too close / too far) becomes a 400', async () => {
    const { send } = setup({ discord_create_giveaway: () => ({ ok: false, error: { status: 400, code: 'P0400', message: 'invalid_ends_at' } }) });
    const res = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, endsAt: '2020-01-01T00:00:00Z' });
    expect(res).toEqual({ status: 400, body: expect.objectContaining({ ok: false, code: 'invalid_ends_at' }) });
  });
});

describe('end time and prize formats', () => {
  it('ISO, Unix seconds, milliseconds, digit strings and Discord timestamp tags', () => {
    const iso = '2026-10-07T19:30:00.000Z';
    const secs = Date.parse(iso) / 1000;
    expect(endsAtFrom({ giveaway_end: '2026-10-07T19:30:00Z' })).toBe(iso);
    expect(endsAtFrom({ endsAt: secs })).toBe(iso);
    expect(endsAtFrom({ endsAt: secs * 1000 })).toBe(iso);
    expect(endsAtFrom({ giveaway_end: String(secs) })).toBe(iso);
    expect(endsAtFrom({ giveaway_end: String(secs * 1000) })).toBe(iso);
    expect(endsAtFrom({ giveaway_end: `<t:${secs}:R>` })).toBe(iso);
    expect(endsAtFrom({ ends_at: '2026-10-07 19:30:00+00' })).toBe(iso);
    expect(endsAtFrom({ giveaway_end: '' })).toBeNull();
    expect(endsAtFrom({ giveaway_end: '{giveaway_end}' })).toBeNull();
    expect(endsAtFrom({})).toBeNull();
  });

  it('prizes as numbers or digit strings', () => {
    expect(prizeFrom({ prizeCoins: 10000 })).toBe(10000);
    expect(prizeFrom({ prizeCoins: '10000' })).toBe(10000);
    expect(prizeFrom({ prizeCoins: '10,000' })).toBe(10000);
    expect(prizeFrom({ prizeCoins: '{prize}' })).toBeNull();
    expect(prizeFrom({})).toBeNull();
  });

  it('parses bodies with exact IDs and refuses non-objects', () => {
    expect(parseBody(`{"discordUserId": 1234567890123456789, "n": 5}`)).toEqual({ discordUserId: '1234567890123456789', n: 5 });
    expect(parseBody('')).toEqual({});
    expect(() => parseBody('[1]')).toThrow();
    expect(giveawayView(null)).toBeNull();
  });
});

describe('the bot secret', () => {
  it('is required for every bot operation; the value is never echoed', async () => {
    const { send, calls } = setup({ discord_create_giveaway: created });
    const missing = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL }, { secret: null });
    expect(missing).toEqual({ status: 401, body: expect.objectContaining({ ok: false, code: 'missing_secret' }) });
    const wrong = await send({ op: 'create', guildId: GUILD, channelId: CHANNEL }, { secret: 'wrong-secret-wrong-secret-wrong' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('forbidden');
    expect(JSON.stringify([missing.body, wrong.body])).not.toContain(SECRET);
    expect(calls).toHaveLength(0);
  });

  it('a server without the secret configured answers 503, never lets the request through', async () => {
    const { send } = setup({}, { botSecretHash: async () => null });
    const res = await send({ op: 'draw' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('bot_not_configured');
  });
});

describe('never an unhandled crash', () => {
  it('invalid JSON, wrong method, unknown operation: JSON errors', async () => {
    const { send } = setup();
    expect((await send('{not json', { raw: true })).body).toMatchObject({ ok: false, code: 'bad_request' });
    expect((await send('', { method: 'PUT', raw: true })).status).toBe(405);
    expect((await send({ op: 'nope' })).body).toMatchObject({ ok: false, code: 'unknown_operation' });
  });

  it('GET is a health check', async () => {
    const { send } = setup();
    expect(await send('', { method: 'GET', raw: true })).toEqual({ status: 200, body: { ok: true, operation: 'health', service: 'discord-giveaway', status: 'healthy' } });
  });

  it('database down -> 503; unknown database error -> 500 JSON; a throwing dependency -> 500 JSON', async () => {
    const down = setup({ discord_draw_giveaway: () => ({ ok: false, error: { status: 0, code: 'network', message: 'network' } }) });
    expect((await down.send({ op: 'draw' })).body).toMatchObject({ ok: false, code: 'database_unreachable' });
    const weird = setup({ discord_draw_giveaway: () => ({ ok: false, error: { status: 500, code: 'XX000', message: 'boom' } }) });
    const res = await weird.send({ op: 'draw' });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, code: 'database_error', operation: 'draw' });
    const thrower = setup({ discord_draw_giveaway: () => Promise.reject(new Error('socket hang up')) });
    const res2 = await thrower.send({ op: 'draw' });
    expect(res2).toEqual({ status: 500, body: expect.objectContaining({ ok: false, code: 'server' }) });
    expect(thrower.logs[0]).toContain('socket hang up');
  });
});

describe('the other operations keep working', () => {
  it('link_code needs a registered player (no bot secret)', async () => {
    const anon = setup();
    expect((await anon.send({ op: 'link_code' }, { secret: null })).status).toBe(401);
    const user = setup({ discord_issue_link_code: () => ({ ok: true, data: 'AB12CD34' }) }, { verifyUser: async () => ({ id: 'u1', registered: true }) });
    expect((await user.send({ op: 'link_code' }, { secret: null, auth: 'Bearer x' })).body).toEqual({ ok: true, operation: 'link_code', code: 'AB12CD34' });
    expect(user.calls[0]).toEqual({ name: 'discord_issue_link_code', args: { p_user: 'u1' } });
  });

  it('link: consumes a code for a Discord user', async () => {
    const { send, calls } = setup({ discord_consume_link_code: () => ({ ok: true, data: [{ ok: true, user_id: 'u1', reason: null }] }) });
    const res = await send({ op: 'link', discordUserId: '111111111111111111', code: 'ab12cd34' });
    expect(res.body).toMatchObject({ ok: true, operation: 'link', user_id: 'u1' });
    expect(calls[0].args).toEqual({ p_code: 'ab12cd34', p_discord_user_id: '111111111111111111' });
  });

  it('enter: the active giveaway by default, by id or by message; unlinked users get a clear 409', async () => {
    const { send, calls } = setup({
      discord_current_giveaway: () => ({ ok: true, data: { id: ROW.id, status: 'active' } }),
      discord_enter_giveaway: () => ({ ok: true, data: [{ ok: false, reason: 'discord_not_linked', user_id: null, entries: 0 }] }),
      discord_enter_giveaway_by_message: () => ({ ok: true, data: [{ ok: true, reason: 'entered', giveaway_id: ROW.id }] }),
    });
    const res = await send({ op: 'enter', discordUserId: '222222222222222222' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: 'discord_not_linked', giveawayId: ROW.id });
    expect(String(res.body.message)).toContain('vinculada');
    expect(calls.map((c) => c.name)).toEqual(['discord_current_giveaway', 'discord_enter_giveaway']);
    const byMessage = await send({ op: 'enter', messageId: '1555000000000000001', discordUserId: '222222222222222222' });
    expect(byMessage.body).toMatchObject({ ok: true, operation: 'enter', giveaway_id: ROW.id });
  });

  it('alwaysOk: refusals answer 200 (BotGhost fills its variables only on 2xx), credentials and server errors do not', async () => {
    let linked = false;
    const { send } = setup({
      discord_current_giveaway: () => ({ ok: true, data: { id: ROW.id, status: 'active' } }),
      discord_enter_giveaway: () => ({
        ok: true,
        data: [linked ? { ok: true, reason: null, user_id: 'u1', entries: 1 } : { ok: false, reason: 'discord_not_linked', user_id: null, entries: 0 }],
      }),
      discord_create_giveaway: () => ({ ok: false, error: { status: 409, code: 'P0409', message: 'active_giveaway_exists' } }),
    });
    const refused = await send({ op: 'enter', discordUserId: '222222222222222222', alwaysOk: true });
    expect(refused.status).toBe(200);
    expect(refused.body).toMatchObject({ ok: false, code: 'discord_not_linked', httpStatus: 409 });
    expect(String(refused.body.message)).toContain('vinculada');
    linked = true;
    const entered = await send({ op: 'enter', discordUserId: '222222222222222222', alwaysOk: true });
    expect(entered).toEqual({ status: 200, body: expect.objectContaining({ ok: true, entries: 1, message: expect.stringContaining('participando') }) });
    expect(entered.body).not.toHaveProperty('httpStatus');
    expect((await send({ op: 'create', guildId: GUILD, channelId: CHANNEL, alwaysOk: 'true' })).body).toMatchObject({ ok: false, code: 'active_giveaway_exists', httpStatus: 409 });
    expect((await send({ op: 'enter', discordUserId: '{user_id}', alwaysOk: true })).body).toMatchObject({ code: 'unresolved_variable', httpStatus: 400 });
    // The secret stays mandatory and visible as such.
    expect((await send({ op: 'enter', discordUserId: '222222222222222222', alwaysOk: true }, { secret: null })).status).toBe(401);
    expect((await send({ op: 'enter', discordUserId: '222222222222222222', alwaysOk: true }, { secret: 'wrong-secret-wrong-secret-wrong' })).status).toBe(403);
    // Without the flag nothing changes.
    linked = false;
    expect((await send({ op: 'enter', discordUserId: '222222222222222222' })).status).toBe(409);
  });

  it('entries, status/current, award, message, announced', async () => {
    const { send } = setup({
      discord_current_giveaway: () => ({ ok: true, data: { id: ROW.id, guildId: GUILD, channelId: CHANNEL, prizeCoins: 10000, status: 'active', entries: 2 } }),
      discord_list_entries: () => ({ ok: true, data: [{ discord_user_id: '111111111111111111' }, { discord_user_id: '222222222222222222' }] }),
      discord_is_linked: () => ({ ok: true, data: true }),
      discord_award_giveaway: () => ({ ok: true, data: [{ ok: true, reason: 'awarded', user_id: 'u1', amount: 10000, balance: 10500 }] }),
      discord_set_giveaway_message: () => ({ ok: true, data: { ...ROW, message_id: '1555000000000000001' } }),
      discord_mark_announced: () => ({ ok: true, data: true }),
    });
    expect((await send({ op: 'entries' })).body).toMatchObject({ ok: true, count: 2, entries: ['111111111111111111', '222222222222222222'] });
    expect((await send({ op: 'status', discordUserId: '111111111111111111' })).body).toMatchObject({ ok: true, linked: true, giveaway: { id: ROW.id, entries: 2 } });
    expect((await send({ op: 'award', giveawayId: ROW.id, discordUserId: '111111111111111111' })).body).toMatchObject({ ok: true, amount: 10000 });
    expect((await send({ op: 'message', messageId: '1555000000000000001' })).body).toMatchObject({ ok: true, giveaway: { messageId: '1555000000000000001' } });
    expect((await send({ op: 'announced', giveawayId: ROW.id })).body).toMatchObject({ ok: true });
  });

  it('draw: a winner (200), no entries (409), already awarded (200, nothing paid twice)', async () => {
    const results = [
      [{ ok: true, reason: 'awarded', winner_discord_user_id: '111111111111111111', amount: 10000, balance: 10000, giveaway_id: ROW.id }],
      [{ ok: false, reason: 'no_entries', giveaway_id: ROW.id, amount: 0 }],
      [{ ok: true, reason: 'already_awarded', winner_discord_user_id: '111111111111111111', amount: 10000, giveaway_id: ROW.id }],
    ];
    const { send } = setup({ discord_draw_giveaway: () => ({ ok: true, data: results.shift() }) });
    expect((await send({ op: 'draw' })).body).toMatchObject({ ok: true, reason: 'awarded', amount: 10000 });
    const empty = await send({ op: 'draw' });
    expect(empty.status).toBe(409);
    expect(empty.body).toMatchObject({ ok: false, code: 'no_entries' });
    expect((await send({ op: 'draw', giveawayId: ROW.id })).body).toMatchObject({ ok: true, reason: 'already_awarded' });
  });

  it('tick: draws, opens the next giveaway and lists what to announce', async () => {
    const { send } = setup({
      discord_giveaway_tick: () => ({
        ok: true,
        data: { drawn: [{ giveawayId: ROW.id, ok: true, reason: 'awarded', winnerDiscordUserId: '111111111111111111', amount: 10000 }], created: { id: 'next', guildId: GUILD, channelId: CHANNEL, prizeCoins: 10000, status: 'active' }, active: { id: 'next', status: 'active' } },
      }),
      discord_pending_announcements: () => ({ ok: true, data: { results: [{ id: ROW.id, status: 'awarded' }], unposted: [{ id: 'next' }] } }),
    });
    const res = await send({ op: 'tick' });
    expect(res.body).toMatchObject({ ok: true, operation: 'tick', created: { id: 'next', channelId: CHANNEL }, pending: { results: [{ id: ROW.id }], unposted: [{ id: 'next' }] } });
  });
});

describe('the permanent panel', () => {
  it('panel stores the panel message (exact ids, secret required)', async () => {
    const { send, calls } = setup({ discord_set_panel: (args) => ({ ok: true, data: { channelId: args.p_channel_id, messageId: args.p_message_id } }) });
    const res = await send({ op: 'panel', channelId: CHANNEL, messageId: '1555000000000000777', alwaysOk: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, panel: { channelId: CHANNEL, messageId: '1555000000000000777' } });
    expect(calls[0]).toEqual({ name: 'discord_set_panel', args: { p_channel_id: CHANNEL, p_message_id: '1555000000000000777' } });
    expect((await send({ op: 'panel', channelId: CHANNEL, messageId: '{message_id}', alwaysOk: true })).body).toMatchObject({ code: 'unresolved_variable' });
    expect((await send({ op: 'panel', channelId: CHANNEL, messageId: '1555000000000000777' }, { secret: null })).status).toBe(401);
  });

  it('cycle: a winner to announce, the new giveaway and the panel, flat for BotGhost', async () => {
    const { send } = setup({
      discord_giveaway_cycle: () => ({
        ok: true,
        data: {
          result: { ...ROW, status: 'awarded', winnerDiscordUserId: '111111111111111111', prizeCoins: 10000 },
          active: { id: 'b0000000-0000-4000-8000-000000000002', prizeCoins: 10000, startsAt: '2026-10-07T19:30:00+00:00', endsAt: '2026-10-14T19:30:00+00:00', status: 'active', entries: 0 },
          panel: { channelId: CHANNEL, messageId: '1555000000000000777' },
        },
      }),
    });
    const res = await send({ op: 'cycle', alwaysOk: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      operation: 'cycle',
      hasResult: true,
      hasWinner: true,
      winnerMention: '<@111111111111111111>',
      resultPrizeCoins: 10000,
      hasActive: true,
      prizeText: '10,000',
      entries: 0,
      startsAtUnix: 1791401400,
      endsAtUnix: 1792006200,
      hasPanel: true,
      panelChannelId: CHANNEL,
      panelMessageId: '1555000000000000777',
    });
    expect(String(res.body.announcement)).toContain('<@111111111111111111>');
    expect(String(res.body.announcement)).toContain('10,000');
    expect(String(res.body.dmText)).toContain('10,000');
  });

  it('cycle with nothing to announce, a giveaway without winner, no panel yet', () => {
    expect(cycleView({ result: null, active: null, panel: {} })).toMatchObject({ hasResult: false, hasWinner: false, announcement: '', hasActive: false, hasPanel: false, endsAtUnix: 0 });
    const empty = cycleView({ result: { ...ROW, status: 'ended', winnerDiscordUserId: null }, active: null, panel: { channelId: null, messageId: null } });
    expect(empty).toMatchObject({ hasResult: true, hasWinner: false, winnerMention: '', dmText: '', hasPanel: false });
    expect(String(empty.announcement)).toContain('sin participantes');
  });

  it('giveawayView gives Unix seconds for Discord timestamps', () => {
    expect(giveawayView(ROW)).toMatchObject({ startsAtUnix: 1790812800, endsAtUnix: 1791401400 });
  });
});
