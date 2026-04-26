'use client';

/**
 * 予算消化ゲージ（驚き要素③: テニスボール軌跡）
 *
 * wow-elements-spec.md §3 + 受託要件「半円アーク 180度 + テニスボール軌跡」融合版。
 *
 * - SVG で半円アーク（180度）を描画し、消化率分まで accent (court-green) で塗り潰し
 * - テニスボール（黄緑円 + 白の curved stitching）を弧の上に配置
 * - 0% → 実値まで 800ms easeInOut でアニメーション（初回マウント時）
 * - 100% 超過時は右端で振動（hover 時のみ、reduced-motion で無効）
 * - prefers-reduced-motion: reduce で即値表示
 *
 * Server Component から呼ばれる前提（'use client' で client boundary）。
 */
import * as React from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { formatJpy } from '@/lib/utils/format-jpy';

export type BudgetGaugeBallProps = {
  usedAmount: number;
  totalAmount: number;
  label?: string;
  className?: string;
};

// SVG 寸法
const VIEW_W = 320;
const VIEW_H = 180;
const CX = VIEW_W / 2; // 弧の中心 x
const CY = 160; // 弧の中心 y（下寄せ）
const R = 130; // 弧半径

/**
 * 角度（rad）から弧上の点を返す。0 = 左端 (180°), π = 右端 (0°)
 * 弧は左 (-180°) → 上 (-90°) → 右 (0°) を進む半円。
 * t ∈ [0, 1] で進行率を表現。
 */
function pointOnArc(t: number): { x: number; y: number } {
  const angle = Math.PI - Math.PI * t; // π → 0
  return {
    x: CX + R * Math.cos(angle),
    y: CY - R * Math.sin(angle),
  };
}

/**
 * 弧の進捗 path。t ∈ [0, 1]。
 * SVG arc は A rx ry x-axis-rotation large-arc sweep x y で記述。
 */
function arcPathTo(t: number): string {
  const start = pointOnArc(0);
  const end = pointOnArc(Math.max(0, Math.min(t, 1)));
  // sweep=1（時計回り）で左端から右端へ
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${R} ${R} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function BudgetGaugeBall({
  usedAmount,
  totalAmount,
  label,
  className,
}: BudgetGaugeBallProps) {
  const reduced = useReducedMotion();
  const targetRate =
    totalAmount > 0
      ? Math.max(0, Math.min(usedAmount / totalAmount, 1.5))
      : 0;
  const isOver = targetRate > 1.0;

  // アニメ駆動の進行値（0 → targetRate）
  const t = useMotionValue(0);
  const ballPos = useTransform(t, (v) => pointOnArc(Math.min(v, 1.0)));
  const ballX = useTransform(ballPos, (p) => p.x);
  const ballY = useTransform(ballPos, (p) => p.y);
  const arcD = useTransform(t, (v) => arcPathTo(Math.min(v, 1.0)));

  React.useEffect(() => {
    if (reduced) {
      t.set(targetRate);
      return;
    }
    t.set(0);
    const controls = animate(t, targetRate, {
      duration: 0.8,
      ease: [0.42, 0, 0.58, 1], // easeInOut
    });
    return () => controls.stop();
  }, [targetRate, reduced, t]);

  // 100% 超過時の振動（hover で発火、reduced-motion で無効）
  const [hovered, setHovered] = React.useState(false);
  const shake = isOver && hovered && !reduced;

  // 表示用パーセント（クランプなし: 100% 超過も正直に表示）
  const displayRate = (
    totalAmount > 0 ? (usedAmount / totalAmount) * 100 : 0
  ).toFixed(1);

  // ゲージ色（消化率に応じて）
  const arcColor = isOver
    ? 'var(--color-danger)'
    : targetRate >= 0.9
      ? 'var(--color-amber)'
      : 'var(--color-court-green)';

  const ballColor = isOver
    ? 'var(--color-danger)'
    : 'var(--color-court-green)';

  // ボール描画用: useTransform から SVG props を直接適用
  return (
    <div
      className={cn('w-full', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label && (
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span
            className={cn(
              'font-nums tabular-nums text-base font-medium',
              isOver
                ? 'text-danger'
                : targetRate >= 0.9
                  ? 'text-amber'
                  : 'text-court-green',
            )}
          >
            {displayRate}%
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full"
        role="img"
        aria-label={`予算消化率 ${displayRate} パーセント。消化額 ${formatJpy(usedAmount)}、予算 ${formatJpy(totalAmount)}。`}
      >
        {/* 背景アーク（フル 180°） */}
        <path
          d={`M ${pointOnArc(0).x.toFixed(2)} ${pointOnArc(0).y.toFixed(2)} A ${R} ${R} 0 0 1 ${pointOnArc(1).x.toFixed(2)} ${pointOnArc(1).y.toFixed(2)}`}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* 進捗アーク（消化率分まで塗り） */}
        <motion.path
          d={arcD as unknown as string}
          fill="none"
          stroke={arcColor}
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* 0% / 100% 目盛り */}
        <text
          x={pointOnArc(0).x - 8}
          y={pointOnArc(0).y + 22}
          fontSize="10"
          fill="var(--color-muted-foreground)"
          textAnchor="middle"
        >
          0
        </text>
        <text
          x={pointOnArc(1).x + 8}
          y={pointOnArc(1).y + 22}
          fontSize="10"
          fill="var(--color-muted-foreground)"
          textAnchor="middle"
        >
          100%
        </text>

        {/* テニスボール（弧上を移動） */}
        <motion.g
          style={{ x: shake ? undefined : 0 }}
          animate={shake ? { x: [-3, 3, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.2, repeat: shake ? 2 : 0 }}
        >
          {/* ボール本体 */}
          <motion.circle
            r="11"
            fill={ballColor}
            stroke="var(--color-background)"
            strokeWidth="2"
            cx={ballX as unknown as number}
            cy={ballY as unknown as number}
          />
          {/* テニスボール白曲線 stitching（cy + offset で表現） */}
          <motion.path
            d={useTransform(
              ballPos,
              (p) =>
                `M ${(p.x - 7).toFixed(2)} ${p.y.toFixed(2)} Q ${p.x.toFixed(2)} ${(p.y - 6).toFixed(2)}, ${(p.x + 7).toFixed(2)} ${p.y.toFixed(2)}`,
            ) as unknown as string}
            stroke="white"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            opacity={0.85}
          />
          <motion.path
            d={useTransform(
              ballPos,
              (p) =>
                `M ${(p.x - 7).toFixed(2)} ${p.y.toFixed(2)} Q ${p.x.toFixed(2)} ${(p.y + 6).toFixed(2)}, ${(p.x + 7).toFixed(2)} ${p.y.toFixed(2)}`,
            ) as unknown as string}
            stroke="white"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            opacity={0.85}
          />
        </motion.g>

        {/* 中央に数字（オプション、label が無いときの予備） */}
        {!label && (
          <text
            x={CX}
            y={CY - 10}
            fontSize="28"
            fontWeight="600"
            fill="var(--color-foreground)"
            textAnchor="middle"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {displayRate}%
          </text>
        )}
      </svg>

      {/* 補助テキスト（金額表記、a11y にも有効） */}
      <div className="mt-1 flex items-baseline justify-between font-nums text-xs tabular-nums text-muted-foreground">
        <span>{formatJpy(usedAmount)} 消化</span>
        <span>{formatJpy(Math.max(totalAmount - usedAmount, 0))} 残</span>
      </div>
    </div>
  );
}
