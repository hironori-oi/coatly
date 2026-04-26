'use client';

/**
 * 中国地方 5 県インタラクティブマップ（驚き要素①: choropleth）
 *
 * wow-elements-spec.md §1 / design-tokens.md §1.3 5 段濃淡 に準拠。
 *
 * - 5 県（岡山・広島・山口・鳥取・島根）の SVG path を抽象配置で描画
 * - 消化率 (usedAmount / totalAmount) を 5 段濃淡 (--color-chart-1〜5) で塗り分け
 * - 100% 超過は --color-chart-overflow + hover で揺れ
 * - Hover で県名 + 金額 + 消化率の Tooltip 表示（Radix Tooltip）
 * - Click で `/[orgSlug]/groups/[groupCode]` へ遷移
 * - Mobile (<768px) は SVG を非表示にし、グリッド表のみ表示（spec §1.5）
 * - prefers-reduced-motion 尊重（初回フェード / 揺れを無効化）
 *
 * organizationKind が tennis_club 以外は GenericGroupBarChart にフォールバック（W6 で実装）。
 */
import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import { formatJpy } from '@/lib/utils/format-jpy';

export type GroupMapDatum = {
  groupId: string;
  code: string;
  name: string;
  consumed: number;
  total: number;
};

export type GroupMapProps = {
  organizationKind: string;
  organizationSlug: string;
  data: GroupMapDatum[];
  onSelect?: (groupId: string) => void;
  className?: string;
};

// 中国地方 5 県の path（実地理を抽象化した配置）
//
// レイアウト:
//   北側（山陰=日本海側）:  島根（西寄り、横長）  | 鳥取（東端、コンパクト）
//   南側（山陽=瀬戸内側）:  山口（最西、縦長楔）| 広島（中央）      | 岡山（東端）
//
// viewBox 0 0 480 360。座標は左上原点。
type PrefSpec = {
  d: string;
  labelX: number;
  labelY: number;
  name: string;
};

const PATHS: Record<string, PrefSpec> = {
  shimane: {
    // 北西: Sea of Japan 沿いの長い帯。西は山口の北端と接する想定で、
    // やや左から右へ斜めに伸ばす。
    d: 'M 150 52 L 348 60 L 360 132 L 160 148 Z',
    labelX: 254,
    labelY: 96,
    name: '島根',
  },
  tottori: {
    // 北東: Sea of Japan 東端のコンパクトな県。島根より小さく、
    // 山陽側 (岡山) の上に乗る格好で配置。
    d: 'M 360 66 L 458 74 L 452 148 L 362 156 Z',
    labelX: 408,
    labelY: 110,
    name: '鳥取',
  },
  yamaguchi: {
    // 南西: 最西端、北は島根に接する想定で y を高めから取る。
    // 縦長の楔形（Setouchi 側に向かって少し膨らむ）。
    d: 'M 28 168 L 148 162 L 168 248 L 152 304 L 36 298 Z',
    labelX: 90,
    labelY: 238,
    name: '山口',
  },
  hiroshima: {
    // 南中央: Setouchi 側、中央。広島は実際もやや横長。
    d: 'M 168 166 L 312 176 L 320 292 L 178 302 Z',
    labelX: 244,
    labelY: 234,
    name: '広島',
  },
  okayama: {
    // 南東: Setouchi 側、東端。鳥取の真南。
    d: 'M 320 168 L 458 162 L 462 290 L 330 302 Z',
    labelX: 388,
    labelY: 232,
    name: '岡山',
  },
};

// 描画順は北西 → 北東 → 南西 → 南中央 → 南東。
// stagger アニメが日本海側から太平洋側へカスケードする視覚的流れを作る。
const PREF_ORDER: ReadonlyArray<string> = [
  'shimane',
  'tottori',
  'yamaguchi',
  'hiroshima',
  'okayama',
];

function rateToFill(rate: number): string {
  if (rate > 1.0) return 'var(--color-chart-overflow)';
  if (rate > 0.8) return 'var(--color-chart-5)';
  if (rate > 0.6) return 'var(--color-chart-4)';
  if (rate > 0.4) return 'var(--color-chart-3)';
  if (rate > 0.2) return 'var(--color-chart-2)';
  return 'var(--color-chart-1)';
}

