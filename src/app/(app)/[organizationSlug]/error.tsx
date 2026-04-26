'use client';

/**
 * 組織ページ共通のエラーバウンダリ。
 *
 * Next.js App Router の error.tsx は client component 必須。
 * 想定外のエラー（DB 障害, 5xx）が発生した際の最終フォールバック。
 *
 * AuthError は各 page.tsx 内で notFound() / redirect() に変換されているため、
 * ここに到達するのは「想定外の internal error」のみ。
 */
import * as React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
     
    console.error('[organization error boundary]', error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto max-w-md space-y-4 rounded-[14px] border border-danger/30 bg-card p-6 text-center"
    >
      <ExclamationTriangleIcon
        className="mx-auto h-10 w-10 text-danger"
        aria-hidden="true"
      />
      <h2 className="text-xl font-semibold">問題が発生しました</h2>
      <p className="text-sm text-muted-foreground">
        ページの読み込み中にエラーが発生しました。再試行しても解決しない場合は
        管理者にお問い合わせください。
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          ID: {error.digest}
        </p>
      )}
      <div className="flex justify-center gap-2">
        <Button variant="accent" size="sm" onClick={() => reset()}>
          再試行
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href="/">トップへ戻る</a>
        </Button>
      </div>
    </div>
  );
}
