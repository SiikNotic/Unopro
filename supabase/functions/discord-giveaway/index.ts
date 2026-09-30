import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED = new Set([
  "https://siiknotic.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
]);

const adminHeaders = {
  apikey: SERVICE_KEY,
  authorization: "Bearer " + SERVICE_KEY,
  "content-type": "application/json",
};

function cors(origin: string) {
  return {
    "access-control-allow-origin": ALLOWED.has(origin) ? origin : "https://siiknotic.github.io",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-botghost-secret",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "origin",
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifiedUser(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: ANON_KEY, authorization: auth },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  if (typeof u?.id !== "string") return null;
  return {
    id: u.id as string,
    registered: u.is_anonymous !== true && typeof u.email_confirmed_at === "string",
  };
}

async function botSecretValid(req: Request) {
  const supplied = req.headers.get("x-botghost-secret") ?? "";
  if (supplied.length < 20 || supplied.length > 200) return false;
  const stored = await fetch(
    SUPABASE_URL + "/rest/v1/discord_bot_config?select=secret_hash&id=eq.true&limit=1",
    { headers: adminHeaders },
  );
  if (!stored.ok) return false;
  const rows = await stored.json().catch(() => []);
  const expected = rows?.[0]?.secret_hash;
  if (typeof expected !== "string") return false;
  const actual = await sha256Hex(supplied);
  return actual === expected;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const message = typeof body === "object" && body && "message" in body ? String((body as Record<string, unknown>).message) : "rpc_error";
    throw new Error(message);
  }
  return body;
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = { ...cors(origin), "cache-control": "no-store" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  let body: Record<string, unknown> | null = null;
  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > 8192) return Response.json({ ok: false, code: "bad_request" }, { status: 413, headers });
    try { body = text ? JSON.parse(text) : null; } catch {
      return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
    }
  }

  try {
    const op = body?.op;

    if (op === "link_code") {
      const user = await verifiedUser(req);
      if (!user?.registered) return Response.json({ ok: false, code: "unauthorized" }, { status: 401, headers });
      const code = await rpc("discord_issue_link_code", { p_user: user.id });
      return Response.json({ ok: true, code }, { status: 200, headers });
    }

    if (!(await botSecretValid(req))) {
      return Response.json({ ok: false, code: "forbidden" }, { status: 403, headers });
    }

    if (op === "link") {
      const discordUserId = String(body?.discordUserId ?? "").trim();
      const code = String(body?.code ?? "").trim();
      if (!discordUserId || !code) return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
      const result = firstRow(await rpc("discord_consume_link_code", {
        p_code: code,
        p_discord_user_id: discordUserId,
      }));
      return Response.json({ ok: result?.ok === true, ...result }, { status: result?.ok ? 200 : 409, headers });
    }

    if (op === "create") {
      const guildId = String(body?.guildId ?? "").trim();
      const channelId = String(body?.channelId ?? "").trim();
      const messageId = String(body?.messageId ?? "").trim();
      const prizeCoins = Number(body?.prizeCoins);
      const rawEndsAt = body?.endsAt;
      const endsAt = typeof rawEndsAt === "number" && Number.isFinite(rawEndsAt)
        ? new Date(rawEndsAt * 1000).toISOString()
        : String(rawEndsAt ?? "");
      if (!guildId || !channelId || !Number.isSafeInteger(prizeCoins) || prizeCoins <= 0 || !endsAt) {
        return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
      }
      const row = firstRow(await rpc("discord_create_giveaway", {
        p_guild_id: guildId,
        p_channel_id: channelId,
        p_message_id: messageId || null,
        p_prize_coins: prizeCoins,
        p_ends_at: endsAt,
      }));
      return Response.json({ ok: true, giveaway: row }, { status: 200, headers });
    }

    if (op === "enter") {
      const giveawayId = String(body?.giveawayId ?? "").trim();
      const discordUserId = String(body?.discordUserId ?? "").trim();
      if (!giveawayId || !discordUserId) return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
      const result = firstRow(await rpc("discord_enter_giveaway", {
        p_giveaway_id: giveawayId,
        p_discord_user_id: discordUserId,
      }));
      return Response.json({ ok: result?.ok === true, ...result }, { status: result?.ok ? 200 : 409, headers });
    }

    if (op === "entries") {
      const giveawayId = String(body?.giveawayId ?? "").trim();
      if (!giveawayId) return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
      const result = await rpc("discord_list_entries", { p_giveaway_id: giveawayId });
      return Response.json({ ok: true, entries: Array.isArray(result) ? result.map((x) => x.discord_user_id) : [] }, { status: 200, headers });
    }

    if (op === "draw") {
      const giveawayId = String(body?.giveawayId ?? "").trim();
      const result = firstRow(await rpc("discord_draw_giveaway", {
        p_giveaway_id: giveawayId || null,
      }));
      return Response.json({ ok: result?.ok === true, ...result }, { status: result?.ok ? 200 : 409, headers });
    }

    if (op === "award") {
      const giveawayId = String(body?.giveawayId ?? "").trim();
      const discordUserId = String(body?.discordUserId ?? "").trim();
      if (!giveawayId || !discordUserId) return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
      const result = firstRow(await rpc("discord_award_giveaway", {
        p_giveaway_id: giveawayId,
        p_discord_user_id: discordUserId,
      }));
      return Response.json({ ok: result?.ok === true, ...result }, { status: result?.ok ? 200 : 409, headers });
    }

    if (op === "status") {
      const giveawayId = String(body?.giveawayId ?? "").trim();
      const discordUserId = String(body?.discordUserId ?? "").trim();
      if (!giveawayId) return Response.json({ ok: false, code: "bad_request" }, { status: 400, headers });
      const q = new URLSearchParams({ select: "*", id: "eq." + giveawayId, limit: "1" });
      const res = await fetch(SUPABASE_URL + "/rest/v1/discord_giveaways?" + q.toString(), { headers: adminHeaders });
      if (!res.ok) throw new Error("status_error");
      const row = (await res.json())?.[0] ?? null;
      if (!row) return Response.json({ ok: false, code: "giveaway_not_found" }, { status: 404, headers });
      let linked = false;
      if (discordUserId) {
        const linkRes = await fetch(
          SUPABASE_URL + "/rest/v1/discord_account_links?select=user_id&discord_user_id=eq." + encodeURIComponent(discordUserId) + "&limit=1",
          { headers: adminHeaders },
        );
        linked = linkRes.ok && (await linkRes.json())?.length > 0;
      }
      return Response.json({ ok: true, giveaway: row, linked }, { status: 200, headers });
    }

    return Response.json({ ok: false, code: "unknown_operation" }, { status: 400, headers });
  } catch (e) {
    console.error("discord-giveaway", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, code: e instanceof Error ? e.message : "server" }, { status: 500, headers });
  }
});
