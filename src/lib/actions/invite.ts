'use server';

/**
 * 招待 / メンバー管理 Server Actions（Phase 1 polish 本実装）
 *
 * 認可: 全 action 冒頭で requireOrganizationRole(orgId, ['owner', 'admin'])
 * 監査: audit_logs に 1 行 INSERT
 * メール: notifyInvitation で送信（fail しても DB 状態は維持）
 *
 * 注: Better Auth の organization plugin 経由で招待を作る方式は signature が
 * 不安定なため、ここでは直接 invitations テーブルに INSERT する（完了後の
 * acceptInvitation も Server Action 化する想定で /invite/[token] 側で実装済み）。
 */
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { db } from '@/lib/db/client';
import {
  invitations,
  organizations,
  memberships,
  users,
  groupMemberships,
  auditLogs,
} from '@/lib/db/schema';
import {
  inviteUserSchema,
  updateMemberRoleSchema,
  deactivateMemberSchema,
  cancelInvitationSchema,
  resendInvitationSchema,
  type InviteUserInput,
  type UpdateMemberRoleInput,
  type DeactivateMemberInput,
  type CancelInvitationInput,
  type ResendInvitationInput,
} from '@/lib/validation/invite';
import { requireOrganizationRole } from '@/lib/auth/guards';
import {
  AuthError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { notifyInvitation } from '@/lib/email/notify';
import { sendInvitationEmail } from '@/lib/email/resend';
import type { ActionErrorCode, ActionResult } from './expense';

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.BETTER_AUTH_URL ??
  'http://localhost:3000';

const INVITATION_TTL_DAYS = 7;

function toError(e: unknown): {
  ok: false;
  error: string;
  code: ActionErrorCode;
} {
  if (e instanceof AuthError) {
    return {
      ok: false,
      error: e.message,
      code: e.status === 401 ? 'unauthorized' : 'forbidden',
    };
  }
  if (e instanceof NotFoundError) {
    return { ok: false, error: e.message, code: 'not_found' };
  }
  if (e instanceof ValidationError) {
    return { ok: false, error: e.message, code: 'validation' };
  }
  if (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: string }).name === 'ZodError'
  ) {
    return {
      ok: false,
      error: '入力内容を確認してください',
      code: 'validation',
    };
  }
  console.error('[invite action] internal', e);
  return { ok: false, error: 'internal_error', code: 'internal' };
}

/**
 * 招待を発行する。
 *
 * フロー:
 *  1. 既存メンバーであれば 400
 *  2. pending invitation が同 email × 同 org に存在 → 上書き（再送扱い）
 *  3. invitations に INSERT、メール送信
 */
export async function inviteMember(
  input: InviteUserInput,
): Promise<ActionResult> {
  try {
    const data = inviteUserSchema.parse(input);
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
    ]);

    // 既存メンバー判定
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);

    if (existingUser[0]) {
      const existingMember = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, existingUser[0].id),
            eq(memberships.organizationId, data.organizationId),
          ),
        )
        .limit(1);
      if (existingMember[0]) {
        throw new ValidationError('既にこの組織のメンバーです');
      }
    }

    // 既存 pending 招待があれば取消
    const existingInv = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, data.organizationId),
          eq(invitations.email, data.email.toLowerCase()),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1);

    if (existingInv[0]) {
      await db
        .update(invitations)
        .set({ status: 'canceled' })
        .where(eq(invitations.id, existingInv[0].id));
    }

    const invitationId = ulid();
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await db.insert(invitations).values({
      id: invitationId,
      organizationId: data.organizationId,
      email: data.email.toLowerCase(),
      role: data.role,
      status: 'pending',
      expiresAt,
      inviterId: ctx.user.id,
    });

    // 監査
    await db.insert(auditLogs).values({
      organizationId: data.organizationId,
      actorId: ctx.user.id,
      entity: 'invitation',
      entityId: invitationId,
      action: 'create',
      diff: {
        email: data.email,
        role: data.role,
        groupId: data.groupId,
        groupRole: data.groupRole,
      },
    });

    const orgRows = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);

    if (orgRows[0]) {
      const inviterName =
        ctx.user.name?.trim() || ctx.user.email || 'Coatly Admin';
      const inviteUrl = `${APP_URL}/invite/${invitationId}?email=${encodeURIComponent(data.email)}`;
      // W3-A polish: 主送信は sendInvitationEmail（HTML + plain text）。
      // notifyInvitation は型互換のため残置（過去の他経路から参照される可能性）。
      try {
        const r = await sendInvitationEmail({
          to: data.email,
          orgName: orgRows[0].name,
          inviteUrl,
          inviterName,
          expiresAtLabel: expiresAt.toLocaleString('ja-JP'),
          roleLabel: data.role,
        });
        if (!r.ok) {
          console.warn('[inviteMember] sendInvitationEmail not ok', r.error);
        }
      } catch (mailErr) {
        console.warn('[inviteMember] mail failed', mailErr);
      }
      revalidatePath(`/${orgRows[0].slug}/admin/members`);
    }

    return { ok: true, id: invitationId };
  } catch (e) {
    return toError(e);
  }
}

// notifyInvitation は他経路（Better Auth plugin の sendInvitationEmail callback 等）
// で使われているため import は残す。
void notifyInvitation;

