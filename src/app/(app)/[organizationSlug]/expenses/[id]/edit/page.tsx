/**
 * 活動費 編集ページ（Phase 1 polish 新規）
 *
 * - 申請者本人のみ + status='draft' or 'rejected' のみ編集可
 * - requireExpenseAccess で認可、本人チェックも追加
 * - 既存添付一覧 + 共有 ExpenseForm（mode='edit'）を表示
 */
import { eq, asc } from 'drizzle-orm';
import { forbidden, notFound, redirect, unauthorized } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups,
  expenseAttachments,
} from '@/lib/db/schema';
import { requireExpenseAccess } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { ExpenseForm } from '@/components/expense-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export const metadata = {
  title: '申請編集',
};

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ organizationSlug: string; id: string }>;
}) {
  const { organizationSlug, id } = await params;

  let expense;
  let ctx;
  try {
    const result = await requireExpenseAccess(id, 'write');
    expense = result.expense;
    ctx = result.ctx;
  } catch (err) {
    if (err instanceof AuthError) {
      // 401: middleware がほぼ防ぐが念のため
      if (err.status === 401) unauthorized();
      // 403: 他人の draft を踏んだ等
      forbidden();
    }
    // expense そのものが存在しない場合は本物の 404
    if (err && (err as { name?: string }).name === 'NotFoundError') notFound();
    throw err;
  }

  // 本人のみ編集可能（manager/admin の write は requireExpenseAccess で許可済みだが、
  // 編集 UI は本人のみに限定する設計）
  if (expense.userId !== ctx.user.id) {
    forbidden();
  }

  // 編集可能な status のみ
  if (expense.status !== 'draft' && expense.status !== 'rejected') {
    redirect(`/${organizationSlug}/expenses/${id}`);
  }

  // 組織 slug の整合チェック
  const [orgRow] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, expense.organizationId))
    .limit(1);
  if (!orgRow || orgRow.slug !== organizationSlug) notFound();

  // visible group を取得（編集時の選択肢として）
  const groupRows = await db
    .select({ id: groups.id, code: groups.code, name: groups.name })
    .from(groups)
    .where(eq(groups.organizationId, expense.organizationId))
    .orderBy(asc(groups.displayOrder));

  const visibleGroupSet = new Set(ctx.visibleGroupIds);
  const isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
  const groupOptions = groupRows.filter(
    (g) => isAdmin || visibleGroupSet.has(g.id) || g.id === expense.groupId,
  );

  // 既存添付
  const existingAttachments = await db
    .select()
    .from(expenseAttachments)
    .where(eq(expenseAttachments.expenseId, id))
    .orderBy(asc(expenseAttachments.createdAt));

  const initialDate = new Date(expense.date).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${organizationSlug}/expenses/${id}`}>
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            詳細に戻る
          </Link>
        </Button>
      </div>

      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {expense.status === 'rejected' ? '差戻された申請' : '下書き'}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">申請を編集</h1>
        {expense.status === 'rejected' && expense.rejectionReason && (
          <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
            <p className="font-medium text-danger">差戻理由</p>
            <p className="mt-1 whitespace-pre-wrap text-foreground/80">
              {expense.rejectionReason}
            </p>
          </div>
        )}
      </header>

      {existingAttachments.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            既存の添付（{existingAttachments.length}）
          </h2>
          <Card>
            <CardContent className="space-y-2 p-4">
              {existingAttachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-2 text-sm"
                >
                  <DocumentTextIcon
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{a.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {(a.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                既存添付の削除は Phase 2 で対応します。新たな領収証は下のフォームから追加できます。
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      <ExpenseForm
        mode="edit"
        organizationId={expense.organizationId}
        organizationSlug={organizationSlug}
        groups={groupOptions}
        expenseId={id}
        initialValues={{
          groupId: expense.groupId,
          date: initialDate,
          description: expense.description,
          amount: expense.amountJpy,
          hasReceipt: expense.hasReceipt,
          invoiceNumber: expense.invoiceNumber ?? '',
          classification: expense.classification ?? 'group_funded',
        }}
      />
    </div>
  );
}
