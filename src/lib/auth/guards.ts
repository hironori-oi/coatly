/**
 * 認可ヘルパ（dev-technical-spec-v2.md §3.2）
 *
 * RLS 不在の代替として、Server Action / Route Handler の冒頭で必ず
 * これらのいずれかを呼び出す（無し = レビュー差戻）。
 *
 * - requireUser: 認証済みユーザーを取得
 * - requireOrganizationRole: 組織内の role を確認 + AuthContext を構築
 * - requireGroupRole: グループ内の role を確認
 * - requireExpenseAccess: 申請単位のアクセス権を確認
 */
import { eq, and } from 'drizzle-orm';
import { headers } from 'next/headers';
import { auth } from './better-auth';
import { db } from '@/lib/db/client';
import {
  users,
  memberships,
  groupMemberships,
  groups,
  expenses,
  type User,
  type OrgRole,
  type GroupRoleType,
  type Expense,
} from '@/lib/db/schema';
import { unauthorized, forbidden, notFound } from '@/lib/errors';

export type AuthContext = {
  user: User;
  organizationId: string;
  orgRole: OrgRole;
  /** admin/owner なら組織内全 group、member なら所属 group のみ */
  visibleGroupIds: string[];
  /** role='manager' の group のみ */
  managedGroupIds: string[];
};

/**
 * 認証済みユーザーを取得する。未ログインなら 401。
 */
export async function requireUser(): Promise<User> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw unauthorized();
  }
  const u = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!u[0] || !u[0].isActive) throw unauthorized();
  return u[0];
}

/**
 * 組織内の role を確認する。所属していない or 許可 role でないなら 403。
 *
 * @returns AuthContext（visible / managed group ids 含む）
 */
export async function requireOrganizationRole(
  organizationId: string,
  allowedRoles: OrgRole[],
): Promise<AuthContext> {
  const user = await requireUser();

  const m = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!m[0] || !allowedRoles.includes(m[0].role)) {
    throw forbidden();
  }

  const isAdmin = m[0].role === 'owner' || m[0].role === 'admin';

  // visible / managed group の解決
  const gms = await db
    .select({
      groupId: groupMemberships.groupId,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.userId, user.id),
        eq(groups.organizationId, organizationId),
      ),
    );

  let visibleGroupIds: string[];
  if (isAdmin) {
    const all = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.organizationId, organizationId));
    visibleGroupIds = all.map((r) => r.id);
  } else {
    visibleGroupIds = gms.map((g) => g.groupId);
  }

  const managedGroupIds = gms
    .filter((g) => g.role === 'manager')
    .map((g) => g.groupId);

  return {
    user,
    organizationId,
    orgRole: m[0].role,
    visibleGroupIds,
    managedGroupIds,
  };
}

/**
 * グループ内の role を確認する。
 */
export async function requireGroupRole(
  groupId: string,
  allowedRoles: GroupRoleType[],
): Promise<{ user: User; role: GroupRoleType }> {
  const user = await requireUser();
  const gm = await db
    .select()
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, user.id),
        eq(groupMemberships.groupId, groupId),
      ),
    )
    .limit(1);

  if (!gm[0] || !allowedRoles.includes(gm[0].role)) {
    throw forbidden();
  }
  return { user, role: gm[0].role };
}

/**
 * 申請単位のアクセス権を確認する。
 *
 * - mode='read':  visible group の expense or 自分の申請
 * - mode='write': 自分の申請（draft/rejected）or manager/admin
 */
export async function requireExpenseAccess(
  expenseId: string,
  mode: 'read' | 'write',
): Promise<{ ctx: AuthContext; expense: Expense }> {
  const user = await requireUser();
  const e = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (!e[0]) throw notFound();

  const ctx = await requireOrganizationRole(e[0].organizationId, [
    'owner',
    'admin',
    'member',
  ]);

  const isOwner = e[0].userId === user.id;
  const isManager = ctx.managedGroupIds.includes(e[0].groupId);
  const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';

  if (mode === 'write') {
    if (!isOwner && !isManager && !isAdmin) throw forbidden();
  } else {
    if (!ctx.visibleGroupIds.includes(e[0].groupId) && !isOwner) {
      throw forbidden();
    }
  }
  return { ctx, expense: e[0] };
}
