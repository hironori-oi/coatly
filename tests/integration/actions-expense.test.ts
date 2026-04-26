/**
 * Expense Server Actions 統合テスト
 *
 * 検証観点:
 *  - createExpense:
 *    - 未ログイン → unauthorized
 *    - 別 org → forbidden
 *    - 不可視 group → forbidden
 *    - validation 失敗（空 description / 未来日付）→ validation
 *    - 正常系（添付なし）→ DB 反映 + audit log
 *    - 正常系（添付あり）→ attachments INSERT + hasReceipt=true 自動更新
 *  - updateExpense:
 *    - 別ユーザーの draft → forbidden
 *    - submitted 状態 → validation
 *    - rejected → 編集 → status を draft に戻す
 *    - 正常系 → DB 反映
 *  - submitExpense:
 *    - 別ユーザー → forbidden
 *    - draft → submitted 遷移 + approval log
 *  - withdrawExpense:
 *    - submitted → draft 遷移 + approval log
 *    - draft 状態 → validation
 *  - deleteExpense:
 *    - draft のみ削除可
 *    - submitted → validation
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
    return (globalThis as any).__TEST_EXPENSE_DB__;
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

const ORG_X = 'org_x_ex';
const ORG_Y = 'org_y_ex';
const GROUP_X1 = 'grp_x1_ex';
const GROUP_X2 = 'grp_x2_ex';
const GROUP_Y1 = 'grp_y1_ex';
const USER_OWNER = 'user_owner_ex';
const USER_MEMBER_A = 'user_mem_a_ex';
const USER_MEMBER_B = 'user_mem_b_ex';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__TEST_EXPENSE_DB__ = realDb;

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
      id: ORG_X,
      slug: 'org-x-ex',
      kind: 'tennis_club',
      name: 'X',
      fiscalYearStartMonth: 4,
    },
    {
      id: ORG_Y,
      slug: 'org-y-ex',
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
      id: GROUP_X2,
      organizationId: ORG_X,
      kind: 'prefecture',
      code: 'x2',
      name: 'X2',
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
    { id: USER_OWNER, email: 'o@ex.test', name: 'O', isActive: true },
    { id: USER_MEMBER_A, email: 'a@ex.test', name: 'A', isActive: true },
    { id: USER_MEMBER_B, email: 'b@ex.test', name: 'B', isActive: true },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER, organizationId: ORG_X, role: 'owner' },
    {
      id: ulid(),
      userId: USER_MEMBER_A,
      organizationId: ORG_X,
      role: 'member',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_B,
      organizationId: ORG_X,
      role: 'member',
    },
  ]);
  // member A は GROUP_X1 のメンバー、member B は GROUP_X2 のメンバー
  await realDb.insert(schema.groupMemberships).values([
    {
      id: ulid(),
      userId: USER_MEMBER_A,
      groupId: GROUP_X1,
      role: 'member',
    },
    {
      id: ulid(),
      userId: USER_MEMBER_B,
      groupId: GROUP_X2,
      role: 'member',
    },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('createExpense', () => {
  it('returns unauthorized when not logged in', async () => {
    mockGetSession.mockResolvedValue(null);
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      date: new Date('2026-04-10'),
      description: 'test',
      amount: 1000,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unauthorized');
  });

  it('returns forbidden when groupId is not visible (member without membership)', async () => {
    // member A は GROUP_X1 メンバーのため、GROUP_X2 (X2) は不可視
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_X,
      groupId: GROUP_X2,
      date: new Date('2026-04-10'),
      description: 'test',
      amount: 1000,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('returns forbidden when not member of org', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_Y,
      groupId: GROUP_Y1,
      date: new Date('2026-04-10'),
      description: 'test',
      amount: 1000,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('returns validation for empty description', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      date: new Date('2026-04-10'),
      description: '',
      amount: 1000,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('returns validation for future date (>1 day ahead)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { createExpense } = await import('@/lib/actions/expense');
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const r = await createExpense({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      date: farFuture,
      description: 'future',
      amount: 1000,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('creates draft expense + audit log (no attachments)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      date: new Date('2026-04-10'),
      description: '会場費',
      amount: 5000,
      hasReceipt: false,
      classification: 'group_funded',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rows = await realDb
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.id, r.id));
      expect(rows[0]?.status).toBe('draft');
      expect(rows[0]?.amountJpy).toBe(5000);
      expect(rows[0]?.userId).toBe(USER_MEMBER_A);

      const audit = await realDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, r.id));
      expect(audit.find((a) => a.action === 'create')).toBeDefined();
    }
  });

  it('creates expense with attachments and auto-flips hasReceipt=true', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { createExpense } = await import('@/lib/actions/expense');
    const r = await createExpense({
      organizationId: ORG_X,
      groupId: GROUP_X1,
      date: new Date('2026-04-10'),
      description: '備品購入',
      amount: 3000,
      hasReceipt: false,
      classification: 'group_funded',
      attachments: [
        {
          objectKey: `r2/test/${ulid()}.jpg`,
          fileName: 'receipt.jpg',
          contentType: 'image/jpeg',
          size: 1024,
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rows = await realDb
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.id, r.id));
      expect(rows[0]?.hasReceipt).toBe(true);

      const atts = await realDb
        .select()
        .from(schema.expenseAttachments)
        .where(eq(schema.expenseAttachments.expenseId, r.id));
      expect(atts.length).toBe(1);
      expect(atts[0]?.fileName).toBe('receipt.jpg');
    }
  });
});

describe('updateExpense', () => {
  it('forbids updating another user expense', async () => {
    // owner が作った draft を member A が更新しようとする
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_OWNER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'owner only',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { updateExpense } = await import('@/lib/actions/expense');
    const r = await updateExpense({ id, description: 'hacked' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('rejects updating submitted expense (state validation)', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'submitted',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'submitted',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { updateExpense } = await import('@/lib/actions/expense');
    const r = await updateExpense({ id, description: 'edit' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('updates rejected expense and resets status to draft', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'rejected one',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'rejected',
      classification: 'group_funded',
      rejectionReason: 'wrong amount',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { updateExpense } = await import('@/lib/actions/expense');
    const r = await updateExpense({ id, amount: 1500 });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(rows[0]?.status).toBe('draft');
    expect(rows[0]?.rejectionReason).toBeNull();
    expect(rows[0]?.amountJpy).toBe(1500);
  });

  it('updates draft expense (happy path)', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'before',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { updateExpense } = await import('@/lib/actions/expense');
    const r = await updateExpense({ id, description: 'after', amount: 2000 });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(rows[0]?.description).toBe('after');
    expect(rows[0]?.amountJpy).toBe(2000);
  });
});

describe('submitExpense', () => {
  it('forbids submitting another user expense', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_OWNER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'owner draft',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { submitExpense } = await import('@/lib/actions/expense');
    const r = await submitExpense({ id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('transitions draft to submitted and writes approval log', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'submit me',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { submitExpense } = await import('@/lib/actions/expense');
    const r = await submitExpense({ id });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(rows[0]?.status).toBe('submitted');

    const logs = await realDb
      .select()
      .from(schema.approvalLogs)
      .where(eq(schema.approvalLogs.expenseId, id));
    expect(logs.find((l) => l.action === 'submit')).toBeDefined();
  });

  it('rejects submitting an already-submitted expense (state validation)', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'already',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'approved',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { submitExpense } = await import('@/lib/actions/expense');
    const r = await submitExpense({ id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });
});

describe('withdrawExpense', () => {
  it('transitions submitted to draft and writes approval log', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'withdraw me',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'submitted',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { withdrawExpense } = await import('@/lib/actions/expense');
    const r = await withdrawExpense({ id });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(rows[0]?.status).toBe('draft');

    const logs = await realDb
      .select()
      .from(schema.approvalLogs)
      .where(eq(schema.approvalLogs.expenseId, id));
    expect(logs.find((l) => l.action === 'withdraw')).toBeDefined();
  });

  it('rejects withdraw on draft expense (state validation)', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'still draft',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { withdrawExpense } = await import('@/lib/actions/expense');
    const r = await withdrawExpense({ id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });
});

describe('deleteExpense', () => {
  it('deletes draft expense and writes audit log', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'delete me',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { deleteExpense } = await import('@/lib/actions/expense');
    const r = await deleteExpense({ id });
    expect(r.ok).toBe(true);

    const rows = await realDb
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id));
    expect(rows.length).toBe(0);

    const audit = await realDb
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, id));
    expect(audit.find((a) => a.action === 'delete')).toBeDefined();
  });

  it('rejects delete on submitted expense (state validation)', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_MEMBER_A,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'submitted not deletable',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'submitted',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { deleteExpense } = await import('@/lib/actions/expense');
    const r = await deleteExpense({ id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('forbids delete on another user draft', async () => {
    const id = ulid();
    await realDb.insert(schema.expenses).values({
      id,
      organizationId: ORG_X,
      groupId: GROUP_X1,
      userId: USER_OWNER,
      fiscalYear: 2026,
      date: new Date('2026-04-10'),
      description: 'owner draft',
      amountJpy: 1000,
      hasReceipt: false,
      status: 'draft',
      classification: 'group_funded',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER_A } });
    const { deleteExpense } = await import('@/lib/actions/expense');
    const r = await deleteExpense({ id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });
});
