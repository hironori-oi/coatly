/**
 * Group / Group-membership 関連 統合テスト（W3-A 仕上げ拡充）
 *
 * 検証観点（5 cases）:
 *  - groups.code は (organization_id, code) の複合 UNIQUE 制約（重複作成失敗）
 *  - group_memberships の (user_id, group_id) UNIQUE 制約
 *  - requireGroupRole: 別 group の member は forbidden、所属 group は role を返す
 *  - manager 昇格: role を 'member' → 'manager' に UPDATE すると requireOrganizationRole の managedGroupIds に反映される
 *  - getApproverContacts: 同 organization 内の owner / admin / manager を漏れなく取得し、複数 manager の dedup を確認
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {

    return (globalThis as any).__TEST_GROUP_DB__;
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

const ORG = 'org_grp_g';
const GROUP_X = 'grp_x_g';
const GROUP_Y = 'grp_y_g';
const USER_OWNER = 'user_owner_g';
const USER_ADMIN = 'user_admin_g';
const USER_MANAGER_X = 'user_mgr_x_g';
const USER_MANAGER_X2 = 'user_mgr_x2_g';
const USER_MEMBER_X = 'user_mem_x_g';
const USER_MEMBER_Y = 'user_mem_y_g';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });

  (globalThis as any).__TEST_GROUP_DB__ = realDb;

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
    CREATE UNIQUE INDEX uq_group_org_code ON groups(organization_id, code);
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
    CREATE UNIQUE INDEX uq_gm_user_group ON group_memberships(user_id, group_id);
  `);

  await realDb.insert(schema.organizations).values({
    id: ORG,
    slug: 'org-g',
    kind: 'tennis_club',
    name: 'Org-G',
    fiscalYearStartMonth: 4,
  });
  await realDb.insert(schema.groups).values([
    {
      id: GROUP_X,
      organizationId: ORG,
      kind: 'prefecture',
      code: 'gx',
      name: 'GX',
    },
    {
      id: GROUP_Y,
      organizationId: ORG,
      kind: 'prefecture',
      code: 'gy',
      name: 'GY',
    },
  ]);
  await realDb.insert(schema.users).values([
    { id: USER_OWNER, email: 'o@g.test', name: 'O', isActive: true },
    { id: USER_ADMIN, email: 'a@g.test', name: 'A', isActive: true },
    { id: USER_MANAGER_X, email: 'mx@g.test', name: 'MX', isActive: true },
    { id: USER_MANAGER_X2, email: 'mx2@g.test', name: 'MX2', isActive: true },
    { id: USER_MEMBER_X, email: 'memx@g.test', name: 'MemX', isActive: true },
    { id: USER_MEMBER_Y, email: 'memy@g.test', name: 'MemY', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER, organizationId: ORG, role: 'owner' },
    { id: ulid(), userId: USER_ADMIN, organizationId: ORG, role: 'admin' },
    { id: ulid(), userId: USER_MANAGER_X, organizationId: ORG, role: 'member' },
    {
      id: ulid(),
      userId: USER_MANAGER_X2,
      organizationId: ORG,
      role: 'member',
    },
    { id: ulid(), userId: USER_MEMBER_X, organizationId: ORG, role: 'member' },
    { id: ulid(), userId: USER_MEMBER_Y, organizationId: ORG, role: 'member' },
  ]);
  await realDb.insert(schema.groupMemberships).values([
    { id: ulid(), userId: USER_MANAGER_X, groupId: GROUP_X, role: 'manager' },
    { id: ulid(), userId: USER_MANAGER_X2, groupId: GROUP_X, role: 'manager' },
    { id: ulid(), userId: USER_MEMBER_X, groupId: GROUP_X, role: 'member' },
    { id: ulid(), userId: USER_MEMBER_Y, groupId: GROUP_Y, role: 'member' },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('groups (organization_id, code) uniqueness', () => {
  it('rejects duplicate code within same organization', async () => {
    let threw = false;
    try {
      await realDb.insert(schema.groups).values({
        id: ulid(),
        organizationId: ORG,
        kind: 'prefecture',
        code: 'gx', // GROUP_X と同 code
        name: 'GX-dup',
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('group_memberships (user_id, group_id) uniqueness', () => {
  it('rejects double-add of same user to same group', async () => {
    let threw = false;
    try {
      await realDb.insert(schema.groupMemberships).values({
        id: ulid(),
        userId: USER_MEMBER_X,
        groupId: GROUP_X, // 既に member として登録済み
        role: 'manager',
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('requireGroupRole', () => {
  it('returns role for member of the group, throws for non-member', async () => {
    // 所属 group に対しては role を返す
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_X } });
    const { requireGroupRole } = await import('@/lib/auth/guards');
    const ok = await requireGroupRole(GROUP_X, ['member', 'manager']);
    expect(ok.role).toBe('member');

    // 別 group に対しては forbidden
    let threw: { name: string } | null = null;
    try {
      await requireGroupRole(GROUP_Y, ['member', 'manager']);
    } catch (e) {
      threw = e as { name: string };
    }
    expect(threw?.name).toMatch(/AuthError/);
  });
});

describe('manager 昇格 (member → manager)', () => {
  it('promotes a member to manager and reflects in managedGroupIds', async () => {
    // USER_MEMBER_Y は GROUP_Y の member。manager に昇格させる。
    await realDb
      .update(schema.groupMemberships)
      .set({ role: 'manager' })
      .where(
        and(
          eq(schema.groupMemberships.userId, USER_MEMBER_Y),
          eq(schema.groupMemberships.groupId, GROUP_Y),
        ),
      );

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_Y } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    const ctx = await requireOrganizationRole(ORG, [
      'owner',
      'admin',
      'member',
    ]);
    expect(ctx.managedGroupIds).toContain(GROUP_Y);
    expect(ctx.visibleGroupIds).toContain(GROUP_Y);
    // 別 group は visible にならない（org-level admin ではないので）
    expect(ctx.visibleGroupIds).not.toContain(GROUP_X);
  });
});

describe('getApproverContacts (multi-manager dedup + admin/owner inclusion)', () => {
  it('returns owner + admin + 2 managers, excludes submitter, dedups by email', async () => {
    const { getApproverContacts } = await import('@/lib/db/scoped');
    const r = await getApproverContacts({
      organizationId: ORG,
      groupId: GROUP_X,
      excludeUserId: USER_MEMBER_X, // 申請者
    });
    const ids = r.map((u) => u.id).sort();
    // owner + admin + manager × 2
    expect(ids).toEqual(
      [USER_OWNER, USER_ADMIN, USER_MANAGER_X, USER_MANAGER_X2].sort(),
    );
    // email でユニーク
    const emails = new Set(r.map((u) => u.email));
    expect(emails.size).toBe(r.length);
  });
});
