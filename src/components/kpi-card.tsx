'use client';

/**
 * KPI 数値カード（驚き要素②: タビュラー数字 + 600ms count-up）
 *
 * wow-elements-spec.md §2 / design-concept.md §4 に準拠。
 * - Framer Motion `useMotionValue` + `animate` で count-up
 * - easeOutQuart 相当 = cubic-bezier(0.16, 1, 0.3, 1)（design-tokens emphasized）
 * - `prefers-reduced-motion: reduce` で即値表示 + 完了後 aria-live で通知
 * - フォーマットは jpy / percentage / number から選択
 *
 * Server Component から呼ばれる前提（'use client' で client boundary を切る）。
 */
import * as React from 'react';
import { animate, useMotionValue, useTransform, motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { formatJpy, formatJpyPlain } from '@/lib/utils/format-jpy';

export type KpiCardProps = {
  label: string;
  value: number;
  format?: 'jpy' | 'percentage' | 'number';
  trend?: { delta: number; label?: string };
  /** count-up duration ms (default 600) */
  duration?: number;
  /** スクリーンリーダー向けに override する場合 */
  ariaLabel?: string;
  className?: string;
};

function formatValue(v: number, format: KpiCardProps['format']): string {
  switch (format) {
    case 'percentage':
      return `${v.toFixed(1)}%`;
    case 'number':
      return formatJpyPlain(v);
    case 'jpy':
    default:
      return formatJpy(v);
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function KpiCard({
  label,
  value,
  format = 'jpy',
  trend,
  duration = 600,
  ariaLabel,
  className,
}: KpiCardProps) {
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (latest) =>
    formatValue(latest, format),
  );
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    const reduced = prefersReducedMotion();
    setDone(false);
    if (reduced) {
      motionValue.set(value);
      setDone(true);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: duration / 1000,
      ease: [0.16, 1, 0.3, 1],
      onComplete: () => setDone(true),
    });
    return () => controls.stop();
  }, [value, duration, motionValue]);

  const finalLabel = ariaLabel ?? `${label} ${formatValue(value, format)}`;

  return (
    <Card className={cn('transition-shadow hover:shadow-md', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <motion.div
          className="font-nums text-3xl font-semibold tracking-tight"
          style={{ fontVariantNumeric: 'tabular-nums slashed-zero' }}
          aria-hidden="true"
          data-testid="kpi-value"
        >
          {display}
        </motion.div>
        {/* a11y: count-up 中は読み上げず、完了後に最終値を polite で通知 */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {done ? finalLabel : ''}
        </span>
        {trend && (
          <div
            className={cn(
              'mt-1 text-xs',
              trend.delta >= 0 ? 'text-court-green' : 'text-danger',
            )}
          >
            {trend.delta >= 0 ? '+' : ''}
            {trend.delta.toFixed(1)}% {trend.label ?? '前月比'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
