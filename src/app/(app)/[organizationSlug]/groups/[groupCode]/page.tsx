/**
 * グループ別ダッシュボード（Phase 1 polish 本実装）
 *
 * 認可: 該当 group が visibleGroupIds に含まれる場合のみ
 * 表示:
 *  - グループ名 + 予算ゲージ
 *  - 該当 group の最新 expenses 20 件
 *  - manager は「予算編集」リンクで /admin/budgets へ
 */
import Link from 'next/link';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups,
  budgets,
  expenses,
  users,
} from '@/lib/db/schema';
import { requireOrganizationRole } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BudgetGaugeBall } from '@/components/budget-gauge-ball';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { formatJpy } from '@/lib/utils/format-jpy';

export const metadata = { title: 'グループ' };

function currentFiscalYear(startMonth: number, now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= startMonth ? y : y - 1;
}

export default async function GroupDashboardPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; groupCode: string }>;
}) {
  const { organizationSlug, groupCode } = await params;

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  const org = orgRows[0];
  if (!org) notFound();

  let ctx;
  try {
    ctx = await requireOrganizationRole(org.id, ['owner', 'admin', 'member']);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 401) {
        redirect(
          `/login?next=/${organizationSlug}/groups/${encodeURIComponent(groupCode)}`,
        );
      }
      notFound();
    }
    throw e;
  }

  const groupRows = await db
    .select()
    .from(groups)
    .where(
      and(eq(groups.organizationId, org.id), eq(groups.code, groupCode)),
    )
    .limit(1);
  const group = groupRows[0];
  if (!group) notFound();

  // visible 判定（admin/owner はスキップ）
  const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
  if (!isAdmin && !ctx.visibleGroupIds.includes(group.id)) {
    notFound();
  }

  const isManager = ctx.managedGroupIds.includes(group.id);
  const fiscalYear = currentFiscalYear(org.fiscalYearStartMonth);

  const [budgetRows, expenseRows] = await Promise.all([
    db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.organizationId, org.id),
          eq(budgets.groupId, group.id),
          eq(budgets.fiscalYear, fiscalYear),
        ),
      )
      .limit(1),
    db
      .select({
        id: expenses.id,
        date: expenses.date,
        description: expenses.description,
        amountJpy: expenses.amountJpy,
        status: expenses.status,
        userName: users.name,
        userEmail: users.email,
      })
      .from(expenses)
      .innerJoin(users, eq(users.id, expenses.userId))
      .where(
        and(
          eq(expenses.organizationId, org.id),
          eq(expenses.groupId, group.id),
          eq(expenses.fiscalYear, fiscalYear),
        ),
      )
      .orderBy(desc(expenses.date), desc(expenses.createdAt))
      .limit(20),
  ]);

  const budget = budgetRows[0] ?? null;
  const isCharged = (s: string) =>
    s === 'charged_to_group' || s === 'charged_to_organization';

  // 全 expense の合計から消化額を計算（budget.usedAmountJpy より expense 集計の方が新鮮）
  const allCharged = await db
    .select({
      amountJpy: expenses.amountJpy,
      classification: expenses.classification,
      status: expenses.status,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, org.id),
        eq(expenses.groupId, group.id),
        eq(expenses.fiscalYear, fiscalYear),
        inArray(expenses.status, [
          'charged_to_group',
          'charged_to_organization',
        ]),
      ),
    );

  const usedFromGroup = allCharged
    .filter((e) => e.classification === 'group_funded' && isCharged(e.status))
    .reduce((s, e) => s + e.amountJpy, 0);

  const totalAmount = budget?.amountJpy ?? 0;

  const fmtDate = (d: Date | number) =>
    new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d instanceof Date ? d : new Date(d));

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-court-green">
            FY{fiscalYear}・{group.code.toUpperCase()}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {group.name}
          </h1>
          {isManager && (
            <p className="mt-1 text-xs text-muted-foreground">
              あなたはこのグループのマネージャです。
            </p>
          )}
        </div>
        {(isAdmin || isManager) && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${organizationSlug}/admin/budgets`}>予算を編集</Link>
          </Button>
        )}
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              グループ予算消化
            </h2>
            {totalAmount === 0 ? (
              <EmptyState
                title="予算が未設定です"
                description={
                  isAdmin || isManager
                    ? '「予算を編集」から FY の予算を作成できます'
                    : '管理者が予算を設定するまでお待ちください'
                }
              />
            ) : (
              <BudgetGaugeBall
                usedAmount={usedFromGroup}
                totalAmount={totalAmount}
                label="FY 通算"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              サマリ
            </h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">予算額</dt>
                <dd className="mt-1 text-lg font-semibold tabular">
                  {totalAmount > 0 ? formatJpy(totalAmount) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">消化額</dt>
                <dd className="mt-1 text-lg font-semibold tabular">
                  {formatJpy(usedFromGroup)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">残額</dt>
                <dd className="mt-1 text-lg font-semibold tabular">
                  {totalAmount > 0
                    ? formatJpy(Math.max(totalAmount - usedFromGroup, 0))
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">申請件数</dt>
                <dd className="mt-1 text-lg font-semibold tabular">
                  {expenseRows.length}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            最近の申請
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/${organizationSlug}/expenses?group=${group.id}`}
            >
              すべて見る
            </Link>
          </Button>
        </header>
        {expenseRows.length === 0 ? (
          <EmptyState
            title="まだ申請がありません"
            description="新規申請ボタンから最初の活動費を登録できます"
          />
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-stone-100/40 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium text-muted-foreground">
                      日付
                    </th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">
                      内容
                    </th>
                    <th className="px-4 py-2 font-medium text-muted-foreground tabular text-right">
                      金額
                    </th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">
                      申請者
                    </th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">
                      状態
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-b-0 hover:bg-stone-100/30"
                    >
                      <td className="px-4 py-2 align-top">
                        <Link
                          href={`/${organizationSlug}/expenses/${r.id}`}
                          className="block"
                        >
                          {fmtDate(r.date)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 align-top">
                        <Link
                          href={`/${organizationSlug}/expenses/${r.id}`}
                          className="block max-w-md truncate"
                        >
                          {r.description}
                        </Link>
                      </td>
                      <td className="px-4 py-2 align-top tabular text-right">
                        {formatJpy(r.amountJpy)}
                      </td>
                      <td className="px-4 py-2 align-top text-muted-foreground">
                        {r.userName?.trim() || r.userEmail}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
