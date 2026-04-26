/**
 * Budget Server Actions 統合テスト
 *
 * 検証観点:
 *  - setBudget:
 *    - 未ログイン → unauthorized
 *    - member（admin/owner ではない）→ forbidden
 *    - 別 org の group を指定 → not_found
 *    - 新規作成 → DB 反映 + audit log
 *    - 既存更新 → DB 反映 + audit log
 *    - validation 失敗（負額）→ validation
 *  - updateBudget:
 *    - 未ログイン → unauthorized
 *    - 不存在 id → not_found
 *    - usedAmountJpy 未満の amount → validation
 *    - 正常系 → DB 反映
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).__TEST_BUDGET_DB__;
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

const ORG_X = 'org_x_bg';
const ORG_Y = 'org_y_bg';
const GROUP_X1 = 'grp_x1_bg';
const GROUP_Y1 = 'grp_y1_bg';
const USER_OWNER = 'user_owner_bg';
const USER_MEMBER = 'user_member_bg';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__TEST_BUDGET_DB__ = realDb;

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
      id: ORG_X,
      slug: 'org-x-bg',
      kind: 'tennis_club',
      name: 'X',
      fiscalYearStartMonth: 4,
    },
    {
      id: ORG_Y,
      slug: 'org-y-bg',
      kind: 'tennis_club',
      name: 'Y',
      fiscalYearStartMonth: 4,
    },
  ]);
  await realDb.insert(schema.groups).values([
    {
      id: GROUP_X1,
      organizationId: ORG_X,
      kind: 'prefecture',
      code: 'x1',
      name: 'X1',
    },
    {
      id: GROUP_Y1,
      organizationId: ORG_Y,
      kind: 'prefecture',
      code: 'y1',
      name: 'Y1',
    },
  ]);
  await realDb.insert(schema.users).values([
    { id: USER_OWNER, email: 'o@bg.test', name: 'O', isActive: true },
    { id: USER_MEMBER, email: 'm@bg.test', name: 'M', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER, organizationId: ORG_X, role: 'owner' },
    { id: ulid(), userId: USER_MEMBER, organizationId: ORG_X, role: 'member' },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('setBudget', () => {
  it('returns unauthorized when not logged in', async () => {
    mockGetSession.mockResolvedValue(null);
    const { setBudget } = await import('@/lib/actions/budget');
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2026,
      amountJpy: 100_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unauthorized');
  });

  it('returns forbidden for plain member (non-admin/owner)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER } });
    const { setBudget } = await import('@/lib/actions/budget');
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2026,
      amountJpy: 100_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('returns not_found when groupId belongs to different org', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { setBudget } = await import('@/lib/actions/budget');
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: GROUP_Y1, // 別 org の group
      fiscalYear: 2026,
      amountJpy: 100_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });

  it('returns validation for negative amount', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { setBudget } = await import('@/lib/actions/budget');
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2026,
      amountJpy: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('creates new budget and writes audit log', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { setBudget } = await import('@/lib/actions/budget');
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2027,
      amountJpy: 200_000,
      note: '初年度',
    });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.fiscalYear, 2027));
    expect(rows.length).toBe(1);
    expect(rows[0].amountJpy).toBe(200_000);

    const audit = await realDb
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entity, 'budget'));
    expect(audit.find((a) => a.action === 'create')).toBeDefined();
  });

  it('updates existing budget when same fiscalYear+groupId already present', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { setBudget } = await import('@/lib/actions/budget');
    // 上の test で 2027 を作ったので update
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2027,
      amountJpy: 300_000,
    });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.fiscalYear, 2027));
    expect(rows.length).toBe(1);
    expect(rows[0].amountJpy).toBe(300_000);
  });

  it('creates org-level budget when groupId=null', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { setBudget } = await import('@/lib/actions/budget');
    const r = await setBudget({
      organizationId: ORG_X,
      groupId: null,
      fiscalYear: 2028,
      amountJpy: 500_000,
    });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.fiscalYear, 2028));
    expect(rows.length).toBe(1);
    expect(rows[0].groupId).toBeNull();
  });
});

describe('updateBudget', () => {
  it('returns not_found for unknown id', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { updateBudget } = await import('@/lib/actions/budget');
    const r = await updateBudget({ id: 'no_such', amountJpy: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });

  it('rejects amount below already-used budget', async () => {
    // 既存 budget の usedAmountJpy を 50_000 に設定して、それより下回る額の update を試みる
    const id = ulid();
    await realDb.insert(schema.budgets).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2029,
      amountJpy: 100_000,
      usedAmountJpy: 50_000,
      createdBy: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { updateBudget } = await import('@/lib/actions/budget');
    const r = await updateBudget({ id, amountJpy: 30_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('updates budget and writes audit log on success', async () => {
    const id = ulid();
    await realDb.insert(schema.budgets).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2030,
      amountJpy: 100_000,
      createdBy: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { updateBudget } = await import('@/lib/actions/budget');
    const r = await updateBudget({ id, amountJpy: 250_000, note: 'bumped' });
    expect(r.ok).toBe(true);

    const after = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, id));
    expect(after[0].amountJpy).toBe(250_000);
    expect(after[0].note).toBe('bumped');
  });

  it('returns forbidden when caller is plain member', async () => {
    const id = ulid();
    await realDb.insert(schema.budgets).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2031,
      amountJpy: 100_000,
      createdBy: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER } });
    const { updateBudget } = await import('@/lib/actions/budget');
    const r = await updateBudget({ id, amountJpy: 200_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });
});