export function GroupMap({
  organizationKind,
  organizationSlug,
  data,
  onSelect,
  className,
}: GroupMapProps) {
  const router = useRouter();
  const reduced = useReducedMotion();

  if (organizationKind !== 'tennis_club') {
    return (
      <div
        className={cn(
          'flex h-64 items-center justify-center rounded-[14px] border border-dashed border-border bg-card text-sm text-muted-foreground',
          className,
        )}
      >
        グループ比較ビュー（W6 で実装）
      </div>
    );
  }

  const dataMap = new Map(data.map((d) => [d.code, d]));

  const handleSelect = (code: string, groupId: string) => {
    if (onSelect) {
      onSelect(groupId);
      return;
    }
    router.push(`/${organizationSlug}/groups/${code}`);
  };

  return (
    <div
      className={cn(
        'rounded-[14px] border border-border bg-card p-6',
        className,
      )}
    >
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          中国地方 5 県（FY 予算消化）
        </h3>
        <Legend />
      </div>

      {/* Desktop: SVG choropleth */}
      <TooltipProvider delayDuration={120}>
        <div
          className="relative hidden md:block"
          role="img"
          aria-label="中国地方5県の予算消化率マップ"
        >
          <svg
            viewBox="0 0 480 360"
            className="h-auto w-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {PREF_ORDER.map((code, i) => {
              const path = PATHS[code];
              const pref = dataMap.get(code);
              const rate =
                pref && pref.total > 0 ? pref.consumed / pref.total : 0;
              const fill = pref ? rateToFill(rate) : 'var(--color-stone-100)';
              const isOver = rate > 1.0;
              const labelText = `${path.name}県 予算消化率 ${(rate * 100).toFixed(0)} パーセント`;

              return (
                <Tooltip key={code}>
                  <TooltipTrigger asChild>
                    <motion.g
                      tabIndex={0}
                      role="button"
                      aria-label={labelText}
                      style={{ cursor: pref ? 'pointer' : 'default', outline: 'none' }}
                      initial={
                        reduced
                          ? { opacity: 1 }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: reduced ? 0 : 0.6,
                        ease: [0.16, 1, 0.3, 1],
                        delay: reduced ? 0 : i * 0.08,
                      }}
                      whileHover={
                        isOver && !reduced ? { x: [-2, 2, -2, 2, 0] } : undefined
                      }
                      onClick={() =>
                        pref && handleSelect(code, pref.groupId)
                      }
                      onKeyDown={(e) => {
                        if (
                          pref &&
                          (e.key === 'Enter' || e.key === ' ')
                        ) {
                          e.preventDefault();
                          handleSelect(code, pref.groupId);
                        }
                      }}
                    >
                      <motion.path
                        d={path.d}
                        fill={fill}
                        stroke="var(--color-border)"
                        strokeWidth="1"
                        initial={false}
                        animate={{ fill, fillOpacity: 0.95 }}
                        whileHover={{ fillOpacity: 1 }}
                        transition={{
                          fill: {
                            duration: reduced ? 0 : 0.6,
                            ease: [0.16, 1, 0.3, 1],
                          },
                          fillOpacity: { duration: 0.15 },
                        }}
                      />
                      <text
                        x={path.labelX}
                        y={path.labelY}
                        fill="var(--color-foreground)"
                        fontSize="14"
                        fontWeight="500"
                        textAnchor="middle"
                        pointerEvents="none"
                        style={{ userSelect: 'none' }}
                      >
                        {path.name}
                      </text>
                      <text
                        x={path.labelX}
                        y={path.labelY + 16}
                        fill="var(--color-foreground)"
                        fontSize="11"
                        fontWeight="500"
                        textAnchor="middle"
                        pointerEvents="none"
                        opacity={0.8}
                        style={{
                          userSelect: 'none',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pref ? `${(rate * 100).toFixed(0)}%` : '—'}
                      </text>
                    </motion.g>
                  </TooltipTrigger>
                  {pref && (
                    <TooltipContent side="top" align="center">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          {path.name}県
                        </p>
                        <p className="font-nums tabular-nums text-xs text-muted-foreground">
                          {formatJpy(pref.consumed)} /{' '}
                          {formatJpy(pref.total)}
                        </p>
                        <p
                          className={cn(
                            'font-nums tabular-nums text-xs font-medium',
                            isOver
                              ? 'text-danger'
                              : rate >= 0.9
                                ? 'text-amber'
                                : 'text-court-green',
                          )}
                        >
                          消化率 {(rate * 100).toFixed(1)}%
                          {isOver && ' (超過)'}
                        </p>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </svg>
        </div>
      </TooltipProvider>

      {/* Mobile + 色だけに頼らない: 県別ランキング（同情報を冗長提供） */}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {data.map((d) => {
          const rate = d.total > 0 ? d.consumed / d.total : 0;
          const isOver = rate > 1.0;
          return (
            <button
              key={d.groupId}
              type="button"
              onClick={() => handleSelect(d.code, d.groupId)}
              className="group flex flex-col items-start gap-1 rounded-md border border-border p-3 text-left transition-colors hover:border-court-green hover:bg-stone-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="text-sm font-medium">{d.name}</span>
              <span
                className={cn(
                  'font-nums tabular-nums text-xs',
                  isOver
                    ? 'text-danger'
                    : rate >= 0.9
                      ? 'text-amber'
                      : 'text-muted-foreground',
                )}
              >
                {(rate * 100).toFixed(0)}%
              </span>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(rate * 100, 100)}%`,
                    background: rateToFill(rate),
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-2 text-[10px] text-muted-foreground md:flex">
      <span>低</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-2 w-4 rounded-sm border border-border"
          style={{ background: `var(--color-chart-${n})` }}
          aria-hidden="true"
        />
      ))}
      <span>高</span>
      <span
        className="ml-1 h-2 w-4 rounded-sm border border-border"
        style={{ background: 'var(--color-chart-overflow)' }}
        aria-hidden="true"
        title="100% 超過"
      />
      <span>超過</span>
    </div>
  );
}
