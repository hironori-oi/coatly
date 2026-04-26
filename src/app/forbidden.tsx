/**
 * 403 Forbidden ページ（Next 16 authInterrupts 用）
 *
 * `forbidden()` (next/navigation) が呼ばれたときに表示される。
 * status code 403 を確実に返すために必要。詳細: DEC-041 参照。
 */
import Link from 'next/link';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md space-y-4 rounded-[14px] border border-border bg-card p-6 text-center">
        <LockClosedIcon
          className="mx-auto h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-xl font-semibold">アクセス権がありません</h2>
        <p className="text-sm text-muted-foreground">
          このページを閲覧する権限がありません。組織管理者にお問い合わせください。
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="accent" size="sm" asChild>
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
