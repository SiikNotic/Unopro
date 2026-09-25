// Account deletion, as a pure handler (the `account` edge function wraps it). The user comes from the
// verified token, never from the body; the body must explicitly confirm. The database refuses the owner.
export interface DeleteDeps {
  /** account_delete_prepare: records the deletion; throws 'owner_protected' / 'no_such_user'. */
  prepare(userId: string): Promise<void>;
  /** Auth admin API: deletes the user (cascades to their data). */
  deleteUser(userId: string): Promise<void>;
}

export interface DeleteRequest {
  method: string;
  user: { id: string } | null;
  body: unknown;
}

export async function handleDeleteRequest(req: DeleteRequest, deps: DeleteDeps): Promise<{ status: number; body: { ok: boolean; code?: string } }> {
  if (req.method !== 'POST') return { status: 405, body: { ok: false, code: 'bad_request' } };
  if (!req.user) return { status: 401, body: { ok: false, code: 'unauthorized' } };
  const b = (req.body ?? {}) as { op?: unknown; confirm?: unknown };
  if (b.op !== 'delete' || b.confirm !== true) return { status: 400, body: { ok: false, code: 'bad_request' } };
  try {
    await deps.prepare(req.user.id);
  } catch (e) {
    const code = e instanceof Error ? e.message : 'server';
    if (code === 'owner_protected') return { status: 403, body: { ok: false, code } };
    if (code === 'no_such_user') return { status: 404, body: { ok: false, code } };
    return { status: 500, body: { ok: false, code: 'server' } };
  }
  await deps.deleteUser(req.user.id);
  return { status: 200, body: { ok: true } };
}
