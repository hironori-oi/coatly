'use client';

/**
 * 予算編集 Dialog（モーダル）
 *
 * - 既存予算: 「編集」ボタン → updateBudget(id, amount) 呼び出し
 * - 未作成予算: 「作成」ボタン → setBudget(orgId, groupId, fy, amount) 呼び出し
 *
 * DEC-021: Radix Dialog 使用なので 'use client' 必須。
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  PencilSquareIcon,
  PlusIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setBudget, updateBudget } from '@/lib/actions/budget';

type Props = {
  organizationId: string;
  fiscalYear: number;
  groupId: string | null;
  budgetId: string | null;
  currentAmount: number | null;
  scopeLabel: string;
  minAmount: number;
};

export function BudgetEditor({
  organizationId,
  fiscalYear,
  groupId,
  budgetId,
  currentAmount,
  scopeLabel,
  minAmount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string>(
    currentAmount !== null ? String(currentAmount) : '',
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setAmount(currentAmount !== null ? String(currentAmount) : '');
      setError(null);
    }
  }, [open, currentAmount]);

  const onSave = async () => {
    setError(null);
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0) {
      setError('0円以上の整数で入力してください');
      return;
    }
    if (num < minAmount) {
      setError(
        `既に消化済みの ¥${minAmount.toLocaleString()} を下回ることはできません`,
      );
      return;
    }
    setPending(true);
    const res = budgetId
      ? await updateBudget({ id: budgetId, amountJpy: Math.trunc(num) })
      : await setBudget({
          organizationId,
          groupId,
          fiscalYear,
          amountJpy: Math.trunc(num),
        });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const isCreate = budgetId === null;

  return (
    <>
      <Button
        variant={isCreate ? 'accent' : 'outline'}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {isCreate ? (
          <>
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            作成
          </>
        ) : (
          <>
            <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
            編集
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCreate ? '予算を作成' : '予算を編集'}
            </DialogTitle>
            <DialogDescription>
              {scopeLabel}（FY{fiscalYear}）の予算額を
              {isCreate ? '作成' : '変更'}します。
            </DialogDescription>
          </DialogHeader>

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

          <div className="space-y-2">
            <Label htmlFor="amount">予算額（円）</Label>
            <Input
              id="amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
              step={1000}
              autoFocus
              disabled={pending}
            />
            {minAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                既に消化済み: ¥{minAmount.toLocaleString()}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button variant="accent" onClick={onSave} disabled={pending}>
              {pending ? '保存中…' : isCreate ? '作成' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
