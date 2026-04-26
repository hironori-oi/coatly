/**
 * middleware-guards 統合テスト
 *
 * 検証観点（DEC-042 の middleware ガード設計）:
 *  1. getMiddlewareSession: session 取得 / null フォールバック
 *  2. getOrgRole: 組織 slug → role 解決 / 別組織 / membership なし
 *  3. checkExpenseAccess:
 *     - org slug 不一致 → not-found
 *     - expense 別組織 → not-found
 *     - 組織 member ですらない → forbidden
 *     - owner 本人 / org admin → allowed
 *     - group member の read → allowed / forbidden
 *     - group manager の write → allowed / member の write → forbidden
 *
 * 実装方針: auth-guards.test.ts と同じ in-memory libsql + vi.mock パターン。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {
     
    return (globalThis as any).__TEST_MW_DB__;
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

const ORG_A = 'org_a_mw';
const ORG_B = 'org_b_mw';
const GROUP_A1 = 'grp_a1_mw';
const GROUP_A2 = 'grp_a2_mw';
const USER_OWNER_A = 'user_owner_a_mw';
const USER_ADMIN_A = 'user_admin_a_mw';
const USER_MANAGER_A1 = 'user_manager_a1_mw';
const USER_MEMBER_A1 = 'user_member_a1_mw';
const USER_MEMBER_A2 = 'user_member_a2_mw';
const USER_OWNER_B = 'user_owner_b_mw';
const USER_OUTSIDER = 'user_outsider_mw';

const EXP_A1_OWNER = 'exp_a1_owner_mw';
const EXP_A1_BY_MEMBER = 'exp_a1_by_member_mw';
const EXP_A2_BY_MEMBER = 'exp_a2_by_member_mw';

let realClient: Client;

beforeAll(async () => {
  // libsql の `?cache=shared` は同一 process 内でメモリを共有してしまうため、
  // 単純な `:memory:` で各テストファイルごとに独立させる。
  realClient = createClient({ url: ':memory:' });
  const realDb = drizzle(realClient, { schema });
   
  (globalThis as any).__TEST_MW_DB__ = realDb;

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
    CREATE TABLE groups (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
    CREATE TABLE group_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      date INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount_jpy INTEGER NOT NULL,
      has_receipt INTEGER NOT NULL DEFAULT 0,
      invoice_number TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      classification TEXT,
      approved_by TEXT,
      approved_at INTEGER,
      rejection_reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await realDb.insert(schema.organizations).values([
    {
      id: ORG_A,
      slug: 'org-a-mw',
      kind: 'tennis_club',
      name: 'Org A MW',
      fiscalYearStartMonth: 4,
    },
    {
      id: ORG_B,
      slug: 'org-b-mw',
      kind: 'community',
      name: 'Org B MW',
      fiscalYearStartMonth: 4,
    },
  ]);

  await realDb.insert(schema.groups).values([
    {
      id: GROUP_A1,
      organizationId: ORG_A,
      kind: 'prefecture',
      code: 'a1',
      name: 'A1',
    },
    {
      id: GROUP_A2,
      organizationId: ORG_A,
      kind: 'prefecture',
      code: 'a2',
      name: 'A2',
    },
  ]);

  await realDb.insert(schema.users).values([
    {
      id: USER_OWNER_A,
      email: 'owner-a@mw.test',
      name: 'OwnerA',
      isActive: true,
    },
    {
      id: USER_ADMIN_A,
      email: 'admin-a@mw.test',
      name: 'AdminA',
      isActive: true,
    },
    {
      id: USER_MANAGER_A1,
      email: 'manager-a1@mw.test',
      name: 'ManagerA1',
      isActive: true,
    },
    {
      id: USER_MEMBER_A1,
      email: 'member-a1@mw.test',
      name: 'MemberA1',
      isActive: true,
    },
    {
      id: USER_MEMBER_A2,
      email: 'member-a2@mw.test',
      name: 'MemberA2',
      isActive: true,
    },
    {
      id: USER_OWNER_B,
      email: 'owner-b@mw.test',
      name: 'OwnerB',
      isActive: true,
    },
    {
      id: USER_OUTSIDER,
      email: 'outsider@mw.test',
      name: 'Outsider',
      isActive: true,
    },
  ]);

  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER_A, organizationId: ORG_A, role: 'owner' },
    { id: ulid(), userId: USER_ADMIN_A, organizationId: ORG_A, role: 'admin' },
    {
      id: ulid(),
      userId: USER_MANAGER_A1,
      organizationId: ORG_A,
      role: 'member',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_A1,
      organizationId: ORG_A,
      role: 'member',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_A2,
      organizationId: ORG_A,
      role: 'member',
    },
    { id: ulid(), userId: USER_OWNER_B, organizationId: ORG_B, role: 'owner' },
    // USER_OUTSIDER は何の組織にも所属しない
  ]);

  await realDb.insert(schema.groupMemberships).values([
    {
      id: ulid(),
      userId: USER_MANAGER_A1,
      groupId: GROUP_A1,
      role: 'manager',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_A1,
      groupId: GROUP_A1,
      role: 'member',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_A2,
      groupId: GROUP_A2,
      role: 'member',
    },
  ]);

  await realDb.insert(schema.expenses).values([
    {
      id: EXP_A1_OWNER,
      organizationId: ORG_A,
      groupId: GROUP_A1,
      userId: USER_OWNER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'owner expense in A1',
      amountJpy: 1000,
      status: 'draft',
    },
    {
      id: EXP_A1_BY_MEMBER,
      organizationId: ORG_A,
      groupId: GROUP_A1,
      userId: USER_MEMBER_A1,
      fiscalYear: 2026,
      date: new Date('2026-04-11'),
      description: 'member A1 expense',
      amountJpy: 2000,
      status: 'submitted',
    },
    {
      id: EXP_A2_BY_MEMBER,
      organizationId: ORG_A,
      groupId: GROUP_A2,
      userId: USER_MEMBER_A2,
      fiscalYear: 2026,
      date: new Date('2026-04-12'),
      description: 'member A2 expense',
      amountJpy: 3000,
      status: 'submitted',
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('getMiddlewareSession', () => {
  it('returns null when getSession returns null', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const { getMiddlewareSession } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await getMiddlewareSession({
      headers: new Headers(),
    } as never);
    expect(r).toBeNull();
  });

  it('returns user.id wrapper when session exists', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_OWNER_A } });
    const { getMiddlewareSession } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await getMiddlewareSession({
      headers: new Headers(),
    } as never);
    expect(r).toEqual({ user: { id: USER_OWNER_A } });
  });

  it('falls back to null on getSession throw', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('cookie tampered'));
    const { getMiddlewareSession } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await getMiddlewareSession({
      headers: new Headers(),
    } as never);
    expect(r).toBeNull();
  });

  it('returns null when session has no user.id', async () => {
    mockGetSession.mockResolvedValueOnce({});
    const { getMiddlewareSession } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await getMiddlewareSession({
      headers: new Headers(),
    } as never);
    expect(r).toBeNull();
  });
});

describe('getOrgRole', () => {
  it('returns role + orgId for valid membership', async () => {
    const { getOrgRole } = await import('@/lib/auth/middleware-guards');
    const r = await getOrgRole(USER_OWNER_A, 'org-a-mw');
    expect(r).toEqual({ orgId: ORG_A, role: 'owner' });
  });

  it('returns admin role correctly', async () => {
    const { getOrgRole } = await import('@/lib/auth/middleware-guards');
    const r = await getOrgRole(USER_ADMIN_A, 'org-a-mw');
    expect(r?.role).toBe('admin');
  });

  it('returns null when org slug does not exist', async () => {
    const { getOrgRole } = await import('@/lib/auth/middleware-guards');
    const r = await getOrgRole(USER_OWNER_A, 'no-such-org');
    expect(r).toBeNull();
  });

  it('returns null when user has no membership in the org', async () => {
    const { getOrgRole } = await import('@/lib/auth/middleware-guards');
    // OwnerB は ORG_A に所属しない
    const r = await getOrgRole(USER_OWNER_B, 'org-a-mw');
    expect(r).toBeNull();
  });

  it('returns null for outsider on any org', async () => {
    const { getOrgRole } = await import('@/lib/auth/middleware-guards');
    const r = await getOrgRole(USER_OUTSIDER, 'org-a-mw');
    expect(r).toBeNull();
  });
});

describe('checkExpenseAccess', () => {
  it('returns not-found when org slug does not exist', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_OWNER_A,
      'no-such-org',
      EXP_A1_OWNER,
      'read',
    );
    expect(r).toBe('not-found');
  });

  it('returns not-found when expense id does not exist', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_OWNER_A,
      'org-a-mw',
      'no-such-expense',
      'read',
    );
    expect(r).toBe('not-found');
  });

  it('returns not-found when expense is in different org (slug mismatch attack)', async () => {
    // ORG_A の expense を ORG_B 経由で読もうとする
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_OWNER_A,
      'org-b-mw',
      EXP_A1_OWNER,
      'read',
    );
    expect(r).toBe('not-found');
  });

  it('returns forbidden when user has no membership in the org', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_OUTSIDER,
      'org-a-mw',
      EXP_A1_OWNER,
      'read',
    );
    expect(r).toBe('forbidden');
  });

  it('returns allowed for owner reading own expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_OWNER_A,
      'org-a-mw',
      EXP_A1_OWNER,
      'read',
    );
    expect(r).toBe('allowed');
  });

  it('returns allowed for org admin reading any expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_ADMIN_A,
      'org-a-mw',
      EXP_A2_BY_MEMBER,
      'read',
    );
    expect(r).toBe('allowed');
  });

  it('returns allowed for group member reading their group expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_MEMBER_A1,
      'org-a-mw',
      EXP_A1_BY_MEMBER,
      'read',
    );
    expect(r).toBe('allowed');
  });

  it('returns forbidden for member reading other-group expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    // member_a2 が GROUP_A1 の expense を read（GROUP_A1 メンバー外）
    const r = await checkExpenseAccess(
      USER_MEMBER_A2,
      'org-a-mw',
      EXP_A1_BY_MEMBER,
      'read',
    );
    expect(r).toBe('forbidden');
  });

  it('returns allowed for group manager writing group expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_MANAGER_A1,
      'org-a-mw',
      EXP_A1_BY_MEMBER,
      'write',
    );
    expect(r).toBe('allowed');
  });

  it('returns forbidden for plain member writing other member expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    // member_a1 が同 group 内の他人申請を write 試行
    const r = await checkExpenseAccess(
      USER_MEMBER_A1,
      'org-a-mw',
      EXP_A1_OWNER,
      'write',
    );
    // member_a1 は own ではない、admin ではない、manager ではない → forbidden
    expect(r).toBe('forbidden');
  });

  it('returns allowed for owner writing own expense', async () => {
    const { checkExpenseAccess } = await import(
      '@/lib/auth/middleware-guards'
    );
    const r = await checkExpenseAccess(
      USER_OWNER_A,
      'org-a-mw',
      EXP_A1_OWNER,
      'write',
    );
    expect(r).toBe('allowed');
  });
});
