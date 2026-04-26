'use client';

/**
 * 申請者本人向けの操作ボタン（W2-B Client component）
 *
 * - 状態 draft / rejected → 提出 (submit) / 削除 (delete)
 * - 状態 submitted        → 引き戻し (withdraw)
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  PaperAirplaneIcon,
  TrashIcon,
  ArrowLeftCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  submitExpense,
  withdrawExpense,
  deleteExpense,
} from '@/lib/actions/expense';
import type { ExpenseStatus } from '@/lib/db/schema';

type Props = {
  expenseId: string;
  status: ExpenseStatus;
  organizationSlug: string;
};

export function OwnerActions({
  expenseId,
  status,
  organizationSlug,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<
    'idle' | 'submit' | 'withdraw' | 'delete'
  >('idle');
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async () => {
    setPending('submit');
    setError(null);
    const res = await submitExpense({ id: expenseId });
    setPending('idle');
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  const onWithdraw = async () => {
    setPending('withdraw');
    setError(null);
    const res = await withdrawExpense({ id: expenseId });
    setPending('idle');
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  const onDelete = async () => {
    if (!confirm('この下書きを削除しますか？この操作は取り消せません。')) {
      return;
    }
    setPending('delete');
    setError(null);
    const res = await deleteExpense({ id: expenseId });
    setPending('idle');
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/${organizationSlug}/expenses`);
  };

  return (
    <div className="space-y-3">
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

      <div className="flex flex-wrap gap-2">
        {(status === 'draft' || status === 'rejected') && (
          <>
            <Button
              variant="accent"
              onClick={onSubmit}
              disabled={pending !== 'idle'}
            >
              <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
              {pending === 'submit' ? '提出中…' : '提出する'}
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/${organizationSlug}/expenses/${expenseId}/edit`}
              >
                <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                編集
              </Link>
            </Button>
            {status === 'draft' && (
              <Button
                variant="ghost"
                onClick={onDelete}
                disabled={pending !== 'idle'}
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
                {pending === 'delete' ? '削除中…' : '削除'}
              </Button>
            )}
          </>
        )}
        {status === 'submitted' && (
          <Button
            variant="outline"
            onClick={onWithdraw}
            disabled={pending !== 'idle'}
          >
            <ArrowLeftCircleIcon className="h-4 w-4" aria-hidden="true" />
            {pending === 'withdraw' ? '処理中…' : '提出を引き戻す'}
          </Button>
        )}
      </div>
    </div>
  );
}
