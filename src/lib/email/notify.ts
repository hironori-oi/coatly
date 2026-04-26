/**
 * 業務イベントから呼び出すメール送信ヘルパ。
 *
 * - 失敗してもアプリは止めない（log.warn のみ）
 * - 全関数 `Promise<void>` を返す
 *
 * 仕様: dev-technical-spec-v2.md §1.2 / §3.4
 */
import { sendEmail, getAppUrl } from './resend';
import InvitationEmail from '@/emails/invitation-email';
import ExpenseSubmittedEmail from '@/emails/expense-submitted-email';
import ExpenseApprovedEmail from '@/emails/expense-approved-email';
import MagicLinkEmail from '@/emails/magic-link-email';

const yenFmt = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const datetimeFmt = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const CLASSIFICATION_LABEL: Record<string, string> = {
  group_funded: 'グループ予算',
  organization_funded: '組織予算',
  personal: '自己負担',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
};

// ─────────────────────────────────────────────
// 1) 招待メール
// ─────────────────────────────────────────────

export async function notifyInvitation(input: {
  email: string;
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date | number | undefined;
  role: string;
}): Promise<void> {
  const expiresDate =
    input.expiresAt instanceof Date
      ? input.expiresAt
      : typeof input.expiresAt === 'number'
        ? new Date(input.expiresAt)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const result = await sendEmail({
    to: input.email,
    subject: `${input.organizationName} から Coatly への招待`,
    react: InvitationEmail({
      recipientEmail: input.email,
      organizationName: input.organizationName,
      inviterName: input.inviterName,
      inviteUrl: input.inviteUrl,
      expiresAtLabel: datetimeFmt.format(expiresDate),
      roleLabel: ROLE_LABEL[input.role] ?? input.role,
    }),
  });

  if (!result.ok) {
     
    console.warn('[notify:invitation] failed to send', {
      email: input.email,
      error: result.error,
    });
  }
}

// ─────────────────────────────────────────────
// 2) 申請提出 → manager 通知
// ─────────────────────────────────────────────

export async function notifyExpenseSubmitted(input: {
  managerEmails: string[];
  managerNames?: Map<string, string>;
  submitterName: string;
  groupName: string;
  date: Date;
  description: string;
  amountJpy: number;
  organizationSlug: string;
  expenseId: string;
}): Promise<void> {
  if (input.managerEmails.length === 0) return;

  const detailUrl = `${getAppUrl()}/${input.organizationSlug}/expenses/${input.expenseId}`;
  const dateLabel = dateFmt.format(input.date);
  const amountLabel = yenFmt.format(input.amountJpy);

  await Promise.all(
    input.managerEmails.map(async (to) => {
      const result = await sendEmail({
        to,
        subject: `[Coatly] ${input.groupName}: ${input.submitterName} さんが申請（${amountLabel}）を提出`,
        react: ExpenseSubmittedEmail({
          managerName: input.managerNames?.get(to),
          submitterName: input.submitterName,
          groupName: input.groupName,
          dateLabel,
          description: input.description,
          amountLabel,
          detailUrl,
        }),
      });
      if (!result.ok) {
         
        console.warn('[notify:expense-submitted] failed', {
          to,
          error: result.error,
        });
      }
    }),
  );
}

// ─────────────────────────────────────────────
// 3) 承認/差戻 → 申請者通知
// ─────────────────────────────────────────────

export async function notifyExpenseApproved(input: {
  recipientEmail: string;
  recipientName?: string;
  result: 'approved' | 'rejected';
  classification?: string;
  rejectionReason?: string;
  groupName: string;
  date: Date;
  description: string;
  amountJpy: number;
  organizationSlug: string;
  expenseId: string;
}): Promise<void> {
  const detailUrl = `${getAppUrl()}/${input.organizationSlug}/expenses/${input.expenseId}`;
  const dateLabel = dateFmt.format(input.date);
  const amountLabel = yenFmt.format(input.amountJpy);

  const subject =
    input.result === 'approved'
      ? `[Coatly] 申請が承認されました（${amountLabel} / ${input.groupName}）`
      : `[Coatly] 申請が差し戻されました（${input.groupName}）`;

  const r = await sendEmail({
    to: input.recipientEmail,
    subject,
    react: ExpenseApprovedEmail({
      recipientName: input.recipientName,
      result: input.result,
      classificationLabel: input.classification
        ? (CLASSIFICATION_LABEL[input.classification] ?? input.classification)
        : undefined,
      rejectionReason: input.rejectionReason,
      groupName: input.groupName,
      dateLabel,
      description: input.description,
      amountLabel,
      detailUrl,
    }),
  });

  if (!r.ok) {
     
    console.warn('[notify:expense-approved] failed', {
      to: input.recipientEmail,
      error: r.error,
    });
  }
}

// ─────────────────────────────────────────────
// 4) Magic Link
// ─────────────────────────────────────────────

export async function notifyMagicLink(input: {
  email: string;
  url: string;
}): Promise<void> {
  const r = await sendEmail({
    to: input.email,
    subject: 'Coatly へのログインリンク',
    react: MagicLinkEmail({
      recipientEmail: input.email,
      magicLinkUrl: input.url,
    }),
  });
  if (!r.ok) {
     
    console.warn('[notify:magic-link] failed', {
      to: input.email,
      error: r.error,
    });
  }
}
