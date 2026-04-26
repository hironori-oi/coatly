'use client';

/**
 * Light / Dark / System 切替トグル（ヘッダ右上）
 *
 * - Heroicons (SunIcon / MoonIcon / ComputerDesktopIcon) のみを使用（絵文字禁止）
 * - hydration ずれ回避のため mounted まで placeholder を返す
 * - aria-label / title で screen reader にも現状を通知
 * - Light → Dark → System → Light のローテーション
 */
import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

const ORDER = ['light', 'dark', 'system'] as const;
type ThemeName = (typeof ORDER)[number];

const LABEL: Record<ThemeName, string> = {
  light: 'ライトモード',
  dark: 'ダークモード',
  system: 'システム設定に追従',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // next-themes 公式の hydration-safe パターン。SSR / client で theme が
  // 一致しないため初回 render 後に有効化する必要がある。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  const current: ThemeName = mounted
    ? ((theme ?? 'system') as ThemeName)
    : 'system';

  const handleClick = () => {
    const idx = ORDER.indexOf(current);
    const next = ORDER[(idx + 1) % ORDER.length];
    setTheme(next);
  };

  const Icon =
    current === 'light'
      ? SunIcon
      : current === 'dark'
        ? MoonIcon
        : ComputerDesktopIcon;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`テーマ切替（現在: ${LABEL[current]}）`}
      title={LABEL[current]}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground/70 transition-colors hover:bg-stone-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* mounted まで非アイコン表示で SSR/CSR を一致させる */}
      {mounted ? (
        <Icon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <span className="block h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
