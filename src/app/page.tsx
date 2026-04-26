/**
 * ルートエントリ（DEC-020: マーケティング LP 廃止 → アプリ画面直行）
 *
 * オーナー方針: 公開 LP は不要。`/` は即アプリへ。
 *
 * フロー:
 *   1. セッションなし → /login
 *   2. セッションあり + 組織所属あり → /[organizationSlug]/dashboard
 *   3. セッションあり + 組織所属なし → /login（招待リンクから入る運用）
 *
 * ここは Server Component で同期的にリダイレクトする（Cookie/DB 直アクセス）。
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq, asc } from 'drizzle-orm';
import { auth } from '@/lib/auth/better-auth';
import { db } from '@/lib/db/client';
import { memberships, organizations } from '@/lib/db/schema';

export default async function RootRedirect() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/login');
  }

  // 所属組織を取得（最初に追加された組織を primary とみなす）
  const rows = await db
    .select({ slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, session.user.id))
    .orderBy(asc(memberships.createdAt))
    .limit(1);

  if (!rows[0]) {
    // 組織未所属 = 招待を受け取っていない or 解除済み。/login へ戻して招待リンク導線へ。
    redirect('/login?reason=no-org');
  }

  redirect(`/${rows[0].slug}/dashboard`);
}
