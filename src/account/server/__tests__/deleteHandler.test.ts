import { describe, expect, it, vi } from 'vitest';
import { handleDeleteRequest } from '../deleteHandler';

const deps = (prepareError?: string) => ({
  prepare: vi.fn(async () => {
    if (prepareError) throw new Error(prepareError);
  }),
  deleteUser: vi.fn(async () => {}),
});

describe('account deletion', () => {
  it('deletes the verified user only after an explicit confirmation', async () => {
    const d = deps();
    expect(await handleDeleteRequest({ method: 'POST', user: { id: 'u1' }, body: { op: 'delete', confirm: true } }, d)).toEqual({ status: 200, body: { ok: true } });
    expect(d.prepare).toHaveBeenCalledWith('u1');
    expect(d.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('refuses without a verified user, without confirmation, or with another method', async () => {
    for (const req of [
      { method: 'POST', user: null, body: { op: 'delete', confirm: true } },
      { method: 'POST', user: { id: 'u1' }, body: { op: 'delete' } },
      { method: 'POST', user: { id: 'u1' }, body: { op: 'delete', confirm: 'yes' } },
      { method: 'GET', user: { id: 'u1' }, body: null },
    ]) {
      const d = deps();
      const r = await handleDeleteRequest(req, d);
      expect(r.body.ok).toBe(false);
      expect(d.deleteUser).not.toHaveBeenCalled();
    }
  });

  it('never deletes the owner (the database refuses)', async () => {
    const d = deps('owner_protected');
    expect(await handleDeleteRequest({ method: 'POST', user: { id: 'owner' }, body: { op: 'delete', confirm: true } }, d)).toEqual({ status: 403, body: { ok: false, code: 'owner_protected' } });
    expect(d.deleteUser).not.toHaveBeenCalled();
  });
});
