/**
 * 活動費 新規申請（W2-B 本実装 / Phase 1 polish: 共有 ExpenseForm を使用）
 *
 * - Server Component で組織の visible groups を取得
 * - 認可は (app)/[organizationSlug]/layout.tsx で確認済みだが、再度 SSR 上で
 *   取得した groupId のみを Client form に渡すことで安全性を確保
 */
import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { organizations, groups } from '@/lib/db/schema';
import { requireOrganizationRole } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';
import { scopedGroups } from '@/lib/db/scoped';
import { ExpenseForm } from '@/components/expense-form';

export const metadata = {
  title: '新規申請',
};

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  if (!orgRows[0]) notFound();

  let groupOptions: { id: string; code: string; name: string }[] = [];
  let homeGroupId: string | undefined;

  try {
    const ctx = await requireOrganizationRole(orgRows[0].id, [
      'owner',
      'admin',
      'member',
    ]);
    const rows = await scopedGroups(ctx).orderBy(groups.displayOrder);
    groupOptions = rows.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
    }));

    if (groupOptions.length === 0 && ctx.orgRole !== 'member') {
      const all = await db
        .select()
        .from(groups)
        .where(eq(groups.organizationId, orgRows[0].id))
        .orderBy(groups.displayOrder);
      groupOptions = all.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
      }));
    }

    homeGroupId = groupOptions[0]?.id;
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 401)
        redirect(`/login?next=/${organizationSlug}/expenses/new`);
      notFound();
    }
    throw e;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">新規申請</h1>
      <ExpenseForm
        mode="create"
        organizationId={orgRows[0].id}
        organizationSlug={organizationSlug}
        groups={groupOptions}
        defaultGroupId={homeGroupId}
      />
    </div>
  );
}
