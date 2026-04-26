import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { ExpenseStatus } from '@/lib/db/schema';

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: '下書き',
  submitted: '承認待ち',
  approved: '承認済み',
  rejected: '差戻',
  charged_to_group: '県充当',
  charged_to_organization: '本部充当',
};

const STATUS_VARIANT: Record<
  ExpenseStatus,
  'default' | 'accent' | 'warning' | 'danger' | 'success' | 'muted'
> = {
  draft: 'muted',
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
  charged_to_group: 'accent',
  charged_to_organization: 'accent',
};

export function StatusBadge({ status }: { status: ExpenseStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
