'use client';

/**
 * 共有 ExpenseForm（/expenses/new と /expenses/[id]/edit で共用）
 *
 * - mode='create': createExpense + 任意で submitExpense
 * - mode='edit':   updateExpense + 任意で submitExpense（draft/rejected のみ）
 *
 * フィールド:
 *  グループ / 利用日 / 内容 / 金額 / 充当先 / 領収書フラグ / インボイス番号 / 添付
 *
 * 制約:
 *  - 既存添付（編集時）は表示のみ（削除・差し替えは別 form / Server Action 経由）
 *  - 「保存」「保存して提出」ボタン
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  ReceiptDropzone,
  type UploadedAttachment,
} from '@/components/receipt-dropzone';
import {
  createExpense,
  updateExpense,
  submitExpense,
} from '@/lib/actions/expense';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
} from '@/lib/validation/expense';
import type { ExpenseClassification } from '@/lib/db/schema';

type GroupOption = { id: string; code: string; name: string };

type CreateMode = {
  mode: 'create';
  organizationId: string;
  organizationSlug: string;
  groups: GroupOption[];
  defaultGroupId?: string;
};

type EditMode = {
  mode: 'edit';
  organizationId: string;
  organizationSlug: string;
  groups: GroupOption[];
  expenseId: string;
  initialValues: {
    groupId: string;
    date: string; // YYYY-MM-DD
    description: string;
    amount: number;
    hasReceipt: boolean;
    invoiceNumber: string;
    classification: ExpenseClassification;
  };
};

export type ExpenseFormProps = CreateMode | EditMode;

type FieldErrors = Partial<
  Record<
    | 'groupId'
    | 'date'
    | 'description'
    | 'amount'
    | 'invoiceNumber'
    | 'classification'
    | 'global',
    string
  >
>;

const CLASSIFICATIONS: Array<{
  value: ExpenseClassification;
  label: string;
}> = [
  { value: 'group_funded', label: 'グループ予算（県）' },
  { value: 'organization_funded', label: '本部予算（全体）' },
  { value: 'personal', label: '自己負担' },
];

export function ExpenseForm(props: ExpenseFormProps) {
  const router = useRouter();
  const today = React.useMemo(
    () => new Date().toISOString().slice(0, 10),
    [],
  );

  const initial =
    props.mode === 'edit'
      ? props.initialValues
      : {
          groupId: props.defaultGroupId ?? props.groups[0]?.id ?? '',
          date: today,
          description: '',
          amount: 0,
          hasReceipt: false,
          invoiceNumber: '',
          classification: 'group_funded' as ExpenseClassification,
        };

  const [groupId, setGroupId] = React.useState<string>(initial.groupId);
  const [date, setDate] = React.useState<string>(initial.date);
  const [description, setDescription] = React.useState(initial.description);
  const [amount, setAmount] = React.useState<string>(
    initial.amount > 0 ? String(initial.amount) : '',
  );
  const [hasReceipt, setHasReceipt] = React.useState(initial.hasReceipt);
  const [invoiceNumber, setInvoiceNumber] = React.useState(
    initial.invoiceNumber ?? '',
  );
  const [classification, setClassification] =
    React.useState<ExpenseClassification>(initial.classification);
  const [attachments, setAttachments] = React.useState<UploadedAttachment[]>(
    [],
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [pending, setPending] = React.useState<'idle' | 'save' | 'submit'>(
    'idle',
  );

  const handleAttached = React.useCallback((a: UploadedAttachment) => {
    setAttachments((prev) => [...prev, a]);
    setHasReceipt(true);
  }, []);

  const validate = (): {
    ok: boolean;
    errs: FieldErrors;
  } => {
    const errs: FieldErrors = {};
    if (!groupId) errs.groupId = 'グループを選択してください';
    if (!date) errs.date = '利用日を入力してください';
    if (!description.trim()) errs.description = '内容を入力してください';
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0)
      errs.amount = '1円以上の整数で入力してください';
    if (invoiceNumber && !/^T\d{13}$/.test(invoiceNumber)) {
      errs.invoiceNumber = 'T + 13 桁の数字で入力してください';
    }
    setErrors(errs);
    return { ok: Object.keys(errs).length === 0, errs };
  };

  const buildCreateInput = (): CreateExpenseInput => ({
    organizationId: props.organizationId,
    groupId,
    date: new Date(date),
    description: description.trim(),
    amount: Math.trunc(Number(amount)),
    hasReceipt,
    invoiceNumber: invoiceNumber || '',
    classification,
    attachments: attachments.length ? attachments : undefined,
  });

  const buildUpdateInput = (id: string): UpdateExpenseInput => ({
    id,
    groupId,
    date: new Date(date),
    description: description.trim(),
    amount: Math.trunc(Number(amount)),
    hasReceipt,
    invoiceNumber: invoiceNumber || '',
    classification,
    attachments: attachments.length ? attachments : undefined,
  });

  const onSave = async () => {
    if (!validate().ok) return;
    setPending('save');
    if (props.mode === 'edit') {
      const res = await updateExpense(buildUpdateInput(props.expenseId));
      setPending('idle');
      if (!res.ok) {
        setErrors({ global: res.error });
        return;
      }
      router.push(`/${props.organizationSlug}/expenses/${props.expenseId}`);
      router.refresh();
    } else {
      const res = await createExpense(buildCreateInput());
      setPending('idle');
      if (!res.ok) {
        setErrors({ global: res.error });
        return;
      }
      router.push(`/${props.organizationSlug}/expenses/${res.id}`);
    }
  };

  const onSaveAndSubmit = async () => {
    if (!validate().ok) return;
    setPending('submit');
    const expenseId =
      props.mode === 'edit' ? props.expenseId : undefined;
    if (props.mode === 'edit') {
      const updated = await updateExpense(buildUpdateInput(props.expenseId));
      if (!updated.ok) {
        setPending('idle');
        setErrors({ global: updated.error });
        return;
      }
    } else {
      const created = await createExpense(buildCreateInput());
      if (!created.ok) {
        setPending('idle');
        setErrors({ global: created.error });
        return;
      }
      await submitAfter(created.id);
      return;
    }
    if (expenseId) await submitAfter(expenseId);

    async function submitAfter(id: string) {
      const submitted = await submitExpense({ id });
      setPending('idle');
      if (!submitted.ok) {
        setErrors({
          global:
            '保存はできましたが、提出に失敗しました: ' + submitted.error,
        });
        router.push(`/${props.organizationSlug}/expenses/${id}`);
        return;
      }
      router.push(`/${props.organizationSlug}/expenses/${id}`);
    }
  };

  const isEdit = props.mode === 'edit';

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {errors.global && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
          >
            <ExclamationTriangleIcon
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{errors.global}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="groupId">グループ</Label>
          <select
            id="groupId"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending !== 'idle'}
          >
            {props.groups.length === 0 && (
              <option value="">所属グループがありません</option>
            )}
            {props.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {errors.groupId && (
            <p className="text-xs text-danger">{errors.groupId}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">利用日</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            disabled={pending !== 'idle'}
          />
          {errors.date && <p className="text-xs text-danger">{errors.date}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">内容</Label>
          <Input
            id="description"
            name="description"
            placeholder="例: 練習試合のコート使用料"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending !== 'idle'}
          />
          {errors.description && (
            <p className="text-xs text-danger">{errors.description}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">金額（円）</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            step={1}
            disabled={pending !== 'idle'}
          />
          {errors.amount && (
            <p className="text-xs text-danger">{errors.amount}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>充当先</Label>
          <div className="flex flex-wrap gap-2">
            {CLASSIFICATIONS.map((c) => {
              const active = classification === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setClassification(c.value)}
                  disabled={pending !== 'idle'}
                  className={
                    'rounded-md border px-3 py-1.5 text-sm transition-colors ' +
                    (active
                      ? 'border-court-green bg-court-green/10 text-court-green'
                      : 'border-border bg-card text-foreground hover:bg-stone-100')
                  }
                  aria-pressed={active}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="hasReceipt"
            type="checkbox"
            checked={hasReceipt}
            onChange={(e) => setHasReceipt(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-court-green"
            disabled={pending !== 'idle'}
          />
          <Label htmlFor="hasReceipt" className="cursor-pointer">
            領収書あり
          </Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoiceNumber">インボイス番号（任意）</Label>
          <Input
            id="invoiceNumber"
            name="invoiceNumber"
            placeholder="T1234567890123"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
            disabled={pending !== 'idle'}
          />
          {errors.invoiceNumber && (
            <p className="text-xs text-danger">{errors.invoiceNumber}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>領収証ファイル（追加）</Label>
          <ReceiptDropzone
            onUploaded={handleAttached}
            existingCount={attachments.length}
          />
          {attachments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {attachments.length} 件の領収証を準備しました
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="sm:flex-1"
            onClick={onSave}
            disabled={pending !== 'idle'}
          >
            <DocumentDuplicateIcon className="h-4 w-4" aria-hidden="true" />
            {pending === 'save' ? '保存中…' : isEdit ? '保存' : '下書き保存'}
          </Button>
          <Button
            type="button"
            variant="accent"
            size="lg"
            className="sm:flex-1"
            onClick={onSaveAndSubmit}
            disabled={pending !== 'idle'}
          >
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
            {pending === 'submit' ? '提出中…' : '保存して提出'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
