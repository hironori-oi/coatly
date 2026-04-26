import { z } from 'zod';

export const inviteUserSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  organizationId: z.string().min(1),
  role: z.enum(['admin', 'member']),
  groupId: z.string().optional(),
  groupRole: z.enum(['manager', 'member']).optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateMemberRoleSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member']),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const deactivateMemberSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});
export type DeactivateMemberInput = z.infer<typeof deactivateMemberSchema>;

export const cancelInvitationSchema = z.object({
  organizationId: z.string().min(1),
  invitationId: z.string().min(1),
});
export type CancelInvitationInput = z.infer<typeof cancelInvitationSchema>;

export const resendInvitationSchema = z.object({
  organizationId: z.string().min(1),
  invitationId: z.string().min(1),
});
export type ResendInvitationInput = z.infer<typeof resendInvitationSchema>;
