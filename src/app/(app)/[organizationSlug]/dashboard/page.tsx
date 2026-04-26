/**
 * 組織ダッシュボード（W2-C 本実装）
 *
 * 上段 KPI 4 件 → 中段（左: 中国地方マップ / 右: テニスボールゲージ）→ 下段 最近の活動。
 *
 * - Server Component で実データを直接 db から読む
 * - 認可は parent layout の requireOrganizationRole で済んでいるため、ここでは
 *   organizationSlug → organizationId を再解決し、scoped クエリで取得する
 *   （ガード自体は重複呼び出しても副作用なし、AuthContext を再利用する形）
 * - 期間は organizations.fiscalYearStartMonth を踏まえた現会計年度
 *
 * 触らない領域: src/lib/actions / src/components/receipt-dropzone / src/components/status-badge
 */
import { notFound, redirect } from 'next/navigation';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups as groupsTable,
  budgets,
  expenses,
} from '@/lib/db/schema';
import { requireOrganizationRole } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { KpiCard } from '@/components/kpi-card';
import { BudgetGaugeBall } from '@/components/budget-gauge-ball';
import { GroupMap, type GroupMapDatum } from '@/components/group-map';
import { EmptyState } from '@/components/empty-state';
import { formatJpy } from '@/lib/utils/format-jpy';

export const metadata = {
  title: 'ダッシュボード',
};

/**
 * 現会計年度を計算する。fiscalYearStartMonth=4 (4月始まり) なら
 *  - 4月〜12月 → その年
 *  - 1月〜3月 → 前年
 */
function currentFiscalYear(startMonth: number, now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  return m >= startMonth ? y : y - 1;
}

type DashboardData = {
  organizationKind: string;
  organizationName: string;
  fiscalYear: number;
  totalBudget: number;
  consumed: number;
  remaining: number;
  monthlyExpenseCount: number;
  groups: GroupMapDatum[];
  recentActivities: Array<{
    id: string;
    description: string;
    amount: number;
    status: string;
    date: number; // unix sec
    groupName: string;
  }>;
};

