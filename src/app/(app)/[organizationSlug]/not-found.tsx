/**
 * 組織コンテキスト配下の 404 表示。
 *
 * Server Component で問題ない（'use client' 不要）。
 * 失効した URL や別組織の slug を踏んだ場合などのフォールバック。
 */
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-[14px] border border-border bg-card p-6 text-center">
      <MagnifyingGlassIcon
        className="mx-auto h-10 w-10 text-muted-foreground"
        aria-hidden="true"
      />
      <h2 className="text-xl font-semibold">ページが見つかりません</h2>
      <p className="text-sm text-muted-foreground">
        URL が間違っているか、アクセス権が変更された可能性があります。
      </p>
      <div className="flex justify-center gap-2">
        <Button variant="accent" size="sm" asChild>
          <Link href="/">トップへ戻る</Link>
        </Button>
      </div>
    </div>
  );
}
