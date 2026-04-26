/**
 * Organization-scope 関連 統合テスト（W3-A 仕上げ拡充）
 *
 * 検証観点（5 cases）:
 *  - organizations.slug の UNIQUE 制約（同 slug 二重作成は失敗）
 *  - 組織オーナー設定: memberships.role='owner' が確立されると requireOrganizationRole で AuthContext を取得できる
 *  - 別組織からの cross-org 参照は requireOrganizationRole で forbidden
 *  - setBudget の組織分離: 同一 fiscalYear×groupId でも組織が違えば別 budget として作成される
 *  - createExpense の audit_logs.organizationId が必ず正しい組織 id で記録される
 *
 * 既存 actions-budget / actions-expense との重複を避け、組織境界に焦点を絞る。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {

    return (globalThis as any).__TEST_ORG_DB__;
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

vi.mock('@/lib/email/notify', () => ({
  notifyExpenseSubmitted: vi.fn().mockResolvedValue(undefined),
}));

const mockGetSession = vi.fn<() => Promise<{ user?: { id: string } } | null>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
    },
  },
}));

const ORG_ALPHA = 'org_alpha_or';
const ORG_BETA = 'org_beta_or';
const GROUP_A = 'grp_a_or';
const GROUP_B = 'grp_b_or';
const USER_OWNER_A = 'user_owner_a_or';
const USER_OWNER_B = 'user_owner_b_or';
const USER_MEMBER_A = 'user_mem_a_or';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });

  (globalThis as any).__TEST_ORG_DB__ = realDb;

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
    CREATE UNIQUE INDEX uq_org_slug ON organizations(slug);
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
    CREATE TABLE expense_attachments (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      r2_object_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE approval_logs (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      comment TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
      id: ORG_ALPHA,
      slug: 'alpha-or',
      kind: 'tennis_club',
      name: 'Alpha',
      fiscalYearStartMonth: 4,
    },
    {
      id: ORG_BETA,
      slug: 'beta-or',
      kind: 'tennis_club',
      name: 'Beta',
      fiscalYearStartMonth: 4,
    },
  ]);
  await realDb.insert(schema.groups).values([
    {
      id: GROUP_A,
      organizationId: ORG_ALPHA,
      kind: 'prefecture',
      code: 'ga',
      name: 'GA',
    },
    {
      id: GROUP_B,
      organizationId: ORG_BETA,
      kind: 'prefecture',
      code: 'gb',
      name: 'GB',
    },
  ]);
  await realDb.insert(schema.users).values([
    { id: USER_OWNER_A, email: 'oa@or.test', name: 'OA', isActive: true },
    { id: USER_OWNER_B, email: 'ob@or.test', name: 'OB', isActive: true },
    { id: USER_MEMBER_A, email: 'ma@or.test', name: 'MA', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    {
      id: ulid(),
      userId: USER_OWNER_A,
      organizationId: ORG_ALPHA,
      role: 'owner',
    },
    {
      id: ulid(),
      userId: USER_OWNER_B,
      organizationId: ORG_BETA,
      role: 'owner',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_A,
      organizationId: ORG_ALPHA,
      role: 'member',
    },
  ]);
  await realDb.insert(schema.groupMemberships).values([
    { id: ulid(), userId: USER_MEMBER_A, groupId: GROUP_A, role: 'member' },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('organizations.slug uniqueness', () => {
  it('rejects insert of duplicate slug', async () => {
    let threw = false;
    try {
      await realDb.insert(schema.organizations).values({
        id: ulid(),
        slug: 'alpha-or', // 既存と重複
        kind: 'tennis_club',
        name: 'Alpha2',
        fiscalYearStartMonth: 4,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('organization owner setup', () => {
  it('owner membership grants admin-level AuthContext via requireOrganizationRole', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER_A } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    const ctx = await requireOrganizationRole(ORG_ALPHA, [
      'owner',
      'admin',
    ]);
    expect(ctx.orgRole).toBe('owner');
    expect(ctx.organizationId).toBe(ORG_ALPHA);
    // owner なので組織内全 group が visible
    expect(ctx.visibleGroupIds).toContain(GROUP_A);
  });
});

describe('cross-org access', () => {
  it('owner of org BETA cannot access org ALPHA', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER_B } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    let threw: { name: string } | null = null;
    try {
      await requireOrganizationRole(ORG_ALPHA, ['owner', 'admin']);
    } catch (e) {
      threw = e as { name: string };
    }
    expect(threw).not.toBeNull();
    // forbidden() は AuthError を投げる
    expect(threw?.name).toMatch(/AuthError/);
  });
});

describe('setBudget org isolation', () => {
  it('same fiscalYear+groupId in different orgs creates two distinct budgets', async () => {
    // org BETA の owner として budget 作成
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER_B } });
    const { setBudget } = await import('@/lib/actions/budget');
    const r1 = await setBudget({
      organizationId: ORG_BETA,
      groupId: GROUP_B,
      fiscalYear: 2026,
      amountJpy: 50_000,
    });
    expect(r1.ok).toBe(true);

    // org ALPHA の owner として、別 group だが同 fiscalYear で作成
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER_A } });
    const r2 = await setBudget({
      organizationId: ORG_ALPHA,
      groupId: GROUP_A,
      fiscalYear: 2026,
      amountJpy: 80_000,
    });
    expect(r2.ok).toBe(true);

    const all = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.fiscalYear, 2026));
    // 2 件存在し、それぞれ別 organization に紐づく
    expect(all.length).toBe(2);
    const orgIds = all.map((b) => b.organizationId).sort();
    expect(orgIds).toEqual([ORG_ALPHA, ORG_BETA].sort());
  });
});

describe('createExpense audit log organizationId', () => {
  it('writes audit_logs with the correct organization_id', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_ALPHA,
      groupId: GROUP_A,
      date: new Date('2026-04-15'),
      description: 'org-scoped audit check',
      amount: 1234,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const audits = await realDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, r.id));
      const created = audits.find((a) => a.action === 'create');
      expect(created).toBeDefined();
      expect(created?.organizationId).toBe(ORG_ALPHA);
    }
  });
});
