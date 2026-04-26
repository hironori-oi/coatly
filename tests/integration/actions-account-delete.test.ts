/**
 * deleteAccount Server Action 統合テスト
 *
 * 検証観点:
 *  - 未ログイン → unauthorized
 *  - confirmEmail 不一致 → validation
 *  - 唯一の owner として残る org がある → validation で拒否
 *  - 複数 owner がいる org の owner であれば削除成功
 *  - 削除後は users.deletedAt が設定され isActive=false
 *  - auth_sessions が当該 user 分削除されていること
 *  - getSoleOwnerOrgs が正しく blocking org を列挙する
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {
    return (globalThis as unknown as { __TEST_ACCT_DEL_DB__: unknown })
      .__TEST_ACCT_DEL_DB__;
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
const mockSignOut = vi.fn<() => Promise<void>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
      signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
    },
  },
}));

const ORG_SOLO = 'org_solo_acct_del';
const ORG_DUAL = 'org_dual_acct_del';
const USER_LONE_OWNER = 'user_lone_owner_acct'; // ORG_SOLO で唯一の owner
const USER_DUAL_OWNER_A = 'user_dualA_acct'; // ORG_DUAL の owner（A）
const USER_DUAL_OWNER_B = 'user_dualB_acct'; // ORG_DUAL の owner（B）
const USER_NO_ORG = 'user_no_org_acct'; // どの組織にも属さない

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });
  (globalThis as unknown as { __TEST_ACCT_DEL_DB__: unknown }).__TEST_ACCT_DEL_DB__ =
    realDb;

  await realClient.executeMultiple(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      metadata TEXT,
      fiscal_year_start_month INTEGER NOT NULL DEFAULT 4,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
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
    CREATE TABLE memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      role TEXT NOT NULL,
      home_group_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      token TEXT NOT NULL,
      active_organization_id TEXT,
      impersonated_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT,
      actor_id TEXT,
      entity TEXT NOT NULL,
      entity_id TEXT,
      action TEXT NOT NULL,
      diff TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await realDb.insert(schema.organizations).values([
    {
      id: ORG_SOLO,
      slug: 'org-solo',
      kind: 'tennis_club',
      name: 'Solo',
      fiscalYearStartMonth: 4,
    },
    {
      id: ORG_DUAL,
      slug: 'org-dual',
      kind: 'tennis_club',
      name: 'Dual',
      fiscalYearStartMonth: 4,
    },
  ]);

  await realDb.insert(schema.users).values([
    {
      id: USER_LONE_OWNER,
      email: 'lone@acct.test',
      name: 'Lone',
      isActive: true,
    },
    {
      id: USER_DUAL_OWNER_A,
      email: 'dual_a@acct.test',
      name: 'DualA',
      isActive: true,
    },
    {
      id: USER_DUAL_OWNER_B,
      email: 'dual_b@acct.test',
      name: 'DualB',
      isActive: true,
    },
    {
      id: USER_NO_ORG,
      email: 'noorg@acct.test',
      name: 'NoOrg',
      isActive: true,
    },
  ]);

  await realDb.insert(schema.memberships).values([
    {
      id: ulid(),
      userId: USER_LONE_OWNER,
      organizationId: ORG_SOLO,
      role: 'owner',
    },
    {
      id: ulid(),
      userId: USER_DUAL_OWNER_A,
      organizationId: ORG_DUAL,
      role: 'owner',
    },
    {
      id: ulid(),
      userId: USER_DUAL_OWNER_B,
      organizationId: ORG_DUAL,
      role: 'owner',
    },
  ]);

  // 各 user のダミーセッション
  const now = new Date();
  const future = new Date(Date.now() + 60 * 60 * 1000);
  await realDb.insert(schema.authSessions).values([
    {
      id: 'sess_lone',
      userId: USER_LONE_OWNER,
      expiresAt: future,
      token: 'tok_lone',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sess_dual_a_1',
      userId: USER_DUAL_OWNER_A,
      expiresAt: future,
      token: 'tok_dual_a_1',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sess_dual_a_2',
      userId: USER_DUAL_OWNER_A,
      expiresAt: future,
      token: 'tok_dual_a_2',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'sess_no_org',
      userId: USER_NO_ORG,
      expiresAt: future,
      token: 'tok_noorg',
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('getAccountDeletePreflight', () => {
  it('returns unauthorized when not logged in', async () => {
    mockGetSession.mockResolvedValue(null);
    const { getAccountDeletePreflight } = await import(
      '@/lib/actions/account-delete'
    );
    const r = await getAccountDeletePreflight();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unauthorized');
  });

  it('returns blocking org for sole owner', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_LONE_OWNER } });
    const { getAccountDeletePreflight } = await import(
      '@/lib/actions/account-delete'
    );
    const r = await getAccountDeletePreflight();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.email).toBe('lone@acct.test');
      expect(r.blockingSoleOwnerOrgIds).toEqual([ORG_SOLO]);
    }
  });

  it('returns no blocking when user is one of multiple owners', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_DUAL_OWNER_A } });
    const { getAccountDeletePreflight } = await import(
      '@/lib/actions/account-delete'
    );
    const r = await getAccountDeletePreflight();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.blockingSoleOwnerOrgIds).toEqual([]);
  });
});

describe('deleteAccount', () => {
  it('rejects when confirmEmail does not match logged-in email', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_NO_ORG } });
    const { deleteAccount } = await import('@/lib/actions/account-delete');
    const r = await deleteAccount({ confirmEmail: 'WRONG@acct.test' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('rejects when user is sole owner of any org', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_LONE_OWNER } });
    const { deleteAccount } = await import('@/lib/actions/account-delete');
    const r = await deleteAccount({ confirmEmail: 'lone@acct.test' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');

    // soft-delete されていない（deletedAt が null のまま）
    const u = await realDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_LONE_OWNER));
    expect(u[0].deletedAt).toBeNull();
    expect(u[0].isActive).toBe(true);
  });

  it('soft-deletes the user and revokes sessions on happy path (multi-owner org)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_DUAL_OWNER_A } });
    mockSignOut.mockResolvedValue(undefined);

    const { deleteAccount } = await import('@/lib/actions/account-delete');
    const r = await deleteAccount({ confirmEmail: 'dual_a@acct.test' });
    expect(r.ok).toBe(true);

    // user soft-deleted
    const u = await realDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_DUAL_OWNER_A));
    expect(u[0].deletedAt).not.toBeNull();
    expect(u[0].isActive).toBe(false);

    // sessions revoked
    const sessions = await realDb
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, USER_DUAL_OWNER_A));
    expect(sessions.length).toBe(0);

    // 他ユーザの session は残っていること
    const others = await realDb
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, USER_NO_ORG));
    expect(others.length).toBe(1);

    // audit log
    const audits = await realDb
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entity, 'user'));
    expect(audits.find((a) => a.actorId === USER_DUAL_OWNER_A)).toBeDefined();

    // signOut が呼ばれた
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('also works for users with no org membership', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_NO_ORG } });
    mockSignOut.mockResolvedValue(undefined);

    const { deleteAccount } = await import('@/lib/actions/account-delete');
    const r = await deleteAccount({ confirmEmail: 'noorg@acct.test' });
    expect(r.ok).toBe(true);

    const u = await realDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_NO_ORG));
    expect(u[0].deletedAt).not.toBeNull();
  });

  it('blocks login on next requireUser call (isActive=false)', async () => {
    // requireUser は isActive=false のユーザを unauthorized にする
    // この時点で USER_DUAL_OWNER_A は soft-delete 済み
    mockGetSession.mockResolvedValue({ user: { id: USER_DUAL_OWNER_A } });
    const { deleteAccount } = await import('@/lib/actions/account-delete');
    // 2 度目の呼び出しは requireUser で unauthorized になる
    const r = await deleteAccount({ confirmEmail: 'dual_a@acct.test' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unauthorized');
  });
});
