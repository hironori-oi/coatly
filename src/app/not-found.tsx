/**
 * Root 404 ページ
 */
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

export const metadata = { title: '404 Not Found' };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-[14px] border border-border bg-card p-8 text-center">
        <MagnifyingGlassIcon
          className="mx-auto h-12 w-12 text-muted-foreground"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold">ページが見つかりません</h1>
        <p className="text-sm text-muted-foreground">
          URL が間違っているか、削除された可能性があります。
        </p>
        <Button variant="accent" size="sm" asChild>
          <Link href="/">トップへ戻る</Link>
        </Button>
      </div>
    </main>
  );
}
