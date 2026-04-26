'use client';

/**
 * 承認・差戻パネル（W2-B Client component）
 *
 * - 承認: 充当先 (group_funded / organization_funded / personal) を選択 → approveExpense
 * - 差戻し: 理由を入力 → rejectExpense
 *
 * Modal は Radix Dialog を使うのが理想だが、依存最小化のため inline expanding
 * panel + backdrop で実装（DEC-021 の Radix overlay は dropdown のみ採用）。
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckBadgeIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { approveExpense, rejectExpense } from '@/lib/actions/approval';
import type { ExpenseClassification } from '@/lib/db/schema';

const CLASSIFICATIONS: Array<{
  value: ExpenseClassification;
  label: string;
  desc: string;
}> = [
  {
    value: 'group_funded',
    label: 'グループ予算（県）',
    desc: '申請グループの年度予算から充当',
  },
  {
    value: 'organization_funded',
    label: '本部予算（全体）',
    desc: '組織全体予算から充当',
  },
  {
    value: 'personal',
    label: '自己負担',
    desc: '予算消化なし（個人負担として記録）',
  },
];

type Props = {
  expenseId: string;
  defaultClassification: ExpenseClassification | null;
};

export function ApprovalPanel({
  expenseId,
  defaultClassification,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'idle' | 'approve' | 'reject'>(
    'idle',
  );
  const [classification, setClassification] =
    React.useState<ExpenseClassification>(
      defaultClassification ?? 'group_funded',
    );
  const [reason, setReason] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const close = () => {
    setMode('idle');
    setError(null);
    setReason('');
    setComment('');
  };

  const onApprove = async () => {
    setPending(true);
    setError(null);
    const res = await approveExpense({
      id: expenseId,
      classification,
      comment: comment || undefined,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    close();
    router.refresh();
  };

  const onReject = async () => {
    if (!reason.trim()) {
      setError('差戻理由を入力してください');
      return;
    }
    setPending(true);
    setError(null);
    const res = await rejectExpense({
      id: expenseId,
      reason: reason.trim(),
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    close();
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent"
          onClick={() => {
            setMode('approve');
            setError(null);
          }}
        >
          <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" />
          承認
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setMode('reject');
            setError(null);
          }}
        >
          <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden="true" />
          差戻し
        </Button>
      </div>

      {mode !== 'idle' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-panel-title"
        >
          <div className="w-full max-w-md rounded-[14px] border border-border bg-card shadow-lg">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2
                id="approval-panel-title"
                className="text-base font-semibold tracking-tight"
              >
                {mode === 'approve' ? '申請を承認' : '申請を差戻し'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-muted-foreground hover:bg-stone-100"
                aria-label="閉じる"
                disabled={pending}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-4 p-5">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
                >
                  <ExclamationTriangleIcon
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}

              {mode === 'approve' && (
                <>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      充当先を選択
                    </legend>
                    {CLASSIFICATIONS.map((c) => (
                      <label
                        key={c.value}
                        className={
                          'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ' +
                          (classification === c.value
                            ? 'border-court-green bg-court-green/5'
                            : 'border-border hover:bg-stone-100/50')
                        }
                      >
                        <input
                          type="radio"
                          name="classification"
                          value={c.value}
                          checked={classification === c.value}
                          onChange={() => setClassification(c.value)}
                          className="mt-1 accent-court-green"
                          disabled={pending}
                        />
                        <span className="text-sm">
                          <span className="block font-medium text-foreground">
                            {c.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {c.desc}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="space-y-1">
                    <label
                      htmlFor="approve-comment"
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      コメント（任意）
                    </label>
                    <textarea
                      id="approve-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={pending}
                    />
                  </div>
                </>
              )}

              {mode === 'reject' && (
                <div className="space-y-1">
                  <label
                    htmlFor="reject-reason"
                    className="text-sm font-medium"
                  >
                    差戻理由（必須）
                  </label>
                  <textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder="例: 領収証の日付が不明瞭です。再提出時に明瞭な写真を添付してください。"
                    className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={pending}
                  />
                </div>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={close}
                disabled={pending}
              >
                キャンセル
              </Button>
              <Button
                variant={mode === 'approve' ? 'accent' : 'destructive'}
                size="sm"
                onClick={mode === 'approve' ? onApprove : onReject}
                disabled={pending}
              >
                {pending
                  ? '処理中…'
                  : mode === 'approve'
                    ? '承認する'
                    : '差戻す'}
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
