import { z } from 'zod';

export const setBudgetSchema = z.object({
  organizationId: z.string().min(1),
  groupId: z.string().nullable(),
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  amountJpy: z.coerce
    .number()
    .int()
    .min(0, '0円以上で入力してください')
    .max(1_000_000_000, '10億円以下で入力してください'),
  note: z.string().max(500).optional(),
});

export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
