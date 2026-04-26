/**
 * CSV Export 関連クエリ 統合テスト（W3-A 仕上げ拡充）
 *
 * 検証観点（3 cases）:
 *  - export 形式: scopedExpenses で取得した行に CSV 出力に必要な field が揃う
 *      （description / amountJpy / fiscalYear / status / classification / date）
 *  - 分類フィルタ: classification='group_funded' 限定の絞り込みが整合する
 *  - 権限: member は visibleGroupIds 外の expense を含まず、admin は組織全件を取得できる
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/guards';

vi.mock('@/lib/db/client', () => ({
  get db() {

    return (globalThis as any).__TEST_EXPORT_DB__;
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

const ORG = 'org_export';
const GROUP_X = 'grp_x_exp';
const GROUP_Y = 'grp_y_exp';
const USER_ADMIN = 'user_admin_exp';
const USER_MEMBER = 'user_member_exp';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });

  (globalThis as any).__TEST_EXPORT_DB__ = realDb;

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

  await realDb.insert(schema.organizations).values({
    id: ORG,
    slug: 'org-export',
    kind: 'tennis_club',
    name: 'Export',
    fiscalYearStartMonth: 4,
  });
  await realDb.insert(schema.groups).values([
    {
      id: GROUP_X,
      organizationId: ORG,
      kind: 'prefecture',
      code: 'ex',
      name: 'EX',
    },
    {
      id: GROUP_Y,
      organizationId: ORG,
      kind: 'prefecture',
      code: 'ey',
      name: 'EY',
    },
  ]);
  await realDb.insert(schema.users).values([
    { id: USER_ADMIN, email: 'a@e.test', name: 'A', isActive: true },
    { id: USER_MEMBER, email: 'm@e.test', name: 'M', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_ADMIN, organizationId: ORG, role: 'admin' },
    { id: ulid(), userId: USER_MEMBER, organizationId: ORG, role: 'member' },
  ]);
  await realDb.insert(schema.groupMemberships).values([
    { id: ulid(), userId: USER_MEMBER, groupId: GROUP_X, role: 'member' },
  ]);
  await realDb.insert(schema.expenses).values([
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_X,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'X group_funded #1',
      amountJpy: 1_500,
      status: 'charged_to_group',
      classification: 'group_funded',
    },
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_X,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-12'),
      description: 'X organization_funded',
      amountJpy: 2_500,
      status: 'charged_to_organization',
      classification: 'organization_funded',
    },
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_Y,
      userId: USER_ADMIN,
      fiscalYear: 2026,
      date: new Date('2026-04-15'),
      description: 'Y personal',
      amountJpy: 800,
      status: 'approved',
      classification: 'personal',
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

const adminCtx: AuthContext = {
  user: { id: USER_ADMIN } as never,
  organizationId: ORG,
  orgRole: 'admin',
  visibleGroupIds: [GROUP_X, GROUP_Y],
  managedGroupIds: [],
};

const memberCtx: AuthContext = {
  user: { id: USER_MEMBER } as never,
  organizationId: ORG,
  orgRole: 'member',
  visibleGroupIds: [GROUP_X],
  managedGroupIds: [],
};

describe('CSV export 形式', () => {
  it('rows include all required CSV fields for export', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const rows = await scopedExpenses(adminCtx);
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(typeof r.description).toBe('string');
      expect(typeof r.amountJpy).toBe('number');
      expect(typeof r.fiscalYear).toBe('number');
      expect(typeof r.status).toBe('string');
      // classification は nullable な enum
      expect(['group_funded', 'organization_funded', 'personal']).toContain(
        r.classification,
      );
      // date は Date オブジェクト（drizzle timestamp mode）
      expect(r.date).toBeInstanceOf(Date);
    }
  });
});

describe('CSV export フィルタ (classification)', () => {
  it('group_funded のみ抽出', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const rows = await scopedExpenses(adminCtx);
    const groupFunded = rows.filter(
      (r) => r.classification === 'group_funded',
    );
    expect(groupFunded.length).toBe(1);
    expect(groupFunded[0].amountJpy).toBe(1_500);
  });
});

describe('CSV export 権限', () => {
  it('admin は組織全件、member は visibleGroup 限定', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const adminRows = await scopedExpenses(adminCtx);
    const memberRows = await scopedExpenses(memberCtx);
    expect(adminRows.length).toBe(3);
    expect(memberRows.length).toBe(2);
    // member は GROUP_X のみ visible
    expect(memberRows.every((r) => r.groupId === GROUP_X)).toBe(true);
    // GROUP_Y の personal 800 は member には見えない
    expect(memberRows.find((r) => r.amountJpy === 800)).toBeUndefined();
  });
});
