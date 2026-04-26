'use client';

/**
 * ヘッダ右上のユーザーメニュー（avatar + dropdown）
 *
 * Client Component（Radix DropdownMenu が React 19 + Server Component 経由だと
 * trigger の useId が SSR/CSR で不整合を起こすため、ここを Client 側に寄せる）。
 *
 * Layout (Server Component) からは props として userName/userEmail/orgSlug を
 * 受け取るだけで、データ取得自体は親で行う方針は変更しない。
 *
 * サインアウトは Server Action 経由で行うため、form を使用する。
 */
import Link from 'next/link';
import {
  Cog6ToothIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { signOutAction } from '@/lib/actions/sign-out';

type Props = {
  organizationSlug: string;
  userName: string;
  userEmail: string;
};

function getInitials(name: string, email: string): string {
  const base = name.trim() || email;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? base[0] ?? '?').toUpperCase();
}

export function UserMenu({ organizationSlug, userName, userEmail }: Props) {
  const initials = getInitials(userName, userEmail);
  const displayName = userName.trim() || userEmail;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="ユーザーメニューを開く"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-court-green/10 text-sm font-semibold text-court-green ring-offset-background transition-colors hover:bg-court-green/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>
          <div className="space-y-0.5 normal-case">
            <p className="text-sm font-medium tracking-tight text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs font-normal tracking-normal text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={`/${organizationSlug}/settings`}
            className="cursor-pointer"
          >
            <UserIcon className="h-4 w-4" aria-hidden="true" />
            <span>プロフィール</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/${organizationSlug}/settings`}
            className="cursor-pointer"
          >
            <Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />
            <span>設定</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center gap-2 text-left"
            >
              <ArrowRightOnRectangleIcon
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span>サインアウト</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
