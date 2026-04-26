/**
 * Approval (FSM) Server Actions 統合テスト
 *
 * 検証観点:
 *  - approveExpense:
 *    - 自分の申請を自分で承認 → validation
 *    - draft 状態 → validation
 *    - 充当先 budget なし → validation
 *    - group_funded 正常系 → status=charged_to_group + budget 加算 + approval log
 *    - personal 正常系 → status=approved（budget 影響なし）
 *  - rejectExpense:
 *    - draft → validation
 *    - submitted → status=rejected + reason 反映 + approval log
 *  - reclassifyExpense:
 *    - admin only（member は forbidden）
 *    - draft → validation
 *    - 同じ classification → validation
 *    - 正常系 → 旧 budget 減算 + 新 budget 加算 + status 更新
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {
     
    return (globalThis as any).__TEST_APPROVAL_DB__;
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
  notifyExpenseApproved: vi.fn().mockResolvedValue(undefined),
}));

const mockGetSession = vi.fn<() => Promise<{ user?: { id: string } } | null>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
    },
  },
}));

const ORG_X = 'org_x_apr';
const GROUP_X1 = 'grp_x1_apr';
const USER_OWNER = 'user_owner_apr';
const USER_MEMBER = 'user_member_apr';
const BUDGET_GROUP_2026 = 'budget_grp_apr';
const BUDGET_ORG_2026 = 'budget_org_apr';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  // db.transaction() を使う action のテストでは libsql の :memory: + 別 session
  // で「no such table」エラーが出るため、shared cache 付きの file URL で揃える。
  realClient = createClient({
    url: 'file::memory:?cache=shared',
  });
  realDb = drizzle(realClient, { schema });
   
  (globalThis as any).__TEST_APPROVAL_DB__ = realDb;

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
  `);

  await realDb.insert(schema.organizations).values({
    id: ORG_X,
    slug: 'org-x-apr',
    kind: 'tennis_club',
    name: 'X',
    fiscalYearStartMonth: 4,
  });
  await realDb.insert(schema.groups).values({
    id: GROUP_X1,
    organizationId: ORG_X,
    kind: 'prefecture',
    code: 'x1',
    name: 'X1',
  });
  await realDb.insert(schema.users).values([
    { id: USER_OWNER, email: 'o@apr.test', name: 'O', isActive: true },
    { id: USER_MEMBER, email: 'm@apr.test', name: 'M', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER, organizationId: ORG_X, role: 'owner' },
    {
      id: ulid(),
      userId: USER_MEMBER,
      organizationId: ORG_X,
      role: 'member',
    },
  ]);
  await realDb.insert(schema.groupMemberships).values({
    id: ulid(),
    userId: USER_MEMBER,
    groupId: GROUP_X1,
    role: 'member',
  });
  // 充当先 budget を準備
  await realDb.insert(schema.budgets).values([
    {
      id: BUDGET_GROUP_2026,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      fiscalYear: 2026,
      amountJpy: 1_000_000,
      usedAmountJpy: 0,
      createdBy: USER_OWNER,
    },
    {
      id: BUDGET_ORG_2026,
      organizationId: ORG_X,
      groupId: null,
      fiscalYear: 2026,
      amountJpy: 5_000_000,
      usedAmountJpy: 0,
      createdBy: USER_OWNER,
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

async function insertSubmittedExpense(opts: {
  id?: string;
  userId?: string;
  amount?: number;
}) {
  const id = opts.id ?? ulid();
  await realDb.insert(schema.expenses).values({
    id,
    organizationId: ORG_X,
    groupId: GROUP_X1,
    userId: opts.userId ?? USER_MEMBER,
    fiscalYear: 2026,
    date: new Date('2026-04-10'),
    description: 'apr test',
    amountJpy: opts.amount ?? 1000,
    hasReceipt: false,
    status: 'submitted',
    classification: null,
  });
  return id;
}

describe('approveExpense', () => {
  it('rejects approving own expense (validation)', async () => {
    const id = await insertSubmittedExpense({ userId: USER_OWNER });
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense } = await import('@/lib/actions/approval');
    const r = await approveExpense({
      id,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('rejects approving non-submitted expense', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'draft',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense } = await import('@/lib/actions/approval');
    const r = await approveExpense({
      id,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('rejects when no budget exists for fiscal_year', async () => {
    const id = await insertSubmittedExpense({});
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense } = await import('@/lib/actions/approval');
    // FY 2099 = budget 不在
    await realDb
      .update(schema.expenses)
      .set({ fiscalYear: 2099 })
      .where(eq(schema.expenses.id, id));
    const r = await approveExpense({
      id,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('approves group_funded expense, updates budget, writes log', async () => {
    const id = await insertSubmittedExpense({ amount: 12_000 });
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense } = await import('@/lib/actions/approval');
    const r = await approveExpense({
      id,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(true);

    const exp = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(exp[0].status).toBe('charged_to_group');
    expect(exp[0].classification).toBe('group_funded');
    expect(exp[0].approvedBy).toBe(USER_OWNER);

    const b = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_GROUP_2026));
    expect(b[0].usedAmountJpy).toBeGreaterThanOrEqual(12_000);

    const logs = await realDb
      .select()
      .from(schema.approvalLogs)
      .where(eq(schema.approvalLogs.expenseId, id));
    expect(logs.find((l) => l.action === 'approve')).toBeDefined();
  });

  it('approves personal expense without budget impact', async () => {
    const id = await insertSubmittedExpense({ amount: 5000 });
    const before = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_GROUP_2026));

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense } = await import('@/lib/actions/approval');
    const r = await approveExpense({
      id,
      classification: 'personal',
    });
    expect(r.ok).toBe(true);

    const exp = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(exp[0].status).toBe('approved');

    const after = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_GROUP_2026));
    expect(after[0].usedAmountJpy).toBe(before[0].usedAmountJpy);
  });
});

describe('rejectExpense', () => {
  it('rejects on draft state (validation)', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'draft',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { rejectExpense } = await import('@/lib/actions/approval');
    const r = await rejectExpense({ id, reason: 'no good' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('transitions submitted to rejected and writes log + reason', async () => {
    const id = await insertSubmittedExpense({});
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { rejectExpense } = await import('@/lib/actions/approval');
    const r = await rejectExpense({ id, reason: '金額過大' });
    expect(r.ok).toBe(true);

    const exp = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(exp[0].status).toBe('rejected');
    expect(exp[0].rejectionReason).toBe('金額過大');

    const logs = await realDb
      .select()
      .from(schema.approvalLogs)
      .where(eq(schema.approvalLogs.expenseId, id));
    expect(logs.find((l) => l.action === 'reject')).toBeDefined();
  });
});

describe('reclassifyExpense', () => {
  it('forbids member-only role from reclassifying', async () => {
    // 先に approve しておく
    const id = await insertSubmittedExpense({ amount: 1000 });
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense } = await import('@/lib/actions/approval');
    await approveExpense({ id, classification: 'group_funded' });

    // member は reclassify forbidden
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER } });
    const { reclassifyExpense } = await import('@/lib/actions/approval');
    const r = await reclassifyExpense({
      id,
      newClassification: 'organization_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('rejects reclassify on non-approved expense', async () => {
    const id = await insertSubmittedExpense({});
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { reclassifyExpense } = await import('@/lib/actions/approval');
    const r = await reclassifyExpense({
      id,
      newClassification: 'organization_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('rejects reclassify with same classification', async () => {
    const id = await insertSubmittedExpense({ amount: 1000 });
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense, reclassifyExpense } = await import(
      '@/lib/actions/approval'
    );
    await approveExpense({ id, classification: 'group_funded' });

    const r = await reclassifyExpense({
      id,
      newClassification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('reclassifies group_funded to organization_funded (budget swap)', async () => {
    const id = await insertSubmittedExpense({ amount: 8000 });
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { approveExpense, reclassifyExpense } = await import(
      '@/lib/actions/approval'
    );
    await approveExpense({ id, classification: 'group_funded' });

    const groupBudgetBefore = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_GROUP_2026));
    const orgBudgetBefore = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_ORG_2026));

    const r = await reclassifyExpense({
      id,
      newClassification: 'organization_funded',
    });
    expect(r.ok).toBe(true);

    const exp = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(exp[0].status).toBe('charged_to_organization');
    expect(exp[0].classification).toBe('organization_funded');

    const groupBudgetAfter = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_GROUP_2026));
    const orgBudgetAfter = await realDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, BUDGET_ORG_2026));

    expect(groupBudgetAfter[0].usedAmountJpy).toBe(
      groupBudgetBefore[0].usedAmountJpy - 8000,
    );
    expect(orgBudgetAfter[0].usedAmountJpy).toBe(
      orgBudgetBefore[0].usedAmountJpy + 8000,
    );

    const logs = await realDb
      .select()
      .from(schema.approvalLogs)
      .where(eq(schema.approvalLogs.expenseId, id));
    expect(logs.find((l) => l.action === 'reclassify')).toBeDefined();
  });
});
