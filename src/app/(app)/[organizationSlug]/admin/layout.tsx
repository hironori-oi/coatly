/**
 * 全体管理セクション用の認可レイヤ（W2-C 認可漏洩 E2E C2 対応）
 *
 * 親 layout (organizations/[organizationSlug]/layout.tsx) は member も通すため、
 * /admin/* 配下では追加で owner/admin のみ許可する必要がある。
 *
 * 不正アクセス時は notFound() で 404 を返す（403 のリーク防止）。
 */
import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { organizations } from '@/lib/db/schema';
import { requireOrganizationRole } from '@/lib/auth/guards';
import { AuthError } from '@/lib/errors';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  const org = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  if (!org[0]) notFound();

  try {
    await requireOrganizationRole(org[0].id, ['owner', 'admin']);
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.status === 401) {
        redirect(`/login?next=/${organizationSlug}/admin/overview`);
      }
      // 403 = member 等が踏んだ → 404 (リーク防止)
      notFound();
    }
    throw e;
  }

  return <>{children}</>;
}
