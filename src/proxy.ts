/**
 * Next.js 16: middleware → proxy リネームに準拠（tech-stack.md §Next 16 注意点）。
 *
 * 役割:
 *  1. 認証ガード: 未ログインなら /login へリダイレクト（Cookie 存在チェック）
 *  2. 認可ガード (DEC-042):
 *     - /[org]/admin/*           → owner | admin のみ許可（C2 / C7）
 *     - /[org]/expenses/[id]     → expense read 権限（C3）
 *     - /[org]/expenses/[id]/edit → expense write 権限（C4）
 *     違反は `new NextResponse(..., { status: 403 | 404 })` で **HTTP status を確定** させる。
 *     これは Next 16 の `forbidden()` が nested layout / page では status 200 を
 *     返してしまう仕様 (issue #83671) の恒久対策。
 *
 * 注意:
 * - 公開ルート（/login, /invite, /privacy, /terms）はそのまま通す。
 * - Cookie の存在チェックのみで未ログイン判定 → fast path（DB 不要）。
 * - 認可判定は session があるルートのみ実行（軽量 SQL）。
 * - layout / page 側の `forbidden()` 呼び出しは fail-safe として残置（DEC-042）。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from '@/lib/auth/session';
import {
  getMiddlewareSession,
  getOrgRole,
  checkExpenseAccess,
} from '@/lib/auth/middleware-guards';

// /[org]/admin(/...)? を捕捉する。`/api` や `/_next` 等は config.matcher で除外済。
const ADMIN_RE = /^\/([^/]+)\/admin(?:\/|$)/;
// /[org]/expenses/[id] および /edit を捕捉。`/expenses` 一覧と /expenses/new は除外する。
const EXPENSE_DETAIL_RE = /^\/([^/]+)\/expenses\/([^/]+?)(\/edit)?\/?$/;

export async function proxy(req: NextRequest) {
  const url = req.nextUrl.pathname;

  const isPublic =
    url === '/' ||
    url.startsWith('/login') ||
    url.startsWith('/invite') ||
    url.startsWith('/privacy') ||
    url.startsWith('/terms') ||
    url.startsWith('/api/auth') ||
    url.startsWith('/api/health') ||
    url.startsWith('/_next') ||
    url.startsWith('/favicon');

  if (isPublic) return NextResponse.next();

  // 1) cookie レベルで未ログインなら /login へ redirect（fast path）
  const cookie = await getSessionCookie(req);
  if (!cookie) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', url);
    return NextResponse.redirect(login);
  }

  // 2) 認可判定が必要なパスか先に判定（DB アクセスを避けるため）
  const adminMatch = ADMIN_RE.exec(url);
  const expenseMatch = adminMatch ? null : EXPENSE_DETAIL_RE.exec(url);

  if (!adminMatch && !expenseMatch) {
    // 通常ルート: cookie があれば通す
    return NextResponse.next();
  }

  // 3) session 取得（cookieCache が効くため通常 DB hit 1 回未満）
  const session = await getMiddlewareSession(req);
  if (!session) {
    // cookie はあるが Better Auth 的に invalid → /login
    const login = new URL('/login', req.url);
    login.searchParams.set('next', url);
    return NextResponse.redirect(login);
  }

  // 4-A) /[org]/admin/* → owner | admin のみ
  if (adminMatch) {
    const orgSlug = adminMatch[1];
    const result = await getOrgRole(session.user.id, orgSlug);
    if (!result) {
      // 別組織 / 組織不在 → 404 で漏洩を防ぐ
      return new NextResponse('Not Found', { status: 404 });
    }
    if (result.role !== 'owner' && result.role !== 'admin') {
      return new NextResponse('Forbidden', { status: 403 });
    }
    return NextResponse.next();
  }

  // 4-B) /[org]/expenses/[id] (詳細) または /edit (編集) → expense access check
  if (expenseMatch) {
    const orgSlug = expenseMatch[1];
    const expenseId = expenseMatch[2];
    const isEdit = !!expenseMatch[3];

    // /expenses/new は new ルートのため除外
    if (expenseId === 'new') return NextResponse.next();

    const result = await checkExpenseAccess(
      session.user.id,
      orgSlug,
      expenseId,
      isEdit ? 'write' : 'read',
    );
    if (result === 'not-found') {
      return new NextResponse('Not Found', { status: 404 });
    }
    if (result === 'forbidden') {
      return new NextResponse('Forbidden', { status: 403 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
