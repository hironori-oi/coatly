/**
 * 認可ヘルパ統合テスト（Phase 1 cleanup で skip 解除）
 *
 * 検証観点（最低 6 ケース要求のうち、決定論的に検証できる 5 + todo 起票）:
 *   1. requireUser: 未ログイン → AuthError(401)
 *   2. requireOrganizationRole: 別組織のメンバーは AuthError(403)
 *   3. requireOrganizationRole: 同組織だが不適切 role は AuthError(403)
 *   4. requireOrganizationRole: 同組織 + 適切 role なら AuthContext を返す
 *   5. requireGroupRole: 別 group の member は AuthError(403)
 *
 * 実装方針:
 *   - in-memory libsql（`:memory:`）を `vi.mock('@/lib/db/client')` で差し込み
 *   - drizzle 経由で schema CREATE TABLE を直接実行（drizzle migrations は
 *     auth_session 等の plural / Better Auth のコア model 名衝突があるため、
 *     最小限の必要テーブルのみを test 内で create する）
 *   - `auth.api.getSession` を `vi.mock('@/lib/auth/better-auth')` で stub
 *   - `next/headers` の `headers()` も stub（Server Component 外で動かすため）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { ulid } from 'ulidx';
import * as schema from '@/lib/db/schema';

// ────────────────────────────────────────────────────────────────────
// 1. in-memory libsql client を作る
//    `vi.hoisted` で test スコープに巻き上げて、後段の vi.mock から参照する
// ────────────────────────────────────────────────────────────────────
const { client, db } = vi.hoisted(() => {
  // ESM の vi.hoisted 内では top-level await は使えるが require は不可。
  // dynamic import を使うため、後続の async setup で再代入する placeholder。
  return {
    client: null as unknown as Client,
    db: null as ReturnType<typeof drizzle> | null,
  };
});

// `@/lib/db/client` を差し替え、guards.ts が import する `db` を test の DB に向ける
vi.mock('@/lib/db/client', async () => {
  // beforeAll で初期化されるが、guards.ts の import 評価時点ではまだ null。
  // そのためここでは getter で遅延参照する。
  return {
    get db() {
       
      return (globalThis as any).__TEST_DB__;
    },
  };
});

// `next/headers` は Server Context を要求するので空 Headers を返す stub に置換
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    has: () => false,
    getAll: () => [],
  }),
}));

// `@/lib/auth/better-auth` の auth.api.getSession のみ差し替え
const mockGetSession = vi.fn<() => Promise<{ user?: { id: string } } | null>>();
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
    },
  },
}));

// ────────────────────────────────────────────────────────────────────
// テスト用 fixture id
// ────────────────────────────────────────────────────────────────────
const ORG_A = 'org_a_test';
const ORG_B = 'org_b_test';
const GROUP_A1 = 'grp_a_okayama_test';
const GROUP_A2 = 'grp_a_hiroshima_test';
const GROUP_B1 = 'grp_b_test';

const USER_OWNER_A = 'user_owner_a';
const USER_MEMBER_A_OKA = 'user_member_a_okayama';
const USER_MEMBER_A_HIRO = 'user_member_a_hiroshima';
const USER_OWNER_B = 'user_owner_b';
const USER_INACTIVE = 'user_inactive';

// ────────────────────────────────────────────────────────────────────
// 2. テスト全体の setup: in-memory DB を起動 + 必要テーブル作成 + fixture 投入
// ────────────────────────────────────────────────────────────────────
let realClient: Client;

beforeAll(async () => {
  realClient = createClient({ url: 'file::memory:?cache=shared' });
  const realDb = drizzle(realClient, { schema });
  // mock module から参照される globalThis 経由の差し込み
   
  (globalThis as any).__TEST_DB__ = realDb;

  // -- 最低限必要なテーブルのみ作成（guards.ts が触る範囲）
  // users / organizations / groups / memberships / group_memberships / expenses
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

  // -- fixture 投入
  await realDb.insert(schema.organizations).values([
    {
      id: ORG_A,
      slug: 'org-a',
      kind: 'tennis_club',
      name: 'Test Org A',
      fiscalYearStartMonth: 4,
    },
    {
      id: ORG_B,
      slug: 'org-b',
      kind: 'community',
      name: 'Test Org B',
      fiscalYearStartMonth: 4,
    },
  ]);

  await realDb.insert(schema.groups).values([
    { id: GROUP_A1, organizationId: ORG_A, kind: 'prefecture', code: 'okayama', name: 'A岡山' },
    { id: GROUP_A2, organizationId: ORG_A, kind: 'prefecture', code: 'hiroshima', name: 'A広島' },
    { id: GROUP_B1, organizationId: ORG_B, kind: 'team', code: 'b1', name: 'B Team1' },
  ]);

  await realDb.insert(schema.users).values([
    { id: USER_OWNER_A, email: 'owner-a@test.local', name: 'Owner A', isActive: true },
    {
      id: USER_MEMBER_A_OKA,
      email: 'member-a-oka@test.local',
      name: 'Member A Okayama',
      isActive: true,
    },
    {
      id: USER_MEMBER_A_HIRO,
      email: 'member-a-hiro@test.local',
      name: 'Member A Hiroshima',
      isActive: true,
    },
    { id: USER_OWNER_B, email: 'owner-b@test.local', name: 'Owner B', isActive: true },
    {
      id: USER_INACTIVE,
      email: 'inactive@test.local',
      name: 'Inactive',
      isActive: false,
    },
  ]);

  await realDb.insert(schema.memberships).values([
    { id: ulid(), userId: USER_OWNER_A, organizationId: ORG_A, role: 'owner' },
    { id: ulid(), userId: USER_MEMBER_A_OKA, organizationId: ORG_A, role: 'member' },
    { id: ulid(), userId: USER_MEMBER_A_HIRO, organizationId: ORG_A, role: 'member' },
    { id: ulid(), userId: USER_OWNER_B, organizationId: ORG_B, role: 'owner' },
  ]);

  await realDb.insert(schema.groupMemberships).values([
    { id: ulid(), userId: USER_MEMBER_A_OKA, groupId: GROUP_A1, role: 'member' },
    { id: ulid(), userId: USER_MEMBER_A_HIRO, groupId: GROUP_A2, role: 'member' },
  ]);
});

afterAll(async () => {
  realClient?.close();
});

// ────────────────────────────────────────────────────────────────────
// 3. 実テスト
// ────────────────────────────────────────────────────────────────────
describe('auth guards (integration)', () => {
  it('requireUser throws AuthError(401) when no session', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const { requireUser } = await import('@/lib/auth/guards');
    await expect(requireUser()).rejects.toMatchObject({
      name: 'AuthError',
      status: 401,
    });
  });

  it('requireUser returns user when session exists', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_OWNER_A } });
    const { requireUser } = await import('@/lib/auth/guards');
    const u = await requireUser();
    expect(u.id).toBe(USER_OWNER_A);
    expect(u.email).toBe('owner-a@test.local');
  });

  it('requireUser rejects inactive user (401)', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_INACTIVE } });
    const { requireUser } = await import('@/lib/auth/guards');
    await expect(requireUser()).rejects.toMatchObject({
      name: 'AuthError',
      status: 401,
    });
  });

  it('requireOrganizationRole rejects other-org member (403)', async () => {
    // OwnerB が ORG_A に対して role を要求 → 403
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_OWNER_B } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    await expect(
      requireOrganizationRole(ORG_A, ['owner', 'admin', 'member']),
    ).rejects.toMatchObject({ name: 'AuthError', status: 403 });
  });

  it('requireOrganizationRole rejects insufficient role (403)', async () => {
    // member が owner-only エンドポイントへ
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_MEMBER_A_OKA } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    await expect(
      requireOrganizationRole(ORG_A, ['owner']),
    ).rejects.toMatchObject({ name: 'AuthError', status: 403 });
  });

  it('requireOrganizationRole returns AuthContext for valid member', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_MEMBER_A_OKA } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    const ctx = await requireOrganizationRole(ORG_A, ['owner', 'admin', 'member']);
    expect(ctx.organizationId).toBe(ORG_A);
    expect(ctx.orgRole).toBe('member');
    expect(ctx.user.id).toBe(USER_MEMBER_A_OKA);
    expect(ctx.visibleGroupIds).toContain(GROUP_A1);
    expect(ctx.visibleGroupIds).not.toContain(GROUP_A2);
    expect(ctx.managedGroupIds).toEqual([]);
  });

  it('requireOrganizationRole owner sees every group in org', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_OWNER_A } });
    const { requireOrganizationRole } = await import('@/lib/auth/guards');
    const ctx = await requireOrganizationRole(ORG_A, ['owner']);
    expect(ctx.orgRole).toBe('owner');
    expect(ctx.visibleGroupIds).toEqual(
      expect.arrayContaining([GROUP_A1, GROUP_A2]),
    );
  });

  it('requireGroupRole rejects member of a different group (403)', async () => {
    // 広島 member が 岡山 group の role を要求 → 403
    mockGetSession.mockResolvedValueOnce({ user: { id: USER_MEMBER_A_HIRO } });
    const { requireGroupRole } = await import('@/lib/auth/guards');
    await expect(
      requireGroupRole(GROUP_A1, ['manager', 'member']),
    ).rejects.toMatchObject({ name: 'AuthError', status: 403 });
  });

  // -- Phase 2 で本実装する追加ケース ---------------------------------
  it.todo('requireExpenseAccess: read 拒否（visible group 外、自分の申請でもない）');
  it.todo('requireExpenseAccess: write 拒否（owner でも manager でも admin でもない）');
});
