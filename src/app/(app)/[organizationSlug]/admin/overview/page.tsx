/**
 * 全体管理ビュー（admin / Phase 1 polish 本実装）
 *
 * 上段: KPI（年度予算 / 消化額 / 残額 / 申請件数）
 * 中段: 月次推移チャート（Recharts）
 * 下段: グループランキング & ステータス内訳 & CSV エクスポート
 */
import Link from 'next/link';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups,
  budgets,
  expenses,
} from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/kpi-card';
import { MonthlyTrendChart } from './monthly-trend-chart';

export const metadata = { title: '全体管理' };

const STATUS_LABEL: Record<string, string> = {
  draft: '下書き',
  submitted: '申請中',
  approved: '承認済み',
  rejected: '差戻',
  withdrawn: '取下げ',
  charged_to_group: '部内計上',
  charged_to_organization: '組織計上',
};

function currentFiscalYear(startMonth: number, now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= startMonth ? y : y - 1;
}

export default async function AdminOverviewPage({
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
  const fyStart = org.fiscalYearStartMonth;

  const [allGroups, fyBudgets, fyExpenses] = await Promise.all([
    db
      .select()
      .from(groups)
      .where(eq(groups.organizationId, org.id))
      .orderBy(groups.displayOrder),
    db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.organizationId, org.id),
          eq(budgets.fiscalYear, fiscalYear),
        ),
      ),
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, org.id),
          eq(expenses.fiscalYear, fiscalYear),
        ),
      ),
  ]);

  const totalBudget = fyBudgets.reduce((s, b) => s + b.amountJpy, 0);
  const isCharged = (s: string) =>
    s === 'charged_to_group' || s === 'charged_to_organization';
  const consumed = fyExpenses
    .filter((e) => isCharged(e.status))
    .reduce((s, e) => s + e.amountJpy, 0);
  const remaining = Math.max(totalBudget - consumed, 0);
  const submissionCount = fyExpenses.length;

  // 月次推移（FY 開始月から 12 ヶ月）
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = ((fyStart - 1 + i) % 12) + 1;
    return {
      label: `${m}月`,
      monthIndex: i,
      month: m,
      budget: totalBudget / 12,
      used: 0,
    };
  });

  for (const e of fyExpenses) {
    if (!isCharged(e.status)) continue;
    const d = e.date instanceof Date ? e.date : new Date(e.date as number);
    const month = d.getMonth() + 1;
    // FY 開始月から何ヶ月目か
    const offset = (month - fyStart + 12) % 12;
    if (monthlyData[offset]) {
      monthlyData[offset].used += e.amountJpy;
    }
  }

  // グループランキング
  const groupBudgetMap = new Map<string, number>();
  for (const b of fyBudgets) {
    if (b.groupId) {
      groupBudgetMap.set(b.groupId, b.amountJpy);
    }
  }
  const groupUsedMap = new Map<string, number>();
  for (const e of fyExpenses) {
    if (!isCharged(e.status)) continue;
    if (e.classification === 'group_funded') {
      groupUsedMap.set(
        e.groupId,
        (groupUsedMap.get(e.groupId) ?? 0) + e.amountJpy,
      );
    }
  }
  const ranking = allGroups
    .map((g) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      budget: groupBudgetMap.get(g.id) ?? 0,
      used: groupUsedMap.get(g.id) ?? 0,
      ratio:
        (groupBudgetMap.get(g.id) ?? 0) > 0
          ? Math.min(
              (groupUsedMap.get(g.id) ?? 0) / (groupBudgetMap.get(g.id) ?? 1),
              1,
            )
          : 0,
    }))
    .sort((a, b) => b.used - a.used);

  // ステータス内訳
  const statusCounts = new Map<string, number>();
  for (const e of fyExpenses) {
    statusCounts.set(e.status, (statusCounts.get(e.status) ?? 0) + 1);
  }
  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-court-green">
            FY{fiscalYear}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            全体管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            組織全体の予算・消化状況と CSV エクスポート。
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/api/export/expenses?fy=${fiscalYear}`}
            prefetch={false}
          >
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
            CSV エクスポート
          </Link>
        </Button>
      </header>

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="主要 KPI"
      >
        <KpiCard label="年度予算" value={totalBudget} format="jpy" />
        <KpiCard label="消化額" value={consumed} format="jpy" />
        <KpiCard label="残額" value={remaining} format="jpy" />
        <KpiCard label="申請件数" value={submissionCount} format="number" />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          月次推移
        </h2>
        <Card>
          <CardContent className="p-4">
            <MonthlyTrendChart
              data={monthlyData.map((m) => ({
                label: m.label,
                budget: Math.round(m.budget),
                used: m.used,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            グループ別ランキング
          </h2>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-stone-100/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      グループ
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground tabular text-right">
                      消化額
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      消化率
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-xs text-muted-foreground"
                      >
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    ranking.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-4 py-3 align-middle font-medium">
                          {r.name}
                        </td>
                        <td className="px-4 py-3 align-middle tabular text-right">
                          ¥{r.used.toLocaleString('ja-JP')}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-stone-100">
                              <div
                                className={`h-full ${
                                  r.ratio >= 1
                                    ? 'bg-danger'
                                    : 'bg-court-green/70'
                                }`}
                                style={{ width: `${r.ratio * 100}%` }}
                                aria-hidden="true"
                              />
                            </div>
                            <span className="tabular text-xs text-muted-foreground">
                              {(r.ratio * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            ステータス内訳
          </h2>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-stone-100/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      ステータス
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground tabular text-right">
                      件数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {statusBreakdown.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-6 text-center text-xs text-muted-foreground"
                      >
                        申請がありません
                      </td>
                    </tr>
                  ) : (
                    statusBreakdown.map((s) => (
                      <tr
                        key={s.status}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-4 py-3 align-middle">
                          {STATUS_LABEL[s.status] ?? s.status}
                        </td>
                        <td className="px-4 py-3 align-middle tabular text-right font-medium">
                          {s.count}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
