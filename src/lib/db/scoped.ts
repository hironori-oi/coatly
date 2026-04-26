/**
 * Scoped クエリヘルパ（dev-technical-spec-v2.md §3.3）
 *
 * RLS 不在の代替として、認可済み AuthContext から派生したクエリのみ
 * 許可する。生 db.select().from(expenses) は ESLint で禁止し、
 * 必ずこのヘルパ経由でアクセスする。
 *
 * 実際のクエリ実行は呼び出し側の `.where()` `.orderBy()` 等を続けて行う。
 *
 * W2-B 追加:
 * - findBudgetForExpense: 充当先 budget を一意に取得
 * - getCurrentFiscalYear: 組織の年度開始月から現在年度を算出
 */
import { db } from './client';
import {
  expenses,
  budgets,
  groups,
  organizations,
  groupMemberships,
  memberships,
  users,
  type Organization,
} from './schema';
import { and, eq, inArray, isNull, sql, or } from 'drizzle-orm';
import type { AuthContext } from '@/lib/auth/guards';
import type { ExpenseClassification } from './schema';

/**
 * 認可済み AuthContext からのみ expenses にアクセスできるヘルパ。
 *
 * - admin/owner: 組織内全件
 * - member:      visible group のみ（自分の申請を含む）
 *
 * 空の visibleGroupIds の場合は `__none__` を渡して常に 0 件にする
 * （誤って全件返さないためのフェイルセーフ）。
 */
export function scopedExpenses(ctx: AuthContext) {
  const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, ctx.organizationId),
        isAdmin
          ? sql`1=1`
          : inArray(
              expenses.groupId,
              ctx.visibleGroupIds.length ? ctx.visibleGroupIds : ['__none__'],
            ),
      ),
    );
}

export function scopedBudgets(ctx: AuthContext) {
  return db
    .select()
    .from(budgets)
    .where(eq(budgets.organizationId, ctx.organizationId));
}

export function scopedGroups(ctx: AuthContext) {
  const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
  return db
    .select()
    .from(groups)
    .where(
      and(
        eq(groups.organizationId, ctx.organizationId),
        isAdmin
          ? sql`1=1`
          : inArray(
              groups.id,
              ctx.visibleGroupIds.length ? ctx.visibleGroupIds : ['__none__'],
            ),
      ),
    );
}

/**
 * 組織の年度開始月（fiscalYearStartMonth）と「今日」から
 * 現在の会計年度（西暦）を計算する。
 *
 * 例: 開始月=4 / 今日=2026-04-26 → 2026
 *     開始月=4 / 今日=2026-03-15 → 2025
 *     開始月=1 / 今日=2026-12-31 → 2026
 */
export function computeFiscalYear(
  org: Pick<Organization, 'fiscalYearStartMonth'>,
  today: Date = new Date(),
): number {
  const startMonth = org.fiscalYearStartMonth ?? 4;
  const month = today.getMonth() + 1; // 1-12
  const year = today.getFullYear();
  return month >= startMonth ? year : year - 1;
}

/**
 * 経費の classification + groupId に対応する充当先 budget を取得する。
 *
 * - group_funded         → fiscal_year × group_id に一致する budget
 * - organization_funded  → fiscal_year × group_id IS NULL に一致する budget
 * - personal             → null (自己負担、budget 加減算なし)
 */
export async function findBudgetForExpense(input: {
  organizationId: string;
  fiscalYear: number;
  groupId: string;
  classification: ExpenseClassification;
}) {
  if (input.classification === 'personal') return null;

  const groupCondition =
    input.classification === 'group_funded'
      ? eq(budgets.groupId, input.groupId)
      : isNull(budgets.groupId);

  const rows = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.organizationId, input.organizationId),
        eq(budgets.fiscalYear, input.fiscalYear),
        groupCondition,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * 組織を id で取得（fiscal year 計算用）。
 */
export async function getOrganizationById(
  organizationId: string,
): Promise<Organization | null> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 申請を承認できる recipient（manager + organization admin/owner）を取得する。
 *
 * - groupMemberships.role='manager' で対象 group に所属するユーザー
 * - memberships.role='admin' または 'owner' の組織内ユーザー
 *
 * 重複は email で deduplicate。申請者本人は除外する。
 */
export async function getApproverContacts(input: {
  organizationId: string;
  groupId: string;
  excludeUserId: string;
}): Promise<{ id: string; email: string; name: string }[]> {
  // group manager
  const managers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(
      and(
        eq(groupMemberships.groupId, input.groupId),
        eq(groupMemberships.role, 'manager'),
      ),
    );

  // org admin / owner
  const admins = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        or(
          eq(memberships.role, 'owner'),
          eq(memberships.role, 'admin'),
        ),
      ),
    );

  const map = new Map<string, { id: string; email: string; name: string }>();
  for (const u of [...managers, ...admins]) {
    if (!u.email) continue;
    if (u.id === input.excludeUserId) continue;
    if (!map.has(u.email)) {
      map.set(u.email, { id: u.id, email: u.email, name: u.name ?? '' });
    }
  }
  return Array.from(map.values());
}
