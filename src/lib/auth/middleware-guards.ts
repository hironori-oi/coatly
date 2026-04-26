/**
 * Middleware (Next 16 proxy) 専用の薄いガード関数群
 *
 * 設計方針 (DEC-042):
 * - page-level の `requireXxx` (guards.ts) とは責務分離する。
 *   page 用は `forbidden()` / `unauthorized()` を throw するが、Next 16 の
 *   nested layout / page では status 200 が返る仕様 (issue #83671) のため、
 *   middleware で HTTP status を確定させる必要がある。
 * - middleware は全ての非公開ルートで走るため、軽量 SQL のみ使用する
 *   (id → role / userId / groupId だけ取得し、JOIN は最小限に)。
 * - Better Auth の session は `auth.api.getSession({ headers: req.headers })`
 *   で proxy から直接取得できる。cookieCache が効くため通常 DB hit しない。
 */
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from './better-auth';
import { db } from '@/lib/db/client';
import {
  organizations,
  memberships,
  groupMemberships,
  expenses,
  type OrgRole,
} from '@/lib/db/schema';

export type MiddlewareSession = { user: { id: string } };

/**
 * proxy 経由で Better Auth session を取得する。
 * cookieCache が効いている場合は DB hit せず session 復元できる。
 */
export async function getMiddlewareSession(
  req: NextRequest,
): Promise<MiddlewareSession | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return null;
    return { user: { id: session.user.id } };
  } catch {
    // cookie 不正 / DB 一時 down 等は未ログイン扱いに倒す（fail-safe）
    return null;
  }
}

/**
 * 組織 slug から user の orgRole を解決する。
 * - 組織が存在しない / 当該 user が membership を持たない → null
 * - それ以外 → 'owner' | 'admin' | 'member'
 *
 * 1 SQL: organizations.slug = ? に対して memberships を innerJoin で引き当て。
 */
export async function getOrgRole(
  userId: string,
  orgSlug: string,
): Promise<{ orgId: string; role: OrgRole } | null> {
  const rows = await db
    .select({
      orgId: organizations.id,
      role: memberships.role,
    })
    .from(organizations)
    .leftJoin(
      memberships,
      and(
        eq(memberships.organizationId, organizations.id),
        eq(memberships.userId, userId),
      ),
    )
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!rows[0]) return null;
  // org は存在するが当該 user が membership を持たない
  if (!rows[0].role) return null;
  return { orgId: rows[0].orgId, role: rows[0].role };
}

export type ExpenseAccessResult = 'allowed' | 'forbidden' | 'not-found';

/**
 * expense の read / write 権限を middleware から判定する。
 *
 * 前提:
 *  - read:  visible group の expense or 自分の申請
 *  - write: 自分の申請 (status は middleware では check しない、page 側で判定)
 *           or manager group の expense or org admin/owner
 *
 * 戻り値:
 *  - 'not-found': 当該 org に当該 expense が存在しない
 *                 (org slug 不一致を含む = 別組織への直叩き)
 *  - 'forbidden': expense は存在するが当該 user に権限なし
 *  - 'allowed':   middleware では通過
 */
export async function checkExpenseAccess(
  userId: string,
  orgSlug: string,
  expenseId: string,
  mode: 'read' | 'write',
): Promise<ExpenseAccessResult> {
  // 1. org + expense + actor membership を 1 round-trip で取得
  const rows = await db
    .select({
      orgId: organizations.id,
      expenseUserId: expenses.userId,
      expenseGroupId: expenses.groupId,
      expenseOrgId: expenses.organizationId,
      orgRole: memberships.role,
    })
    .from(organizations)
    .leftJoin(expenses, eq(expenses.id, expenseId))
    .leftJoin(
      memberships,
      and(
        eq(memberships.organizationId, organizations.id),
        eq(memberships.userId, userId),
      ),
    )
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  const row = rows[0];
  // org slug 不一致 or expense 不在 or expense が別 org → not-found
  if (!row) return 'not-found';
  if (!row.expenseUserId || !row.expenseGroupId) return 'not-found';
  if (row.expenseOrgId !== row.orgId) return 'not-found';

  // 当該 user が組織 member ですらない → forbidden
  if (!row.orgRole) return 'forbidden';

  const isOwner = row.expenseUserId === userId;
  const isOrgAdmin = row.orgRole === 'owner' || row.orgRole === 'admin';

  if (isOwner || isOrgAdmin) return 'allowed';

  // 2. group visibility / manager 判定
  const gms = await db
    .select({ groupId: groupMemberships.groupId, role: groupMemberships.role })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.groupId, row.expenseGroupId),
      ),
    )
    .limit(1);

  const gm = gms[0];
  if (!gm) return 'forbidden';

  if (mode === 'read') return 'allowed';
  // write: manager only (本人 case は上で allowed 済)
  return gm.role === 'manager' ? 'allowed' : 'forbidden';
}
