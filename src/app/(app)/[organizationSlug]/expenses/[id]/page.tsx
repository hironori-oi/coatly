/**
 * 活動費 詳細（W2-B 本実装）
 *
 * - Server Component で expense + attachments + approval logs を取得
 * - 領収証は R2 GET signed URL（TTL 60s）で都度プレビュー
 * - 申請者本人 → 編集 / 提出 / 引き戻し / 削除
 * - manager (該当 group) or admin/owner かつ status=submitted → 承認 / 差戻
 */
import { eq, asc } from 'drizzle-orm';
import { forbidden, notFound, unauthorized } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarIcon,
  CurrencyYenIcon,
  DocumentTextIcon,
  TagIcon,
  UserCircleIcon,
  ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/24/outline';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { db } from '@/lib/db/client';
import {
  organizations,
  groups,
  users,
  expenses,
  expenseAttachments,
  approvalLogs,
  type Expense,
  type ExpenseClassification,
} from '@/lib/db/schema';
import { requireExpenseAccess } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { formatJpy } from '@/lib/utils/format-jpy';
import { getSignedDownloadUrl } from '@/lib/r2/signed-url';
import { ApprovalPanel } from './approval-panel';
import { OwnerActions } from './owner-actions';

export const metadata = {
  title: '申請詳細',
};

const CLASSIFICATION_LABEL: Record<ExpenseClassification, string> = {
  group_funded: 'グループ予算（県）',
  organization_funded: '本部予算（全体）',
  personal: '自己負担',
};

