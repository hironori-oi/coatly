/**
 * 全体管理セクション用の認可レイヤ（W2-C 認可漏洩 E2E C2 対応）
 *
 * 親 layout (organizations/[organizationSlug]/layout.tsx) は member も通すため、
 * /admin/* 配下では追加で owner/admin のみ許可する必要がある。
 *
 * 不正アクセス時は forbidden() で 403 を返す（authInterrupts 有効）。
 * 組織自体が存在しない場合のみ notFound() で 404。
 */
import { eq } from 'drizzle-orm';
import { forbidden, notFound, unauthorized } from 'next/navigation';
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
        // 未ログイン: middleware がほぼ防ぐが念のため /login へ
        unauthorized();
      }
      // 403 = member 等が踏んだ
      // Next 16 の notFound() は nested layout 起点だと streaming 開始後に
      // 呼ばれて 200 のまま帰ってしまう（status code が確定済）。
      // forbidden() は authInterrupts 有効時に 403 + forbidden.tsx を確実に返す。
      forbidden();
    }
    throw e;
  }

  return <>{children}</>;
}
