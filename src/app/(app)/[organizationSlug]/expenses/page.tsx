/**
 * 活動費一覧（W2-B 本実装）
 *
 * - Server Component で scopedExpenses(ctx) から visible expense をロード
 * - status / group / fiscalYear で簡易フィルタ（searchParams）
 * - 行クリックで詳細へ遷移
 */
import Link from 'next/link';
import { desc, eq, and, inArray } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups,
  users,
  expenses,
  EXPENSE_STATUS,
  type ExpenseStatus,
} from '@/lib/db/schema';
import { requireOrganizationRole } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { formatJpy } from '@/lib/utils/format-jpy';

export const metadata = {
  title: '活動費',
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'すべての状態' },
  { value: 'draft', label: '下書き' },
  { value: 'submitted', label: '承認待ち' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '差戻' },
  { value: 'charged_to_group', label: '県充当' },
  { value: 'charged_to_organization', label: '本部充当' },
] as const;

function isExpenseStatus(v: string): v is ExpenseStatus {
  return (EXPENSE_STATUS as readonly string[]).includes(v);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export default async function ExpensesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{
    status?: string;
    group?: string;
  }>;
}) {
  const { organizationSlug } = await params;
  const sp = await searchParams;

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  if (!orgRows[0]) notFound();
  const orgId = orgRows[0].id;

  let visibleGroupIds: string[];
  let isAdmin: boolean;
  try {
    const ctx = await requireOrganizationRole(orgId, [
      'owner',
      'admin',
      'member',
    ]);
    visibleGroupIds = ctx.visibleGroupIds;
    isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 401)
        redirect(`/login?next=/${organizationSlug}/expenses`);
      notFound();
    }
    throw e;
  }

  // フィルタ条件
  const statusFilter =
    sp.status && isExpenseStatus(sp.status) ? sp.status : undefined;

  const groupFilter = sp.group ?? undefined;

  // group 一覧（フィルタ用）
  const groupRows = isAdmin
    ? await db
        .select()
        .from(groups)
        .where(eq(groups.organizationId, orgId))
        .orderBy(groups.displayOrder)
    : visibleGroupIds.length > 0
      ? await db
          .select()
          .from(groups)
          .where(
            and(
              eq(groups.organizationId, orgId),
              inArray(groups.id, visibleGroupIds),
            ),
          )
          .orderBy(groups.displayOrder)
      : [];

  // expense 取得（scopedExpenses 相当を inline 実装、role 込み）
  const conditions = [eq(expenses.organizationId, orgId)];
  if (!isAdmin) {
    conditions.push(
      inArray(
        expenses.groupId,
        visibleGroupIds.length ? visibleGroupIds : ['__none__'],
      ),
    );
  }
  if (statusFilter) conditions.push(eq(expenses.status, statusFilter));
  if (groupFilter) conditions.push(eq(expenses.groupId, groupFilter));

  const rows = await db
    .select({
      id: expenses.id,
      date: expenses.date,
      description: expenses.description,
      amountJpy: expenses.amountJpy,
      status: expenses.status,
      classification: expenses.classification,
      groupId: expenses.groupId,
      userId: expenses.userId,
      groupName: groups.name,
      groupCode: groups.code,
      userName: users.name,
      userEmail: users.email,
    })
    .from(expenses)
    .innerJoin(groups, eq(groups.id, expenses.groupId))
    .innerJoin(users, eq(users.id, expenses.userId))
    .where(and(...conditions))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">活動費</h1>
        <Button asChild variant="accent">
          <Link href={`/${organizationSlug}/expenses/new`}>新規申請</Link>
        </Button>
      </header>

      {/* フィルタ */}
      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            状態
          </label>
          <select
            name="status"
            defaultValue={statusFilter ?? ''}
            className="flex h-9 rounded-md border border-border bg-card px-3 text-sm"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {groupRows.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              グループ
            </label>
            <select
              name="group"
              defaultValue={groupFilter ?? ''}
              className="flex h-9 rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">すべて</option>
              {groupRows.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="outline" size="sm">
          絞り込む
        </Button>
        {(statusFilter || groupFilter) && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${organizationSlug}/expenses`}>クリア</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="該当する申請はありません"
          description="右上の「新規申請」から最初の活動費を登録できます"
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-stone-100/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  日付
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  内容
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground tabular">
                  金額
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  グループ
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
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-b-0 hover:bg-stone-100/30"
                >
                  <td className="px-4 py-2 align-top">
                    <Link
                      href={`/${organizationSlug}/expenses/${r.id}`}
                      className="block"
                    >
                      {formatDate(new Date(r.date))}
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
                    <Link
                      href={`/${organizationSlug}/expenses/${r.id}`}
                      className="block"
                    >
                      {formatJpy(r.amountJpy)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 align-top text-muted-foreground">
                    {r.groupName}
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
        </Card>
      )}
    </div>
  );
}
