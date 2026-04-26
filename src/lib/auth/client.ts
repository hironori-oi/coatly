/**
 * Better Auth クライアント（React 用）
 *
 * Server 側の `better-auth.ts` に対応するクライアント設定。
 * 'use client' で使うフォーム・コンポーネントから import する。
 *
 * Server の plugins と同等のクライアントプラグイン（型推論用）を登録すると、
 * `authClient.organization.*` / `authClient.magicLink.*` / `authClient.admin.*`
 * が型安全に呼べるようになる。
 */
import { createAuthClient } from 'better-auth/react';
import {
  organizationClient,
  magicLinkClient,
  adminClient,
} from 'better-auth/client/plugins';

const baseURL =
  (typeof window === 'undefined'
    ? process.env.NEXT_PUBLIC_APP_URL
    : window.location.origin) ?? 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL,
  plugins: [organizationClient(), magicLinkClient(), adminClient()],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