async function loadDashboard(
  organizationSlug: string,
): Promise<DashboardData | null> {
  // organization 解決
  const orgRows = await db
    .select({
      id: organizations.id,
      kind: organizations.kind,
      name: organizations.name,
      fyStart: organizations.fiscalYearStartMonth,
    })
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  const org = orgRows[0];
  if (!org) return null;

  // 認可（parent layout で実施済みだが、scoped 用 ctx を取得する）
  // 同じガードを再呼び出ししても idempotent。
  const ctx = await requireOrganizationRole(org.id, [
    'owner',
    'admin',
    'member',
  ]);

  const fiscalYear = currentFiscalYear(org.fyStart);

  // 全 groups をロード（admin/owner=全件、member=visible）
  const allGroups = await db
    .select({
      id: groupsTable.id,
      code: groupsTable.code,
      name: groupsTable.name,
      displayOrder: groupsTable.displayOrder,
    })
    .from(groupsTable)
    .where(eq(groupsTable.organizationId, org.id))
    .orderBy(groupsTable.displayOrder);

  const visibleGroupIds = new Set(ctx.visibleGroupIds);
  const visibleGroups = allGroups.filter(
    (g) =>
      ctx.orgRole === 'owner' ||
      ctx.orgRole === 'admin' ||
      visibleGroupIds.has(g.id),
  );

  // 当該 FY の budgets（groupId は null = 全体予算 + 各 group）
  // 必要カラムのみ select（used_amount_jpy 等の migration 不整合を避ける）
  const fyBudgets = await db
    .select({
      id: budgets.id,
      groupId: budgets.groupId,
      amountJpy: budgets.amountJpy,
    })
    .from(budgets)
    .where(
      and(
        eq(budgets.organizationId, org.id),
        eq(budgets.fiscalYear, fiscalYear),
      ),
    );

  const totalBudget = fyBudgets.reduce((sum, b) => sum + b.amountJpy, 0);

  // 承認済み expenses の合計（status: approved / charged_to_group / charged_to_organization）
  const approvedStatuses = [
    'approved',
    'charged_to_group',
    'charged_to_organization',
  ] as const;
  type ApprovedStatus = (typeof approvedStatuses)[number];
  const isApproved = (s: string): s is ApprovedStatus =>
    (approvedStatuses as readonly string[]).includes(s);

  const allFyExpenses = await db
    .select({
      id: expenses.id,
      groupId: expenses.groupId,
      userId: expenses.userId,
      description: expenses.description,
      amountJpy: expenses.amountJpy,
      status: expenses.status,
      date: expenses.date,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, org.id),
        eq(expenses.fiscalYear, fiscalYear),
      ),
    );

  // member は visible group のみ消化額に算入
  const consumed = allFyExpenses
    .filter(
      (e) =>
        isApproved(e.status) &&
        (ctx.orgRole === 'owner' ||
          ctx.orgRole === 'admin' ||
          visibleGroupIds.has(e.groupId)),
    )
    .reduce((sum, e) => sum + e.amountJpy, 0);

  // 当月の申請数（全 status / scoped）
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthlyExpenseCount = allFyExpenses.filter((e) => {
    const ts =
      typeof e.date === 'number'
        ? e.date * 1000
        : (e.date as Date).getTime();
    if (ts < monthStart) return false;
    if (ctx.orgRole === 'owner' || ctx.orgRole === 'admin') return true;
    return visibleGroupIds.has(e.groupId);
  }).length;

  // 各 group の消化（GroupMap 用）
  const groupConsumedMap = new Map<string, number>();
  for (const e of allFyExpenses) {
    if (!isApproved(e.status)) continue;
    groupConsumedMap.set(
      e.groupId,
      (groupConsumedMap.get(e.groupId) ?? 0) + e.amountJpy,
    );
  }

  const groupBudgetMap = new Map<string, number>();
  for (const b of fyBudgets) {
    if (b.groupId) {
      groupBudgetMap.set(
        b.groupId,
        (groupBudgetMap.get(b.groupId) ?? 0) + b.amountJpy,
      );
    }
  }

  const groupData: GroupMapDatum[] = visibleGroups.map((g) => ({
    groupId: g.id,
    code: g.code,
    name: g.name,
    consumed: groupConsumedMap.get(g.id) ?? 0,
    total: groupBudgetMap.get(g.id) ?? 0,
  }));

  // 最近の活動（最新 5 件、scoped）
  const recentRows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amountJpy,
      status: expenses.status,
      date: expenses.date,
      groupId: expenses.groupId,
    })
    .from(expenses)
    .where(eq(expenses.organizationId, org.id))
    .orderBy(desc(expenses.createdAt))
    .limit(20);

  const groupNameMap = new Map(allGroups.map((g) => [g.id, g.name]));
  const recentActivities = recentRows
    .filter(
      (r) =>
        ctx.orgRole === 'owner' ||
        ctx.orgRole === 'admin' ||
        visibleGroupIds.has(r.groupId),
    )
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      status: r.status,
      date:
        typeof r.date === 'number'
          ? r.date
          : Math.floor((r.date as Date).getTime() / 1000),
      groupName: groupNameMap.get(r.groupId) ?? '—',
    }));

  return {
    organizationKind: org.kind,
    organizationName: org.name,
    fiscalYear,
    totalBudget,
    consumed,
    remaining: Math.max(totalBudget - consumed, 0),
    monthlyExpenseCount,
    groups: groupData,
    recentActivities,
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  let data: DashboardData | null;
  try {
    data = await loadDashboard(organizationSlug);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 401) {
        redirect(`/login?next=/${organizationSlug}/dashboard`);
      }
      notFound();
    }
    throw e;
  }
  if (!data) notFound();

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-court-green">
          FY{data.fiscalYear}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          ダッシュボード
        </h1>
      </header>

      {/* 上部: 4 KPI カード */}
      <section
        className="grid gap-4 md:grid-cols-4"
        aria-label="主要 KPI"
      >
        <KpiCard label="総予算" value={data.totalBudget} format="jpy" />
        <KpiCard label="消化額" value={data.consumed} format="jpy" />
        <KpiCard label="残予算" value={data.remaining} format="jpy" />
        <KpiCard
          label="今月の申請数"
          value={data.monthlyExpenseCount}
          format="number"
        />
      </section>

      {/* 中段: 2 列（左マップ / 右ゲージ） */}
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <GroupMap
          organizationKind={data.organizationKind}
          organizationSlug={organizationSlug}
          data={data.groups}
        />
        <div className="rounded-[14px] border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            全体予算消化
          </h3>
          <BudgetGaugeBall
            usedAmount={data.consumed}
            totalAmount={data.totalBudget}
            label="FY 通算"
          />
        </div>
      </section>

      {/* 下段: 最近の活動 */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          最近の活動
        </h2>
        {data.recentActivities.length === 0 ? (
          <EmptyState
            title="まだ活動がありません"
            description="活動費を申請すると、ここに最新 5 件が表示されます。"
          />
        ) : (
          <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
            {data.recentActivities.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {a.description}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.groupName}・
                    {new Date(a.date * 1000).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <span className="font-nums tabular-nums text-sm font-medium">
                  {formatJpy(a.amount)}
                </span>
                <StatusPill status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * 簡易 status 表示（status-badge.tsx は W2-B 領域のため触らない、ここでローカル定義）
 */
function StatusPill({ status }: { status: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    draft: { label: '下書き', cls: 'bg-stone-100 text-muted-foreground' },
    submitted: {
      label: '申請中',
      cls: 'bg-court-green/10 text-court-green',
    },
    approved: {
      label: '承認済み',
      cls: 'bg-court-green/10 text-court-green',
    },
    rejected: { label: '差戻', cls: 'bg-danger/10 text-danger' },
    charged_to_group: {
      label: '部内計上',
      cls: 'bg-court-green/10 text-court-green',
    },
    charged_to_organization: {
      label: '組織計上',
      cls: 'bg-court-green/10 text-court-green',
    },
  };
  const m = meta[status] ?? { label: status, cls: 'bg-stone-100' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
