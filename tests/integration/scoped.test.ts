/**
 * Scoped query helpers 統合テスト
 *
 * 検証観点:
 *  - scopedExpenses: admin = 組織全件 / member = visible group のみ
 *  - scopedBudgets: 組織内のみ
 *  - scopedGroups: admin = 全 group / member = visible group のみ
 *  - findBudgetForExpense:
 *      group_funded → group_id 一致の budget
 *      organization_funded → group_id IS NULL の budget
 *      personal → null
 *  - getOrganizationById: 存在 / 非存在
 *  - getApproverContacts: manager + org admin の dedup、申請者本人除外
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/guards';

vi.mock('@/lib/db/client', () => ({
  get db() {
     
    return (globalThis as any).__TEST_SCOPED_DB__;
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

vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: async () => null } },
}));

const ORG_X = 'org_x_sc';
const GROUP_X1 = 'grp_x1_sc';
const GROUP_X2 = 'grp_x2_sc';
const USER_ADMIN = 'user_admin_sc';
const USER_MEMBER = 'user_member_sc';
const USER_MANAGER = 'user_manager_sc';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });
   
  (globalThis as any).__TEST_SCOPED_DB__ = realDb;

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
    CREATE TABLE budgets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      group_id TEXT,
      fiscal_year INTEGER NOT NULL,
      amount_jpy INTEGER NOT NULL,
      used_amount_jpy INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await realDb.insert(schema.organizations).values({
    id: ORG_X,
    slug: 'org-x',
    kind: 'tennis_club',
    name: 'OrgX',
    fiscalYearStartMonth: 4,
  });
  await realDb.insert(schema.groups).values([
    {
      id: GROUP_X1,
      organizationId: ORG_X,
      kind: 'prefecture',
      code: 'x1',
      name: 'X1',
    },
    {
      id: GROUP_X2,
      organizationId: ORG_X,
      kind: 'prefecture',
      code: 'x2',
      name: 'X2',
    },
  ]);
  await realDb.insert(schema.users).values([
    { id: USER_ADMIN, email: 'a@x.test', name: 'Admin', isActive: true },
    { id: USER_MEMBER, email: 'm@x.test', name: 'Member', isActive: true },
    { id: USER_MANAGER, email: 'mg@x.test', name: 'Manager', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_ADMIN, organizationId: ORG_X, role: 'admin' },
    { id: ulid(), userId: USER_MEMBER, organizationId: ORG_X, role: 'member' },
    {
      id: ulid(),
      userId: USER_MANAGER,
      organizationId: ORG_X,
      role: 'member',
    },
  ]);
  await realDb.insert(schema.groupMemberships).values([
    { id: ulid(), userId: USER_MEMBER, groupId: GROUP_X1, role: 'member' },
    { id: ulid(), userId: USER_MANAGER, groupId: GROUP_X1, role: 'manager' },
  ]);
  await realDb.insert(schema.expenses).values([
    {
      id: ulid(),
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'X1 e1',
      amountJpy: 1000,
      status: 'submitted',
    },
    {
      id: ulid(),
      organizationId: ORG_X,
      groupId: GROUP_X2,
      userId: USER_ADMIN,
      fiscalYear: 2026,
      date: new Date('2026-04-11'),
      description: 'X2 e1',
      amountJpy: 2000,
      status: 'submitted',
    },
  ]);
  await realDb.insert(schema.budgets).values([
    {
      id: ulid(),
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2026,
      amountJpy: 100_000,
      createdBy: USER_ADMIN,
    },
    {
      id: ulid(),
      organizationId: ORG_X,
      groupId: null,
      fiscalYear: 2026,
      amountJpy: 500_000,
      createdBy: USER_ADMIN,
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

const adminCtx: AuthContext = {
  user: { id: USER_ADMIN } as never,
  organizationId: ORG_X,
  orgRole: 'admin',
  visibleGroupIds: [GROUP_X1, GROUP_X2],
  managedGroupIds: [],
};

const memberCtx: AuthContext = {
  user: { id: USER_MEMBER } as never,
  organizationId: ORG_X,
  orgRole: 'member',
  visibleGroupIds: [GROUP_X1],
  managedGroupIds: [],
};

const memberNoVisibleCtx: AuthContext = {
  user: { id: USER_MEMBER } as never,
  organizationId: ORG_X,
  orgRole: 'member',
  visibleGroupIds: [],
  managedGroupIds: [],
};

describe('scopedExpenses', () => {
  it('admin sees all org expenses', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const rows = await scopedExpenses(adminCtx);
    expect(rows.length).toBe(2);
  });

  it('member sees only visible group expenses', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const rows = await scopedExpenses(memberCtx);
    expect(rows.length).toBe(1);
    expect(rows[0].groupId).toBe(GROUP_X1);
  });

  it('member with empty visibleGroupIds returns 0 rows (failsafe)', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const rows = await scopedExpenses(memberNoVisibleCtx);
    expect(rows.length).toBe(0);
  });
});

describe('scopedBudgets', () => {
  it('returns budgets within the org regardless of role', async () => {
    const { scopedBudgets } = await import('@/lib/db/scoped');
    const rowsAdmin = await scopedBudgets(adminCtx);
    const rowsMember = await scopedBudgets(memberCtx);
    expect(rowsAdmin.length).toBe(2);
    // member は仕様上、scopedBudgets では絞らない（page 側で制御）
    expect(rowsMember.length).toBe(2);
  });
});

describe('scopedGroups', () => {
  it('admin sees all groups', async () => {
    const { scopedGroups } = await import('@/lib/db/scoped');
    const rows = await scopedGroups(adminCtx);
    expect(rows.length).toBe(2);
  });

  it('member sees visible groups only', async () => {
    const { scopedGroups } = await import('@/lib/db/scoped');
    const rows = await scopedGroups(memberCtx);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(GROUP_X1);
  });

  it('member with empty visibleGroupIds returns 0 rows', async () => {
    const { scopedGroups } = await import('@/lib/db/scoped');
    const rows = await scopedGroups(memberNoVisibleCtx);
    expect(rows.length).toBe(0);
  });
});

describe('findBudgetForExpense', () => {
  it('returns null for personal classification', async () => {
    const { findBudgetForExpense } = await import('@/lib/db/scoped');
    const r = await findBudgetForExpense({
      organizationId: ORG_X,
      fiscalYear: 2026,
      groupId: GROUP_X1,
      classification: 'personal',
    });
    expect(r).toBeNull();
  });

  it('returns group budget for group_funded', async () => {
    const { findBudgetForExpense } = await import('@/lib/db/scoped');
    const r = await findBudgetForExpense({
      organizationId: ORG_X,
      fiscalYear: 2026,
      groupId: GROUP_X1,
      classification: 'group_funded',
    });
    expect(r?.groupId).toBe(GROUP_X1);
    expect(r?.amountJpy).toBe(100_000);
  });

  it('returns null when no group budget exists for that group', async () => {
    const { findBudgetForExpense } = await import('@/lib/db/scoped');
    const r = await findBudgetForExpense({
      organizationId: ORG_X,
      fiscalYear: 2026,
      groupId: GROUP_X2,
      classification: 'group_funded',
    });
    expect(r).toBeNull();
  });

  it('returns org-level budget (groupId IS NULL) for organization_funded', async () => {
    const { findBudgetForExpense } = await import('@/lib/db/scoped');
    const r = await findBudgetForExpense({
      organizationId: ORG_X,
      fiscalYear: 2026,
      groupId: GROUP_X1,
      classification: 'organization_funded',
    });
    expect(r?.groupId).toBeNull();
    expect(r?.amountJpy).toBe(500_000);
  });
});

describe('getOrganizationById', () => {
  it('returns org row when exists', async () => {
    const { getOrganizationById } = await import('@/lib/db/scoped');
    const r = await getOrganizationById(ORG_X);
    expect(r?.slug).toBe('org-x');
  });

  it('returns null for unknown id', async () => {
    const { getOrganizationById } = await import('@/lib/db/scoped');
    const r = await getOrganizationById('no_such_org');
    expect(r).toBeNull();
  });
});

describe('getApproverContacts', () => {
  it('returns group manager + org admin/owner, dedup by email, exclude submitter', async () => {
    const { getApproverContacts } = await import('@/lib/db/scoped');
    const r = await getApproverContacts({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      excludeUserId: USER_MEMBER,
    });
    // expected: USER_MANAGER (group manager) + USER_ADMIN (org admin)
    const ids = r.map((u) => u.id).sort();
    expect(ids).toEqual([USER_ADMIN, USER_MANAGER].sort());
  });

  it('excludes the submitter even if they are a manager/admin', async () => {
    const { getApproverContacts } = await import('@/lib/db/scoped');
    const r = await getApproverContacts({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      excludeUserId: USER_ADMIN,
    });
    // admin が申請者の場合、admin は除外され manager のみ
    expect(r.find((u) => u.id === USER_ADMIN)).toBeUndefined();
    expect(r.find((u) => u.id === USER_MANAGER)).toBeDefined();
  });
});
