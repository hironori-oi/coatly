/**
 * Resend メール送信ラッパ（W3 本実装）
 *
 * - 環境変数 `RESEND_API_KEY` 未設定時は dev fallback として
 *   `console.log` でメール内容を出力（本番 build / dev 起動を止めない）
 * - 全関数は失敗時に throw せず `{ ok, id?, error? }` を返す
 *   （業務ロジックを止めないために、メール送信失敗は logger.warn のみ）
 *
 * 仕様: dev-technical-spec-v2.md §3.4 / §13 / DEC-011
 */
import { Resend } from 'resend';
import { render } from '@react-email/components';
import type { ReactElement } from 'react';

// DEC-032: 送信元はメインドメイン直 `Coatly <noreply@improver.jp>`、
//          Reply-To は `support@improver.jp`。
// 後方互換のため旧 `RESEND_FROM` 環境変数も読む（廃止予定）。
const FROM_DEFAULT =
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM ??
  'Coatly <onboarding@resend.dev>';

const REPLY_TO_DEFAULT = process.env.EMAIL_REPLY_TO || undefined;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.BETTER_AUTH_URL ??
  'http://localhost:3000';

let _resend: Resend | null = null;
let _warned = false;

/**
 * Resend クライアントを lazy 取得。
 *
 * - RESEND_API_KEY 未設定時は null を返し、呼び出し側は console fallback を使う
 * - build 時は env 未設定でも初期化エラーで落ちないようにする
 */
function getClient(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!_warned) {
       
      console.warn(
        '[email] RESEND_API_KEY is not set. Falling back to console.log.',
      );
      _warned = true;
    }
    return null;
  }
  _resend = new Resend(key);
  return _resend;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** React Email テンプレ（react-email/components で組んだもの）*/
  react: ReactElement;
  /** 任意: replyTo */
  replyTo?: string;
  /** 任意: From override（既定: process.env.RESEND_FROM）*/
  from?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/**
 * メール送信。Resend が無効な環境では console.log fallback。
 * 失敗時も throw しない（呼び出し側で logger.warn する想定）。
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  const from = input.from ?? FROM_DEFAULT;

  // dev fallback: テンプレートを HTML にレンダして console に出す
  if (!client) {
    try {
      const html = await render(input.react);
       
      console.log(
        `[email:fallback] from=${from} to=${JSON.stringify(input.to)} subject=${JSON.stringify(input.subject)}\n--- html ---\n${html}\n--- end ---`,
      );
      return { ok: true, id: null };
    } catch (e) {
       
      console.warn('[email:fallback] render failed', e);
      return { ok: false, error: 'render_failed' };
    }
  }

  try {
    const result = await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      react: input.react,
      replyTo: input.replyTo ?? REPLY_TO_DEFAULT,
    });

    if (result.error) {
       
      console.warn('[email] resend error', result.error);
      return { ok: false, error: result.error.message ?? 'resend_error' };
    }
    return { ok: true, id: result.data?.id ?? null };
  } catch (e) {
     
    console.warn('[email] send failed', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'unknown_error',
    };
  }
}

/**
 * APP_URL を返す（テンプレートのリンク生成用）。
 */
export function getAppUrl(): string {
  return APP_URL;
}

// ─────────────────────────────────────────────────────────────────
// 招待メール（W3-A polish: 高レベル convenience API）
// ─────────────────────────────────────────────────────────────────

export type SendInvitationEmailInput = {
  to: string;
  orgName: string;
  inviteUrl: string;
  inviterName: string;
  /** 表示名（任意）。未指定時は to をそのまま使う */
  recipientName?: string;
  /** ja-JP 表示の有効期限（任意） */
  expiresAtLabel?: string;
  /** ロール表示（任意、既定: 'member'） */
  roleLabel?: string;
};

/**
 * 招待メールを送る（HTML + Plain text 両方）。
 *
 * - HTML: `InvitationEmail`（react-email/components）から render
 * - Plain text: 同じ React tree を `render(..., { plainText: true })` で生成
 * - Resend SDK 未設定時は console fallback（dev / build 安全）
 *
 * 仕様: dev-technical-spec-v2.md §3.4 / DEC-032（From: noreply@improver.jp,
 * Reply-To: support@improver.jp）。
 */
export async function sendInvitationEmail(
  input: SendInvitationEmailInput,
): Promise<SendEmailResult> {
  const { InvitationEmail } = await import('./templates/invitation');
  const expiresLabel =
    input.expiresAtLabel ??
    new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const reactNode = InvitationEmail({
    recipientName: input.recipientName,
    recipientEmail: input.to,
    organizationName: input.orgName,
    inviterName: input.inviterName,
    inviteUrl: input.inviteUrl,
    expiresAtLabel: expiresLabel,
    roleLabel: input.roleLabel ?? 'member',
  });

  const client = getClient();
  const from = FROM_DEFAULT;
  const subject = `${input.orgName} から Coatly への招待`;

  // Plain text fallback（受信者のメールクライアントが HTML を表示できない場合の保険）
  const text = await render(reactNode, { plainText: true });

  if (!client) {
    try {
      const html = await render(reactNode);
      console.warn(
        `[email:fallback] from=${from} to=${JSON.stringify(input.to)} subject=${JSON.stringify(subject)}\n--- html ---\n${html}\n--- text ---\n${text}\n--- end ---`,
      );
      return { ok: true, id: null };
    } catch (e) {
      console.warn('[email:fallback] render failed', e);
      return { ok: false, error: 'render_failed' };
    }
  }

  try {
    const result = await client.emails.send({
      from,
      to: input.to,
      subject,
      react: reactNode,
      text,
      replyTo: REPLY_TO_DEFAULT,
    });
    if (result.error) {
      console.warn('[email:invitation] resend error', result.error);
      return { ok: false, error: result.error.message ?? 'resend_error' };
    }
    return { ok: true, id: result.data?.id ?? null };
  } catch (e) {
    console.warn('[email:invitation] send failed', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'unknown_error',
    };
  }
}
