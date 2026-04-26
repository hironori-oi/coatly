import { describe, it, expect } from 'vitest';
import { setBudgetSchema } from '@/lib/validation/budget';
import {
  createExpenseSchema,
  updateExpenseSchema,
  approveExpenseSchema,
  rejectExpenseSchema,
  reclassifyExpenseSchema,
  submitExpenseSchema,
} from '@/lib/validation/expense';
import {
  inviteUserSchema,
  updateMemberRoleSchema,
  deactivateMemberSchema,
  cancelInvitationSchema,
  resendInvitationSchema,
} from '@/lib/validation/invite';

describe('setBudgetSchema', () => {
  it('accepts valid input', () => {
    const r = setBudgetSchema.safeParse({
      organizationId: 'org_1',
      groupId: 'grp_1',
      fiscalYear: 2026,
      amountJpy: 1_000_000,
      note: '通常予算',
    });
    expect(r.success).toBe(true);
  });

  it('coerces stringified amount', () => {
    const r = setBudgetSchema.parse({
      organizationId: 'org_1',
      groupId: null,
      fiscalYear: '2026',
      amountJpy: '500000',
    });
    expect(r.amountJpy).toBe(500000);
    expect(r.fiscalYear).toBe(2026);
  });

  it('rejects negative amount', () => {
    const r = setBudgetSchema.safeParse({
      organizationId: 'org_1',
      groupId: null,
      fiscalYear: 2026,
      amountJpy: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects amount over 10億', () => {
    const r = setBudgetSchema.safeParse({
      organizationId: 'org_1',
      groupId: null,
      fiscalYear: 2026,
      amountJpy: 1_000_000_001,
    });
    expect(r.success).toBe(false);
  });

  it('rejects fiscalYear out of range', () => {
    const tooOld = setBudgetSchema.safeParse({
      organizationId: 'org_1',
      groupId: null,
      fiscalYear: 2019,
      amountJpy: 1000,
    });
    const tooNew = setBudgetSchema.safeParse({
      organizationId: 'org_1',
      groupId: null,
      fiscalYear: 2101,
      amountJpy: 1000,
    });
    expect(tooOld.success).toBe(false);
    expect(tooNew.success).toBe(false);
  });

  it('rejects empty organizationId', () => {
    const r = setBudgetSchema.safeParse({
      organizationId: '',
      groupId: null,
      fiscalYear: 2026,
      amountJpy: 100,
    });
    expect(r.success).toBe(false);
  });

  it('rejects note over 500 chars', () => {
    const r = setBudgetSchema.safeParse({
      organizationId: 'org_1',
      groupId: null,
      fiscalYear: 2026,
      amountJpy: 100,
      note: 'a'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('createExpenseSchema', () => {
  const valid = {
    organizationId: 'org_1',
    groupId: 'grp_1',
    date: '2026-04-01',
    description: 'コート代',
    amount: 5000,
    classification: 'group_funded' as const,
  };

  it('accepts minimal valid input', () => {
    const r = createExpenseSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects future date (>= today + 1 day)', () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const r = createExpenseSchema.safeParse({ ...valid, date: future });
    expect(r.success).toBe(false);
  });

  it('rejects empty description', () => {
    const r = createExpenseSchema.safeParse({ ...valid, description: '' });
    expect(r.success).toBe(false);
  });

  it('rejects description over 500 chars', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      description: 'a'.repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero or negative amount', () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, amount: 0 }).success,
    ).toBe(false);
    expect(
      createExpenseSchema.safeParse({ ...valid, amount: -100 }).success,
    ).toBe(false);
  });

  it('rejects non-integer amount', () => {
    const r = createExpenseSchema.safeParse({ ...valid, amount: 100.5 });
    expect(r.success).toBe(false);
  });

  it('rejects amount over 1000万', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      amount: 10_000_001,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty groupId', () => {
    const r = createExpenseSchema.safeParse({ ...valid, groupId: '' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid classification', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      classification: 'invalid',
    });
    expect(r.success).toBe(false);
  });

  it('accepts T + 13 digits invoice number', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      invoiceNumber: 'T1234567890123',
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed invoice number', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      invoiceNumber: 'T12345',
    });
    expect(r.success).toBe(false);
  });

  it('accepts empty string for invoice number', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      invoiceNumber: '',
    });
    expect(r.success).toBe(true);
  });

  it('accepts attachments within size and mime limits', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      attachments: [
        {
          objectKey: 'org_1/exp_1/01abc.pdf',
          fileName: 'receipt.pdf',
          contentType: 'application/pdf',
          size: 1024 * 1024,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects attachment size > 10MB', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      attachments: [
        {
          objectKey: 'org_1/exp_1/01abc.pdf',
          fileName: 'receipt.pdf',
          contentType: 'application/pdf',
          size: 10 * 1024 * 1024 + 1,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects attachment with disallowed mime type', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      attachments: [
        {
          objectKey: 'org_1/exp_1/01abc.exe',
          fileName: 'malware.exe',
          contentType: 'application/x-msdownload',
          size: 1024,
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('updateExpenseSchema', () => {
  it('requires id', () => {
    const r = updateExpenseSchema.safeParse({ description: 'updated' });
    expect(r.success).toBe(false);
  });

  it('accepts partial update', () => {
    const r = updateExpenseSchema.safeParse({ id: 'exp_1', amount: 1500 });
    expect(r.success).toBe(true);
  });
});

describe('submitExpenseSchema', () => {
  it('requires id', () => {
    expect(submitExpenseSchema.safeParse({ id: 'exp_1' }).success).toBe(true);
    expect(submitExpenseSchema.safeParse({ id: '' }).success).toBe(false);
  });
});

describe('approveExpenseSchema', () => {
  it('accepts valid approve', () => {
    const r = approveExpenseSchema.safeParse({
      id: 'exp_1',
      classification: 'group_funded',
      comment: 'OK',
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad classification', () => {
    const r = approveExpenseSchema.safeParse({
      id: 'exp_1',
      classification: 'invalid',
    });
    expect(r.success).toBe(false);
  });
});

describe('rejectExpenseSchema', () => {
  it('requires reason', () => {
    expect(
      rejectExpenseSchema.safeParse({ id: 'exp_1', reason: '' }).success,
    ).toBe(false);
    expect(
      rejectExpenseSchema.safeParse({ id: 'exp_1', reason: '不備あり' })
        .success,
    ).toBe(true);
  });
});

describe('reclassifyExpenseSchema', () => {
  it('accepts valid reclassify', () => {
    const r = reclassifyExpenseSchema.safeParse({
      id: 'exp_1',
      newClassification: 'personal',
    });
    expect(r.success).toBe(true);
  });
});

describe('inviteUserSchema', () => {
  it('accepts valid email', () => {
    const r = inviteUserSchema.safeParse({
      email: 'foo@example.com',
      organizationId: 'org_1',
      role: 'member',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const r = inviteUserSchema.safeParse({
      email: 'not-an-email',
      organizationId: 'org_1',
      role: 'member',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const r = inviteUserSchema.safeParse({
      email: 'foo@example.com',
      organizationId: 'org_1',
      role: 'owner',
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional groupId + groupRole', () => {
    const r = inviteUserSchema.safeParse({
      email: 'foo@example.com',
      organizationId: 'org_1',
      role: 'member',
      groupId: 'grp_1',
      groupRole: 'manager',
    });
    expect(r.success).toBe(true);
  });
});

describe('updateMemberRoleSchema', () => {
  it('accepts owner role', () => {
    const r = updateMemberRoleSchema.safeParse({
      organizationId: 'org_1',
      userId: 'user_1',
      role: 'owner',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const r = updateMemberRoleSchema.safeParse({
      organizationId: 'org_1',
      userId: 'user_1',
      role: 'guest',
    });
    expect(r.success).toBe(false);
  });
});

describe('deactivateMemberSchema / cancel / resend', () => {
  it('all require organizationId + id pair', () => {
    expect(
      deactivateMemberSchema.safeParse({
        organizationId: 'org_1',
        userId: 'user_1',
      }).success,
    ).toBe(true);
    expect(
      cancelInvitationSchema.safeParse({
        organizationId: 'org_1',
        invitationId: 'inv_1',
      }).success,
    ).toBe(true);
    expect(
      resendInvitationSchema.safeParse({
        organizationId: 'org_1',
        invitationId: 'inv_1',
      }).success,
    ).toBe(true);
  });

  it('all reject empty strings', () => {
    expect(
      deactivateMemberSchema.safeParse({
        organizationId: '',
        userId: 'user_1',
      }).success,
    ).toBe(false);
  });
});
