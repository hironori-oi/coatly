/**
 * Next.js instrumentation hook（client ランタイム）
 *
 * - ブラウザ側 Sentry 初期化（DSN は NEXT_PUBLIC_SENTRY_DSN を使う前提）
 * - DSN 未設定時は何もしない
 * - sample rate: production 0.1 / dev 1.0
 */
import * as Sentry from '@sentry/nextjs';

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? undefined;

if (dsn) {
  const isProduction = process.env.NODE_ENV === 'production';

  Sentry.init({
    dsn,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.NODE_ENV ??
      'unknown',
    sendDefaultPii: false,
  });
}

// Next 16+ がクライアントナビゲーションのスパンを構築する際に必要なフック
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
