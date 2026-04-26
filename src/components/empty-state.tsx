import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /**
   * 任意の Heroicons コンポーネント。指定なしならテニスボール 1px ストロークのデフォルト。
   */
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** 任意の追加 CTA（例: <Button>新規作成</Button>） */
  action?: React.ReactNode;
  /** @deprecated alias of `action` (旧互換) */
  cta?: React.ReactNode;
  className?: string;
};

/**
 * 単線 1px ストロークのイラスト + メッセージで構成される empty state。
 * design-concept.md §6 に準拠。Phase 1 polish: icon / action prop を追加。
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[14px] border border-dashed border-border bg-card p-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <Icon
          className="mb-4 h-12 w-12 text-muted-foreground"
          aria-hidden="true"
          strokeWidth={1.25}
        />
      ) : (
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="mb-4 text-muted-foreground"
          aria-hidden="true"
        >
          <circle cx="28" cy="28" r="20" />
          <path d="M14 22 Q 28 36, 42 22" />
          <path d="M14 34 Q 28 20, 42 34" />
        </svg>
      )}
      <h3 className="text-base font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {(action ?? cta) && <div className="mt-4">{action ?? cta}</div>}
    </div>
  );
}
