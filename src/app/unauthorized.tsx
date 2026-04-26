/**
 * 401 Unauthorized ページ（Next 16 authInterrupts 用）
 *
 * `unauthorized()` (next/navigation) が呼ばれたときに表示される。
 * status code 401 を確実に返すために必要。詳細: DEC-041 参照。
 */
import Link from 'next/link';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md space-y-4 rounded-[14px] border border-border bg-card p-6 text-center">
        <ArrowRightOnRectangleIcon
          className="mx-auto h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-xl font-semibold">ログインが必要です</h2>
        <p className="text-sm text-muted-foreground">
          このページを閲覧するにはログインが必要です。
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="accent" size="sm" asChild>
            <Link href="/login">ログインページへ</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