const ACTION_LABEL: Record<string, string> = {
  submit: '提出',
  approve: '承認',
  reject: '差戻',
  reclassify: '充当先変更',
  withdraw: '引き戻し',
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

async function safeSignedUrl(key: string): Promise<string | null> {
  try {
    return await getSignedDownloadUrl(key);
  } catch (e) {
    console.error('[expense-detail] signed URL failed', e);
    return null;
  }
}

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; id: string }>;
}) {
  const { organizationSlug, id } = await params;

  let expense: Expense;
  let canApprove = false;
  let isOwner = false;
  let isAdmin = false;
  try {
    const { ctx, expense: e } = await requireExpenseAccess(id, 'read');
    expense = e;
    isOwner = e.userId === ctx.user.id;
    isAdmin = ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
    const isManager = ctx.managedGroupIds.includes(e.groupId);
    canApprove = (isAdmin || isManager) && !isOwner;
  } catch (err) {
    if (err instanceof AuthError) {
      // 401: middleware がほぼ防ぐが念のため
      if (err.status === 401) unauthorized();
      // 403: 他県 member が別 group の expense URL を直叩き等
      forbidden();
    }
    // expense そのものが存在しない場合は本物の 404
    if (err && (err as { name?: string }).name === 'NotFoundError') notFound();
    throw err;
  }

  // 組織 / グループ / ユーザー名取得
  const [orgRow] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, expense.organizationId))
    .limit(1);
  if (!orgRow || orgRow.slug !== organizationSlug) notFound();

  const [groupRow] = await db
    .select({ name: groups.name, code: groups.code })
    .from(groups)
    .where(eq(groups.id, expense.groupId))
    .limit(1);

  const [applicant] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, expense.userId))
    .limit(1);

  const attachmentRows = await db
    .select()
    .from(expenseAttachments)
    .where(eq(expenseAttachments.expenseId, id))
    .orderBy(asc(expenseAttachments.createdAt));

  const attachments = await Promise.all(
    attachmentRows.map(async (a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: await safeSignedUrl(a.r2ObjectKey),
    })),
  );

  // approval logs (with actor name)
  const logRows = await db
    .select({
      id: approvalLogs.id,
      action: approvalLogs.action,
      fromStatus: approvalLogs.fromStatus,
      toStatus: approvalLogs.toStatus,
      comment: approvalLogs.comment,
      createdAt: approvalLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(approvalLogs)
    .innerJoin(users, eq(users.id, approvalLogs.actorId))
    .where(eq(approvalLogs.expenseId, id))
    .orderBy(asc(approvalLogs.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${organizationSlug}/expenses`}>← 一覧へ</Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            FY{expense.fiscalYear} / {groupRow?.name ?? '-'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {expense.description}
          </h1>
          <p className="text-sm text-muted-foreground">
            ID: <code className="font-mono text-xs">{expense.id}</code>
          </p>
        </div>
        <StatusBadge status={expense.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Left: 詳細 + 添付 */}
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <Field
                icon={<CalendarIcon className="h-4 w-4" />}
                label="利用日"
                value={formatDate(new Date(expense.date))}
              />
              <Field
                icon={<CurrencyYenIcon className="h-4 w-4" />}
                label="金額"
                value={
                  <span className="tabular text-base font-semibold text-foreground">
                    {formatJpy(expense.amountJpy)}
                  </span>
                }
              />
              <Field
                icon={<TagIcon className="h-4 w-4" />}
                label="充当先"
                value={
                  expense.classification
                    ? CLASSIFICATION_LABEL[expense.classification]
                    : '未設定'
                }
              />
              <Field
                icon={<DocumentTextIcon className="h-4 w-4" />}
                label="インボイス番号"
                value={expense.invoiceNumber ?? '—'}
              />
              <Field
                icon={<UserCircleIcon className="h-4 w-4" />}
                label="申請者"
                value={
                  applicant?.name?.trim() || applicant?.email || '不明'
                }
              />
              <Field
                icon={<DocumentTextIcon className="h-4 w-4" />}
                label="領収書"
                value={expense.hasReceipt ? 'あり' : 'なし'}
              />
              {expense.rejectionReason && (
                <div className="sm:col-span-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
                  <p className="font-medium text-danger">差戻理由</p>
                  <p className="mt-1 text-foreground/80 whitespace-pre-wrap">
                    {expense.rejectionReason}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              領収証 ({attachments.length})
            </h2>
            {attachments.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  添付された領収証はありません
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {attachments.map((a) => (
                  <li
                    key={a.id}
                    className="overflow-hidden rounded-[14px] border border-border bg-card"
                  >
                    {a.url ? (
                      a.mimeType === 'application/pdf' ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-40 flex-col items-center justify-center bg-stone-100/40 text-court-green hover:underline"
                        >
                          <DocumentTextIcon className="mb-2 h-10 w-10" />
                          PDF を開く
                        </a>
                      ) : (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {/*
                           * R2 の TTL=60s 署名付き URL を直接 src にするため
                           * next/image (Vercel Image Optimization) は使えない。
                           * loader を自前で書く案もあるが、署名 URL が短命で
                           * loader 経由の cache が無意味なので生 <img> を採用。
                           * security-baseline §7 / dev-technical-spec-v2 §5.3。
                           */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={a.url}
                            alt={a.fileName}
                            className="h-40 w-full object-cover"
                          />
                        </a>
                      )
                    ) : (
                      <div className="flex h-40 items-center justify-center bg-stone-100/40 text-sm text-muted-foreground">
                        プレビュー取得不可
                      </div>
                    )}
                    <div className="p-3">
                      <p className="truncate text-sm font-medium">
                        {a.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(a.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: アクション + タイムライン */}
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                アクション
              </h3>
              {isOwner && (
                <OwnerActions
                  expenseId={expense.id}
                  status={expense.status}
                  organizationSlug={organizationSlug}
                />
              )}
              {canApprove && expense.status === 'submitted' && (
                <ApprovalPanel
                  expenseId={expense.id}
                  defaultClassification={expense.classification}
                />
              )}
              {!isOwner &&
                !(canApprove && expense.status === 'submitted') && (
                  <p className="text-sm text-muted-foreground">
                    現在のユーザーから可能な操作はありません
                  </p>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                <ChatBubbleLeftEllipsisIcon
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                タイムライン
              </h3>
              {logRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  まだ操作履歴はありません
                </p>
              ) : (
                <ol className="space-y-3">
                  {logRows.map((l) => (
                    <li
                      key={l.id}
                      className="border-l-2 border-court-green/30 pl-3"
                    >
                      <p className="text-sm font-medium">
                        {ACTION_LABEL[l.action] ?? l.action}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {l.fromStatus ?? '-'} → {l.toStatus}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(l.actorName?.trim() || l.actorEmail) +
                          ' · ' +
                          formatDateTime(new Date(l.createdAt))}
                      </p>
                      {l.comment && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/70">
                          {l.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        {label}
      </p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
