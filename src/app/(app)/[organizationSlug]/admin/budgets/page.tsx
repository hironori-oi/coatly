/**
 * 予算管理（admin / Phase 1 polish 本実装）
 *
 * 認可: parent layout (admin/layout.tsx) で owner/admin のみ通している。
 * 表示:
 *   - 行 = 「組織全体」+ 各 group
 *   - 列 = 予算額 / 消化額 / 残額 / 消化率
 *   - 「編集」ボタン → モーダルで予算額変更
 *   - 未作成行は「作成」ボタンで初期額入力モーダル
 */
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups,
  budgets,
  expenses,
} from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { BudgetEditor } from './budget-editor';

export const metadata = { title: '予算管理' };

function currentFiscalYear(startMonth: number, now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= startMonth ? y : y - 1;
}

export default async function AdminBudgetsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  const org = orgRows[0];
  if (!org) notFound();

  const fiscalYear = currentFiscalYear(org.fiscalYearStartMonth);

  // 全グループ
  const allGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.organizationId, org.id))
    .orderBy(groups.displayOrder);

  // 当 FY の予算
  const budgetRows = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.organizationId, org.id),
        eq(budgets.fiscalYear, fiscalYear),
      ),
    );

  // 行を生成（全体 + 各 group）
  type Row = {
    scopeKey: string;
    scopeLabel: string;
    groupId: string | null;
    budget: (typeof budgetRows)[number] | null;
    used: number;
  };

  // 承認済み expense の合計 = budget.used_amount_jpy が信頼できる値だが、
  // 一覧表示では budget レコード未作成の group も「消化額」を見たいので
  // expenses から補助計算する。
  const approvedExpenses = await db
    .select({
      groupId: expenses.groupId,
      classification: expenses.classification,
      amountJpy: expenses.amountJpy,
      status: expenses.status,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, org.id),
        eq(expenses.fiscalYear, fiscalYear),
      ),
    );

  const isCharged = (s: string) =>
    s === 'charged_to_group' || s === 'charged_to_organization';

  let orgUsed = 0;
  const groupUsedMap = new Map<string, number>();
  for (const e of approvedExpenses) {
    if (!isCharged(e.status)) continue;
    if (e.classification === 'organization_funded') {
      orgUsed += e.amountJpy;
    } else if (e.classification === 'group_funded') {
      groupUsedMap.set(
        e.groupId,
        (groupUsedMap.get(e.groupId) ?? 0) + e.amountJpy,
      );
    }
  }

  const orgBudget = budgetRows.find((b) => b.groupId === null) ?? null;
  const rows: Row[] = [
    {
      scopeKey: 'organization',
      scopeLabel: `${org.name}（組織全体）`,
      groupId: null,
      budget: orgBudget,
      used: orgUsed,
    },
    ...allGroups.map<Row>((g) => ({
      scopeKey: g.id,
      scopeLabel: g.name,
      groupId: g.id,
      budget: budgetRows.find((b) => b.groupId === g.id) ?? null,
      used: groupUsedMap.get(g.id) ?? 0,
    })),
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-court-green">
          FY{fiscalYear}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">予算管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          組織全体および各グループの年度予算を管理します。
        </p>
      </header>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-stone-100/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  対象
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground tabular text-right">
                  予算額
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground tabular text-right">
                  消化額
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground tabular text-right">
                  残額
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  消化率
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <BudgetRow
                  key={r.scopeKey}
                  scopeLabel={r.scopeLabel}
                  groupId={r.groupId}
                  organizationId={org.id}
                  fiscalYear={fiscalYear}
                  budgetId={r.budget?.id ?? null}
                  amount={r.budget?.amountJpy ?? null}
                  used={r.budget?.usedAmountJpy ?? r.used}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function BudgetRow({
  scopeLabel,
  groupId,
  organizationId,
  fiscalYear,
  budgetId,
  amount,
  used,
}: {
  scopeLabel: string;
  groupId: string | null;
  organizationId: string;
  fiscalYear: number;
  budgetId: string | null;
  amount: number | null;
  used: number;
}) {
  const remaining = amount !== null ? Math.max(amount - used, 0) : 0;
  const ratio =
    amount !== null && amount > 0 ? Math.min(used / amount, 1) : 0;
  const fmt = (v: number) => `¥${v.toLocaleString('ja-JP')}`;
  const ratioBarColor =
    ratio >= 1
      ? 'bg-danger'
      : ratio >= 0.8
        ? 'bg-court-green'
        : 'bg-court-green/70';

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 align-middle">
        <span className="font-medium">{scopeLabel}</span>
      </td>
      <td className="px-4 py-3 align-middle tabular text-right">
        {amount !== null ? (
          fmt(amount)
        ) : (
          <span className="text-muted-foreground">未設定</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle tabular text-right">{fmt(used)}</td>
      <td className="px-4 py-3 align-middle tabular text-right">
        {amount !== null ? fmt(remaining) : '—'}
      </td>
      <td className="px-4 py-3 align-middle">
        {amount !== null ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full ${ratioBarColor}`}
                style={{ width: `${ratio * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="tabular text-xs text-muted-foreground">
              {(ratio * 100).toFixed(0)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle text-right">
        <BudgetEditor
          organizationId={organizationId}
          fiscalYear={fiscalYear}
          groupId={groupId}
          budgetId={budgetId}
          currentAmount={amount}
          scopeLabel={scopeLabel}
          minAmount={used}
        />
      </td>
    </tr>
  );
}
