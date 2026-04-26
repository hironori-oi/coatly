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
