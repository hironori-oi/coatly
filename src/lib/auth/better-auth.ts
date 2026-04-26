/**
 * Better Auth セットアップ
 *
 * dev-technical-spec-v2.md §4.1 に準拠。
 * - email + password 認証（10 文字以上）
 * - organization plugin（招待制 / role 管理）
 * - magicLink plugin（招待後の SHOULD / passwordless）
 * - admin plugin（admin 操作）
 *
 * Better Auth は Drizzle adapter を使い、auth_sessions / auth_accounts /
 * auth_verification_tokens テーブルを直接読み書きする。
 *
 * Note: better-auth 1.6.x のプラグインは `better-auth/plugins` から
 * 直接 import する（`@better-auth/plugins` ではない）。
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  organization,
  magicLink,
  admin as adminPlugin,
} from 'better-auth/plugins';
import { db } from '@/lib/db/client';
import * as dbSchema from '@/lib/db/schema';
import { notifyInvitation, notifyMagicLink } from '@/lib/email/notify';

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.BETTER_AUTH_URL ??
  'http://localhost:3000';

export const auth = betterAuth({
  baseURL: APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    /**
     * Drizzle schema 全体を渡し、`usePlural: true` で複数形のテーブル名 (users) を
     * Better Auth の model 名 (user) に対応付ける。
     * 我々の export 名は users / authSessions / authAccounts / authVerificationTokens で、
     * Better Auth の期待は user / session / account / verification なので、
     * 一致しない部分は organization plugin の schema option と同様にマップする。
     */
    schema: {
      ...dbSchema,
      // Better Auth コア model 名（user / session / account / verification）への alias
      user: dbSchema.users,
      session: dbSchema.authSessions,
      account: dbSchema.authAccounts,
      verification: dbSchema.authVerificationTokens,
      // organization plugin の model 名（organization / member / invitation）への alias
      organization: dbSchema.organizations,
      member: dbSchema.memberships,
      invitation: dbSchema.invitations,
    },
    usePlural: false,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: false, // 招待制のため verify 済み扱い
    autoSignIn: true,
  },
  /**
   * Brute-force 対策の rate limit。
   *
   * - storage: 'memory'（in-memory / 単一インスタンス前提。MVP では Vercel
   *   serverless が水平スケールしてもログインは特定ユーザに集中するため
   *   インスタンスごとに 5/min でも十分な抑止力。Phase 2 で
   *   secondary-storage（Upstash 等）に切替予定）
   * - 既定: 60 秒 window で 100 req（その他のエンドポイント）
   * - customRules で `/sign-in/email` のみ 5/min/IP に強化（DEC-NEW: brute-force 対策）
   * - 6 回目以降は 429 + JSON `{ message: 'Too many requests' }`
   *
   * 注: customRules の key は base path（'/api/auth' プレフィックス無し）。
   * 1.6.x では path は '/sign-in/email' 形式で指定する。
   *
   * 注: enabled の既定は production のみだが、テストや local stg でも
   * brute-force 抑止を働かせたいので明示 true にする。
   */
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    expiresIn: 60 * 60 * 24 * 30, // 30 日
    updateAge: 60 * 60 * 24, // 1 日ごとに更新
  },
  advanced: {
    cookies: {
      session_token: {
        attributes: {
          sameSite: 'strict',
          // 開発時 (http://localhost) でも session を発行できるよう
          // production のみ secure にする
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
        },
      },
    },
  },
  plugins: [
    organization({
      // 招待制 SaaS のため、ユーザー側からの新規組織作成は無効
      allowUserToCreateOrganization: false,
      organizationLimit: 5,
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 日
      sendInvitationEmail: async ({ email, organization, invitation, inviter }) => {
        const inviteLink = `${APP_URL}/invite/${invitation.id}?email=${encodeURIComponent(email)}`;
        try {
          await notifyInvitation({
            email,
            organizationName: organization.name,
            inviterName:
              inviter?.user?.name || inviter?.user?.email || 'Coatly Admin',
            inviteUrl: inviteLink,
            expiresAt: invitation.expiresAt,
            role: invitation.role ?? 'member',
          });
        } catch (e) {
          // メール送信失敗は招待自体を止めない
           
          console.warn('[invite] notifyInvitation failed', e);
        }
      },
    }),
    magicLink({
      expiresIn: 60 * 5, // 5 分
      sendMagicLink: async ({ email, url }) => {
        try {
          await notifyMagicLink({ email, url });
        } catch (e) {
           
          console.warn('[magic-link] notifyMagicLink failed', e);
        }
      },
    }),
    adminPlugin(),
  ],
});

export type Auth = typeof auth;
export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
