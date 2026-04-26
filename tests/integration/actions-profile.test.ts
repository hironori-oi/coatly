/**
 * Profile Server Action 統合テスト
 *
 * 検証観点:
 *  - 未ログイン → unauthorized
 *  - 空名前 → validation
 *  - 80 文字超 → validation
 *  - 正常系 → ok + DB 反映
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).__TEST_PROFILE_DB__;
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockGetSession = vi.fn<() => Promise<{ user?: { id: string } } | null>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
    },
  },
}));

const USER_A = 'user_profile_a';

let realClient: Client;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  const realDb = drizzle(realClient, { schema });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__TEST_PROFILE_DB__ = realDb;

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

  await realDb.insert(schema.users).values({
    id: USER_A,
    email: 'a@profile.test',
    name: 'Original Name',
    isActive: true,
  });
});

afterAll(() => {
  realClient?.close();
});

describe('updateProfile', () => {
  it('returns unauthorized when not logged in', async () => {
    mockGetSession.mockResolvedValue(null);
    const { updateProfile } = await import('@/lib/actions/profile');
    const r = await updateProfile({ name: 'New Name' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('unauthorized');
    }
  });

  it('rejects empty name as validation error', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_A } });
    const { updateProfile } = await import('@/lib/actions/profile');
    const r = await updateProfile({ name: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('validation');
    }
  });

  it('rejects whitespace-only name', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_A } });
    const { updateProfile } = await import('@/lib/actions/profile');
    const r = await updateProfile({ name: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('validation');
    }
  });

  it('rejects > 80 chars name', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_A } });
    const { updateProfile } = await import('@/lib/actions/profile');
    const r = await updateProfile({ name: 'x'.repeat(81) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('validation');
    }
  });

  it('updates name and persists to DB', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_A } });
    const { updateProfile } = await import('@/lib/actions/profile');
    const r = await updateProfile({ name: 'Updated Name' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.id).toBe(USER_A);
    }

    // DB から再取得して反映確認
    const realDb = drizzle(realClient, { schema });
    const rows = await realDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_A))
      .limit(1);
    expect(rows[0]?.name).toBe('Updated Name');
  });

  it('trims name before saving', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_A } });
    const { updateProfile } = await import('@/lib/actions/profile');
    const r = await updateProfile({ name: '  Trimmed  ' });
    expect(r.ok).toBe(true);

    const realDb = drizzle(realClient, { schema });
    const rows = await realDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_A))
      .limit(1);
    expect(rows[0]?.name).toBe('Trimmed');
  });
});
