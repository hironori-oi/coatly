/**
 * Next.js 16: middleware → proxy リネームに準拠（tech-stack.md §Next 16 注意点）。
 *
 * 役割: 認証ガード（未ログインなら /login へリダイレクト）
 *
 * 注意:
 * - 公開ルート（/login, /invite, /privacy, /terms）はそのまま通す。
 * - Cookie の存在チェックのみ（厳密な検証は Server Action 側で auth.api.getSession）
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from '@/lib/auth/session';

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

  const session = await getSessionCookie(req);
  if (!session) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
