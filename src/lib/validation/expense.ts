/**
 * 活動費入力 Zod schema
 *
 * security-baseline §4 に従い、Server Action 冒頭でも必ず再検証する。
 *
 * W2-B 拡張:
 * - classification (group_funded / organization_funded / personal) を追加
 * - hasReceipt フラグを追加（領収書あり/なしのチェック）
 * - 添付メタデータ（attachment）の confirmation 用 schema を追加
 */
import { z } from 'zod';
import { isValidInvoiceNumberFormat } from '@/lib/utils/invoice';
import { EXPENSE_CLASSIFICATION } from '@/lib/db/schema';

const invoiceNumberSchema = z
  .string()
  .refine(
    (v) => v === '' || isValidInvoiceNumberFormat(v),
    'インボイス番号は T + 13 桁の数字で入力してください',
  )
  .optional()
  .or(z.literal(''));

export const createExpenseSchema = z.object({
  organizationId: z.string().min(1),
  groupId: z.string().min(1, 'グループを選択してください'),
  date: z.coerce
    .date()
    .max(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      '未来日付は登録できません',
    ),
  description: z.string().min(1, '内容を入力してください').max(500),
  amount: z.coerce
    .number()
    .int('整数で入力してください')
    .positive('1円以上で入力してください')
    .max(10_000_000, '1回の申請は1,000万円以下にしてください'),
  hasReceipt: z.coerce.boolean().default(false),
  invoiceNumber: invoiceNumberSchema,
  classification: z.enum(EXPENSE_CLASSIFICATION),
  /** R2 アップロード後の attachment メタ（オプション、複数可）*/
  attachments: z
    .array(
      z.object({
        objectKey: z.string().min(1),
        fileName: z.string().min(1).max(255),
        contentType: z.enum([
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'application/pdf',
        ]),
        size: z.number().int().positive().max(10 * 1024 * 1024),
      }),
    )
    .optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  description: z.string().min(1).max(500).optional(),
  amount: z.coerce.number().int().positive().max(10_000_000).optional(),
  hasReceipt: z.coerce.boolean().optional(),
  invoiceNumber: invoiceNumberSchema,
  classification: z.enum(EXPENSE_CLASSIFICATION).optional(),
  attachments: z
    .array(
      z.object({
        objectKey: z.string().min(1),
        fileName: z.string().min(1).max(255),
        contentType: z.enum([
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'application/pdf',
        ]),
        size: z.number().int().positive().max(10 * 1024 * 1024),
      }),
    )
    .optional(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const submitExpenseSchema = z.object({
  id: z.string().min(1),
});

export const withdrawExpenseSchema = z.object({
  id: z.string().min(1),
});

export const deleteExpenseSchema = z.object({
  id: z.string().min(1),
});

export const approveExpenseSchema = z.object({
  id: z.string().min(1),
  classification: z.enum(EXPENSE_CLASSIFICATION),
  comment: z.string().max(500).optional(),
});

export type ApproveExpenseInput = z.infer<typeof approveExpenseSchema>;

export const rejectExpenseSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1, '差戻理由を入力してください').max(500),
});

export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

export const reclassifyExpenseSchema = z.object({
  id: z.string().min(1),
  newClassification: z.enum(EXPENSE_CLASSIFICATION),
  comment: z.string().max(500).optional(),
});

export type ReclassifyExpenseInput = z.infer<typeof reclassifyExpenseSchema>;