/**
 * 既存メンバーの組織内ロールを変更する。
 */
export async function updateMemberRole(
  input: UpdateMemberRoleInput,
): Promise<ActionResult> {
  try {
    const data = updateMemberRoleSchema.parse(input);
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
    ]);

    if (ctx.user.id === data.userId) {
      throw new ValidationError('自分自身のロールは変更できません');
    }

    const existing = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, data.organizationId),
          eq(memberships.userId, data.userId),
        ),
      )
      .limit(1);
    if (!existing[0]) throw new NotFoundError('membership');

    // owner ロールを付与できるのは owner のみ
    if (data.role === 'owner' && ctx.orgRole !== 'owner') {
      throw new AuthError('owner_role_required', 403);
    }

    const before = existing[0].role;

    await db
      .update(memberships)
      .set({ role: data.role })
      .where(eq(memberships.id, existing[0].id));

    await db.insert(auditLogs).values({
      organizationId: data.organizationId,
      actorId: ctx.user.id,
      entity: 'membership',
      entityId: existing[0].id,
      action: 'update',
      diff: { role: { before, after: data.role } },
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/admin/members`);
    }

    return { ok: true, id: existing[0].id };
  } catch (e) {
    return toError(e);
  }
}

/**
 * メンバーを無効化する（is_active=false）。
 * Phase 2 で本格的なソフト削除に拡張予定。
 */
export async function deactivateMember(
  input: DeactivateMemberInput,
): Promise<ActionResult> {
  try {
    const data = deactivateMemberSchema.parse(input);
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
    ]);

    if (ctx.user.id === data.userId) {
      throw new ValidationError('自分自身は無効化できません');
    }

    const existing = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, data.organizationId),
          eq(memberships.userId, data.userId),
        ),
      )
      .limit(1);
    if (!existing[0]) throw new NotFoundError('membership');

    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, data.userId));

    await db.insert(auditLogs).values({
      organizationId: data.organizationId,
      actorId: ctx.user.id,
      entity: 'membership',
      entityId: existing[0].id,
      action: 'delete',
      diff: { deactivatedUserId: data.userId },
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/admin/members`);
    }

    return { ok: true, id: existing[0].id };
  } catch (e) {
    return toError(e);
  }
}

/**
 * 招待を取消する。
 */
export async function cancelInvitation(
  input: CancelInvitationInput,
): Promise<ActionResult> {
  try {
    const data = cancelInvitationSchema.parse(input);
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
    ]);

    const existing = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, data.invitationId),
          eq(invitations.organizationId, data.organizationId),
        ),
      )
      .limit(1);
    if (!existing[0]) throw new NotFoundError('invitation');
    if (existing[0].status !== 'pending') {
      throw new ValidationError('未受諾の招待のみ取消できます');
    }

    await db
      .update(invitations)
      .set({ status: 'canceled' })
      .where(eq(invitations.id, data.invitationId));

    await db.insert(auditLogs).values({
      organizationId: data.organizationId,
      actorId: ctx.user.id,
      entity: 'invitation',
      entityId: data.invitationId,
      action: 'delete',
      diff: { canceled: true },
    });

    const orgRows = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);
    if (orgRows[0]) {
      revalidatePath(`/${orgRows[0].slug}/admin/members`);
    }

    return { ok: true, id: data.invitationId };
  } catch (e) {
    return toError(e);
  }
}

/**
 * 招待メールを再送する（既存 invitation の expiresAt を延長）。
 */
export async function resendInvitation(
  input: ResendInvitationInput,
): Promise<ActionResult> {
  try {
    const data = resendInvitationSchema.parse(input);
    const ctx = await requireOrganizationRole(data.organizationId, [
      'owner',
      'admin',
    ]);

    const existing = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, data.invitationId),
          eq(invitations.organizationId, data.organizationId),
        ),
      )
      .limit(1);
    if (!existing[0]) throw new NotFoundError('invitation');
    if (existing[0].status !== 'pending') {
      throw new ValidationError('未受諾の招待のみ再送できます');
    }

    const newExpiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await db
      .update(invitations)
      .set({ expiresAt: newExpiresAt })
      .where(eq(invitations.id, data.invitationId));

    const orgRows = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1);

    if (orgRows[0]) {
      const inviterName =
        ctx.user.name?.trim() || ctx.user.email || 'Coatly Admin';
      const inviteUrl = `${APP_URL}/invite/${data.invitationId}?email=${encodeURIComponent(existing[0].email)}`;
      try {
        const r = await sendInvitationEmail({
          to: existing[0].email,
          orgName: orgRows[0].name,
          inviteUrl,
          inviterName,
          expiresAtLabel: newExpiresAt.toLocaleString('ja-JP'),
          roleLabel: existing[0].role,
        });
        if (!r.ok) {
          console.warn(
            '[resendInvitation] sendInvitationEmail not ok',
            r.error,
          );
        }
      } catch (mailErr) {
        console.warn('[resendInvitation] mail failed', mailErr);
      }
      revalidatePath(`/${orgRows[0].slug}/admin/members`);
    }

    return { ok: true, id: data.invitationId };
  } catch (e) {
    return toError(e);
  }
}

// Workaround: TS 直接参照で未使用 import を検出させない（Phase 2 で group-membership 連動予定）
void groupMemberships;
