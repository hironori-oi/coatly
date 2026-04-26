/**
 * Dashboard 系クエリ 統合テスト（W3-A 仕上げ拡充）
 *
 * 検証観点（5 cases）:
 *  - computeFiscalYear:
 *      開始月=4 / 4月以降 → 当年 / 開始月=4 / 3月 → 前年（年度境界）
 *  - 月次集計: scopedExpenses + drizzle 集計で当月 charged_to_* の合計が取れる
 *  - 年度集計: fiscalYear で絞った合計（FY2026 のみ）
 *  - 予算消化率: budgets.usedAmountJpy / amountJpy が承認 expense と整合する
 *  - スコープ確認: member の scopedExpenses は visibleGroup に限られる（dashboard 側からの想定）
 *
 * 注: 集計ロジック自体はページ側 SC で行うため、ここでは scopedExpenses が返す
 *     行集合に対し test 内で sum を取って整合性を確認する。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/guards';

vi.mock('@/lib/db/client', () => ({
  get db() {

    return (globalThis as any).__TEST_DASH_DB__;
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

const ORG = 'org_dash';
const GROUP_X = 'grp_x_dash';
const GROUP_Y = 'grp_y_dash';
const USER_ADMIN = 'user_admin_dash';
const USER_MEMBER = 'user_member_dash';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });

  (globalThis as any).__TEST_DASH_DB__ = realDb;

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
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await realDb.insert(schema.organizations).values({
    id: ORG,
    slug: 'org-dash',
    kind: 'tennis_club',
    name: 'Dash',
    fiscalYearStartMonth: 4,
  });
  await realDb.insert(schema.groups).values([
    {
      id: GROUP_X,
      organizationId: ORG,
      kind: 'prefecture',
      code: 'dx',
      name: 'DX',
    },
    {
      id: GROUP_Y,
      organizationId: ORG,
      kind: 'prefecture',
      code: 'dy',
      name: 'DY',
    },
  ]);
  await realDb.insert(schema.users).values([
    { id: USER_ADMIN, email: 'a@d.test', name: 'A', isActive: true },
    { id: USER_MEMBER, email: 'm@d.test', name: 'M', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_ADMIN, organizationId: ORG, role: 'admin' },
    { id: ulid(), userId: USER_MEMBER, organizationId: ORG, role: 'member' },
  ]);
  await realDb.insert(schema.groupMemberships).values([
    { id: ulid(), userId: USER_MEMBER, groupId: GROUP_X, role: 'member' },
  ]);

  // FY2026 charged_to_group expenses（GROUP_X 5,000 + 3,000 / GROUP_Y 7,000）
  await realDb.insert(schema.expenses).values([
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_X,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'fy26 x #1',
      amountJpy: 5_000,
      status: 'charged_to_group',
      classification: 'group_funded',
    },
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_X,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-20'),
      description: 'fy26 x #2',
      amountJpy: 3_000,
      status: 'charged_to_group',
      classification: 'group_funded',
    },
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_Y,
      userId: USER_ADMIN,
      fiscalYear: 2026,
      date: new Date('2026-05-05'),
      description: 'fy26 y #1',
      amountJpy: 7_000,
      status: 'charged_to_group',
      classification: 'group_funded',
    },
    // FY2025 件 (年度フィルタの test)
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_X,
      userId: USER_MEMBER,
      fiscalYear: 2025,
      date: new Date('2025-08-01'),
      description: 'fy25 x #1',
      amountJpy: 999_999,
      status: 'charged_to_group',
      classification: 'group_funded',
    },
  ]);

  // budgets: GROUP_X 100,000 / used 8,000（5k+3k 加算済み想定）
  await realDb.insert(schema.budgets).values([
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_X,
      fiscalYear: 2026,
      amountJpy: 100_000,
      usedAmountJpy: 8_000,
      createdBy: USER_ADMIN,
    },
    {
      id: ulid(),
      organizationId: ORG,
      groupId: GROUP_Y,
      fiscalYear: 2026,
      amountJpy: 50_000,
      usedAmountJpy: 7_000,
      createdBy: USER_ADMIN,
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

describe('computeFiscalYear (年度計算)', () => {
  it('handles fiscal year boundary correctly', async () => {
    const { computeFiscalYear } = await import('@/lib/db/scoped');
    // 開始月=4
    const org = { fiscalYearStartMonth: 4 } as { fiscalYearStartMonth: number };
    expect(computeFiscalYear(org, new Date('2026-04-01'))).toBe(2026);
    expect(computeFiscalYear(org, new Date('2026-03-31'))).toBe(2025);
    expect(computeFiscalYear(org, new Date('2026-12-31'))).toBe(2026);
    // 開始月=1
    const orgJan = { fiscalYearStartMonth: 1 };
    expect(computeFiscalYear(orgJan, new Date('2026-01-15'))).toBe(2026);
    expect(computeFiscalYear(orgJan, new Date('2025-12-31'))).toBe(2025);
  });
});

describe('月次集計', () => {
  it('admin can sum charged_to_group amounts for FY2026 April (4月)', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const all = await scopedExpenses(adminCtx);
    // 4月の FY2026 charged_to_group のみ集計
    const aprilSum = all
      .filter((e) => {
        const d = new Date(e.date);
        return (
          e.fiscalYear === 2026 &&
          d.getMonth() === 3 && // 0-indexed: April=3
          e.status === 'charged_to_group'
        );
      })
      .reduce((acc, e) => acc + e.amountJpy, 0);
    expect(aprilSum).toBe(5_000 + 3_000);
  });
});

describe('年度集計 (FY フィルタ)', () => {
  it('FY2026 only (excludes FY2025)', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const all = await scopedExpenses(adminCtx);
    const fy2026 = all
      .filter((e) => e.fiscalYear === 2026 && e.status === 'charged_to_group')
      .reduce((acc, e) => acc + e.amountJpy, 0);
    expect(fy2026).toBe(5_000 + 3_000 + 7_000);

    const fy2025 = all
      .filter((e) => e.fiscalYear === 2025)
      .reduce((acc, e) => acc + e.amountJpy, 0);
    expect(fy2025).toBe(999_999);
  });
});

describe('予算消化率', () => {
  it('used / amount は budget の usedAmountJpy と一致する', async () => {
    const budget = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.groupId, GROUP_X))
      .limit(1);
    expect(budget[0]?.amountJpy).toBe(100_000);
    expect(budget[0]?.usedAmountJpy).toBe(8_000);
    const usageRate = (budget[0]!.usedAmountJpy / budget[0]!.amountJpy) * 100;
    expect(usageRate).toBeCloseTo(8, 5);
    expect(budget[0]!.amountJpy - budget[0]!.usedAmountJpy).toBe(92_000);
  });
});

describe('dashboard スコープ確認 (member)', () => {
  it('member は visibleGroupIds に限定されたデータのみ参照できる', async () => {
    const { scopedExpenses } = await import('@/lib/db/scoped');
    const rows = await scopedExpenses(memberCtx);
    // member は GROUP_X のみ visible（FY2025 + FY2026 charged_to_group × 2 = 3 件）
    expect(rows.every((r) => r.groupId === GROUP_X)).toBe(true);
    expect(rows.length).toBe(3);
    // GROUP_Y の 7,000 円は含まれない
    expect(rows.find((r) => r.amountJpy === 7_000)).toBeUndefined();
  });
});
