/**
 * Invite / Member Server Actions 統合テスト
 *
 * 検証観点:
 *  - inviteMember:
 *    - 未ログイン → unauthorized
 *    - member → forbidden
 *    - 既存メンバー → validation
 *    - 正常系 → invitations + audit log
 *    - 既存 pending invitation を上書き（再送扱い）
 *  - updateMemberRole:
 *    - 自分自身 → validation
 *    - 不存在 → not_found
 *    - admin が owner ロール付与 → forbidden
 *    - 正常系
 *  - deactivateMember:
 *    - 自分自身 → validation
 *    - 正常系 → users.is_active=false
 *  - cancelInvitation:
 *    - 不存在 → not_found
 *    - already canceled → validation
 *    - 正常系 → invitations.status=canceled
 *  - resendInvitation:
 *    - 正常系 → invitations.expires_at 更新
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

vi.mock('@/lib/db/client', () => ({
  get db() {
     
    return (globalThis as any).__TEST_INVITE_DB__;
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
  notifyInvitation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email/resend', () => ({
  sendInvitationEmail: vi
    .fn()
    .mockResolvedValue({ ok: true, id: 'em_mock_id' }),
  // 他の export も触られるかもしれないので保険
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: null }),
  getAppUrl: () => 'http://localhost:3000',
}));

const mockGetSession = vi.fn<() => Promise<{ user?: { id: string } } | null>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
    },
  },
}));

const ORG_X = 'org_x_inv';
const USER_OWNER = 'user_owner_inv';
const USER_ADMIN = 'user_admin_inv';
const USER_MEMBER = 'user_member_inv';
const USER_TARGET = 'user_target_inv';

let realClient: Client;
let realDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  realClient = createClient({ url: ':memory:' });
  realDb = drizzle(realClient, { schema });
   
  (globalThis as any).__TEST_INVITE_DB__ = realDb;

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
    CREATE TABLE invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER,
      inviter_id TEXT NOT NULL,
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

  await realDb.insert(schema.organizations).values({
    id: ORG_X,
    slug: 'org-x-inv',
    kind: 'tennis_club',
    name: 'X',
    fiscalYearStartMonth: 4,
  });
  await realDb.insert(schema.users).values([
    { id: USER_OWNER, email: 'o@inv.test', name: 'O', isActive: true },
    { id: USER_ADMIN, email: 'admin@inv.test', name: 'AdminUser', isActive: true },
    { id: USER_MEMBER, email: 'm@inv.test', name: 'M', isActive: true },
    {
      id: USER_TARGET,
      email: 'target@inv.test',
      name: 'Target',
      isActive: true,
    },
  ]);
  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER, organizationId: ORG_X, role: 'owner' },
    { id: ulid(), userId: USER_ADMIN, organizationId: ORG_X, role: 'admin' },
    { id: ulid(), userId: USER_MEMBER, organizationId: ORG_X, role: 'member' },
    { id: ulid(), userId: USER_TARGET, organizationId: ORG_X, role: 'member' },
  ]);
});

afterAll(() => {
  realClient?.close();
});

describe('inviteMember', () => {
  it('returns unauthorized when not logged in', async () => {
    mockGetSession.mockResolvedValue(null);
    const { inviteMember } = await import('@/lib/actions/invite');
    const r = await inviteMember({
      email: 'new@inv.test',
      organizationId: ORG_X,
      role: 'member',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('unauthorized');
  });

  it('returns forbidden for plain member', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_MEMBER } });
    const { inviteMember } = await import('@/lib/actions/invite');
    const r = await inviteMember({
      email: 'new@inv.test',
      organizationId: ORG_X,
      role: 'member',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('returns validation when target is already a member', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { inviteMember } = await import('@/lib/actions/invite');
    const r = await inviteMember({
      email: 'm@inv.test', // USER_MEMBER のメール
      organizationId: ORG_X,
      role: 'member',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('creates invitation + audit log on happy path', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { inviteMember } = await import('@/lib/actions/invite');
    const r = await inviteMember({
      email: 'fresh@inv.test',
      organizationId: ORG_X,
      role: 'member',
    });
    expect(r.ok).toBe(true);

    const inv = await realDb
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, 'fresh@inv.test'));
    expect(inv.length).toBe(1);
    expect(inv[0].status).toBe('pending');

    const audit = await realDb
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entity, 'invitation'));
    expect(audit.find((a) => a.action === 'create')).toBeDefined();
  });

  it('cancels existing pending invitation when re-inviting same email', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { inviteMember } = await import('@/lib/actions/invite');
    // 1 回目
    await inviteMember({
      email: 'reinvite@inv.test',
      organizationId: ORG_X,
      role: 'member',
    });
    // 2 回目
    const r2 = await inviteMember({
      email: 'reinvite@inv.test',
      organizationId: ORG_X,
      role: 'admin', // role を変えて再招待
    });
    expect(r2.ok).toBe(true);

    const all = await realDb
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, 'reinvite@inv.test'));
    const pending = all.filter((i) => i.status === 'pending');
    const canceled = all.filter((i) => i.status === 'canceled');
    expect(pending.length).toBe(1);
    expect(canceled.length).toBe(1);
    expect(pending[0].role).toBe('admin');
  });
});

describe('updateMemberRole', () => {
  it('rejects updating own role (self-mutation)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { updateMemberRole } = await import('@/lib/actions/invite');
    const r = await updateMemberRole({
      organizationId: ORG_X,
      userId: USER_OWNER,
      role: 'admin',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('returns not_found for unknown userId', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { updateMemberRole } = await import('@/lib/actions/invite');
    const r = await updateMemberRole({
      organizationId: ORG_X,
      userId: 'nonexistent',
      role: 'member',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });

  it('forbids admin from granting owner role', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_ADMIN } });
    const { updateMemberRole } = await import('@/lib/actions/invite');
    const r = await updateMemberRole({
      organizationId: ORG_X,
      userId: USER_TARGET,
      role: 'owner',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('forbidden');
  });

  it('updates role on happy path', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { updateMemberRole } = await import('@/lib/actions/invite');
    const r = await updateMemberRole({
      organizationId: ORG_X,
      userId: USER_TARGET,
      role: 'admin',
    });
    expect(r.ok).toBe(true);

    const m = await realDb
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, ORG_X),
          eq(schema.memberships.userId, USER_TARGET),
        ),
      );
    expect(m[0].role).toBe('admin');
  });
});

describe('deactivateMember', () => {
  it('rejects deactivating self', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { deactivateMember } = await import('@/lib/actions/invite');
    const r = await deactivateMember({
      organizationId: ORG_X,
      userId: USER_OWNER,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('marks user.is_active=false on happy path', async () => {
    // 専用の被害者ユーザーを準備
    const victimId = 'user_victim_inv';
    await realDb.insert(schema.users).values({
      id: victimId,
      email: 'victim@inv.test',
      name: 'Victim',
      isActive: true,
    });
    await realDb.insert(schema.memberships).values({
      id: ulid(),
      userId: victimId,
      organizationId: ORG_X,
      role: 'member',
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { deactivateMember } = await import('@/lib/actions/invite');
    const r = await deactivateMember({
      organizationId: ORG_X,
      userId: victimId,
    });
    expect(r.ok).toBe(true);

    const u = await realDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, victimId));
    expect(u[0].isActive).toBe(false);
  });
});

describe('cancelInvitation', () => {
  it('returns not_found for unknown invitationId', async () => {
    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { cancelInvitation } = await import('@/lib/actions/invite');
    const r = await cancelInvitation({
      organizationId: ORG_X,
      invitationId: 'no_such_inv',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not_found');
  });

  it('rejects canceling already-canceled invitation (state validation)', async () => {
    const id = ulid();
    await realDb.insert(schema.invitations).values({
      id,
      organizationId: ORG_X,
      email: 'cancel@inv.test',
      role: 'member',
      status: 'canceled',
      expiresAt: new Date(Date.now() + 86400_000),
      inviterId: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { cancelInvitation } = await import('@/lib/actions/invite');
    const r = await cancelInvitation({
      organizationId: ORG_X,
      invitationId: id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });

  it('cancels pending invitation', async () => {
    const id = ulid();
    await realDb.insert(schema.invitations).values({
      id,
      organizationId: ORG_X,
      email: 'tocancel@inv.test',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400_000),
      inviterId: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { cancelInvitation } = await import('@/lib/actions/invite');
    const r = await cancelInvitation({
      organizationId: ORG_X,
      invitationId: id,
    });
    expect(r.ok).toBe(true);

    const after = await realDb
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, id));
    expect(after[0].status).toBe('canceled');
  });
});

describe('resendInvitation', () => {
  it('extends expires_at on happy path', async () => {
    const id = ulid();
    const oldExpiresAt = new Date(Date.now() + 1000); // 約 1 秒後
    await realDb.insert(schema.invitations).values({
      id,
      organizationId: ORG_X,
      email: 'resend@inv.test',
      role: 'member',
      status: 'pending',
      expiresAt: oldExpiresAt,
      inviterId: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { resendInvitation } = await import('@/lib/actions/invite');
    const r = await resendInvitation({
      organizationId: ORG_X,
      invitationId: id,
    });
    expect(r.ok).toBe(true);

    const after = await realDb
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, id));
    expect(after[0].expiresAt!.getTime()).toBeGreaterThan(
      oldExpiresAt.getTime(),
    );
  });

  it('rejects resend on canceled invitation', async () => {
    const id = ulid();
    await realDb.insert(schema.invitations).values({
      id,
      organizationId: ORG_X,
      email: 'rcancel@inv.test',
      role: 'member',
      status: 'canceled',
      expiresAt: new Date(Date.now() + 86400_000),
      inviterId: USER_OWNER,
    });

    mockGetSession.mockResolvedValue({ user: { id: USER_OWNER } });
    const { resendInvitation } = await import('@/lib/actions/invite');
    const r = await resendInvitation({
      organizationId: ORG_X,
      invitationId: id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('validation');
  });
});
