/**
 * Next.js instrumentation hook（server / edge ランタイム）
 *
 * - Sentry を server / edge runtime で初期化する
 * - DSN 未設定時は何もしない（dev / CI で安全）
 * - サンプリングは production 0.1 / dev 1.0
 *
 * 参考:
 *   https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const isProduction = process.env.NODE_ENV === 'production';
  const tracesSampleRate = isProduction ? 0.1 : 1.0;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      tracesSampleRate,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      // server で受信した秘密情報をフィルタする
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      tracesSampleRate,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      sendDefaultPii: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
