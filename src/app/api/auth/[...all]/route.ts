/**
 * Better Auth catch-all Route Handler
 *
 * Better Auth は GET / POST を内部でハンドリングする。
 * すべてのパスを auth.handler に委譲する。
 *
 * POC-1: このエンドポイントが /api/auth/sign-up/email や /api/auth/session 等を
 * 受け付けて Drizzle adapter 経由で auth_sessions / auth_accounts /
 * auth_verification_tokens に書き込めれば合格。
 */
import { auth } from '@/lib/auth/better-auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth.handler);
