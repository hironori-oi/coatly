/**
 * Auth session 周辺 統合テスト（W3-A 仕上げ拡充）
 *
 * 検証観点（2 cases）:
 *  - session が無いとき requireUser は AuthError(401) を投げる（cookie なし相当）
 *  - is_active=false の user に対しては getSession が user 返しても requireUser が 401 で弾く
 *    （= soft delete / 退会済み user のセッション無効化挙動）
 *
 * 注: better-auth 本体の cookieCache や session expiry は plugin 側 contract に依存するため、
 *      本 test では guards.ts 側の振る舞いを通じて間接検証する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {

    return (globalThis as any).__TEST_AUTHSESS_DB__;
  },
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    has: () => false,
    getAll: () => [],
  }),
}));

const mockGetSession = vi.fn<() => Promise<{ user?: { id: string } } | null>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
    },
  },
}));

const USER_ACTIVE = 'user_active_se';
const USER_INACTIVE = 'user_inactive_se';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });

  (globalThis as any).__TEST_AUTHSESS_DB__ = realDb;

  await realClient.executeMultiple(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email_verified INTEGER NOT NULL DEFAULT 1,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      ban_expires INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await realDb.insert(schema.users).values([
    { id: USER_ACTIVE, email: 'active@se.test', name: 'A', isActive: true },
    {
      id: USER_INACTIVE,
      email: 'inactive@se.test',
      name: 'I',
      isActive: false,
      deletedAt: new Date('2026-04-01'),
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('auth session: 未認証時の挙動', () => {
  it('requireUser throws AuthError(401) when session is null', async () => {
    mockGetSession.mockResolvedValue(null);
    const { requireUser } = await import('@/lib/auth/guards');
    let thrown: { name: string; status?: number } | null = null;
    try {
      await requireUser();
    } catch (e) {
      thrown = e as { name: string; status?: number };
    }
    expect(thrown).not.toBeNull();
    expect(thrown?.name).toMatch(/AuthError/);
    expect(thrown?.status).toBe(401);
  });
});

describe('auth session: 退会済み user (is_active=false)', () => {
  it('requireUser rejects inactive user even if session exists (cookie cache invalidation)', async () => {
    // session は残っているが、user.is_active=false
    mockGetSession.mockResolvedValue({ user: { id: USER_INACTIVE } });
    const { requireUser } = await import('@/lib/auth/guards');
    let thrown: { name: string; status?: number } | null = null;
    try {
      await requireUser();
    } catch (e) {
      thrown = e as { name: string; status?: number };
    }
    expect(thrown).not.toBeNull();
    expect(thrown?.name).toMatch(/AuthError/);
    expect(thrown?.status).toBe(401);

    // active user の場合は通る（対比の sanity check）
    mockGetSession.mockResolvedValue({ user: { id: USER_ACTIVE } });
    const u = await requireUser();
    expect(u.id).toBe(USER_ACTIVE);
    expect(u.isActive).toBe(true);
  });
});
