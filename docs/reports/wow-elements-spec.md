# PRJ-015 Coatly あっと驚き要素 3 点 実装仕様書

- **案件**: PRJ-015 Coatly
- **作成日**: 2026-04-26
- **作成者**: デザイン部門
- **対象**: 開発部門（W6 ダッシュボード実装で参照）
- **準拠**: DEC-003（A 案 Quiet Luxury Sport）/ design-tokens.md / design-concept.md §7.2
- **対象要素**: 中国地方 5 県マップ / タビュラー数字カウントアップ / テニスボール軌跡

---

## 0. このドキュメントの使い方

3 要素の実装擬似コードは Dev が `components/wow/` 配下にそのままコピペできるレベル。Framer Motion + SVG が前提。bundle サイズへの影響は §4 を参照。

---

## 1. 要素①: 中国地方 5 県インタラクティブマップ（choropleth）

### 1.1 コンポーネント名 + props

```tsx
<ChugokuPrefectureMap
  data={prefData}          // PrefectureData[]
  onPrefectureClick={...}  // (code: PrefectureCode) => void
  className="..."
  height={400}             // px (default 400)
  showTooltip               // boolean (default true)
/>
```

```ts
type PrefectureCode = "okayama" | "hiroshima" | "yamaguchi" | "tottori" | "shimane";

type PrefectureData = {
  code: PrefectureCode;
  name: string;       // "岡山県"
  budget: number;
  consumed: number;
  rate: number;       // 0.0 〜 1.0+
};
```

### 1.2 動作仕様

| 状態 | 動作 |
|------|------|
| 初回マウント | 5 県の塗りが `--chart-1` から実際の rate に応じた色へ 600ms emphasized でフェード（千鳥状に 80ms 遅延） |
| Idle | 各県が消化率に応じた `--chart-N` で塗られている |
| Hover | `fill-opacity: 0.7 → 1.0`（150ms standard） + マウス位置にツールチップ表示 |
| Focus | `outline: 2px solid var(--ring)` + offset 2px |
| Click | `/[orgSlug]/[prefCode]` へ遷移（Next.js `router.push`） |
| 100% 超過 | `fill: var(--chart-overflow)` + 微小に揺れる（idle で完全停止、hover 時のみ 200ms × 3 揺れ） |

### 1.3 5 段濃淡マッピング

| rate | fill |
|------|------|
| 0.00 - 0.20 | `hsl(var(--chart-1))` |
| 0.21 - 0.40 | `hsl(var(--chart-2))` |
| 0.41 - 0.60 | `hsl(var(--chart-3))` |
| 0.61 - 0.80 | `hsl(var(--chart-4))` |
| 0.81 - 1.00 | `hsl(var(--chart-5))` |
| > 1.00 | `hsl(var(--chart-overflow))` |

### 1.4 県境 SVG パス（簡略版・四角形ベース抽象化）

中国地方の地理を反映した抽象配置。viewBox = `0 0 480 320`:

```
画面レイアウト（480 × 320 viewBox）:

         鳥取                    島根
    ┌───────────┐         ┌──────────┐
    │           │         │          │
    │  (北側)    │         │  (北側)    │
    │           │         │          │
    └───────────┘         └──────────┘
                岡山              広島
              ┌───────┐    ┌──────────┐
              │       │    │          │
              │ (中央) │    │  (中央)   │
              └───────┘    └──────────┘
   山口
   ┌────────────┐
   │            │
   │  (南西)     │
   └────────────┘
```

```tsx
// components/wow/chugoku-paths.ts
export const CHUGOKU_PATHS: Record<PrefectureCode, { d: string; labelX: number; labelY: number; name: string }> = {
  // 鳥取（北西）
  tottori: {
    d: "M 50 60 L 200 50 L 220 100 L 210 130 L 60 140 Z",
    labelX: 130,
    labelY: 95,
    name: "鳥取",
  },
  // 島根（北東）
  shimane: {
    d: "M 230 60 L 420 50 L 430 110 L 240 120 Z",
    labelX: 330,
    labelY: 85,
    name: "島根",
  },
  // 岡山（中央西）
  okayama: {
    d: "M 110 150 L 220 145 L 230 230 L 120 235 Z",
    labelX: 170,
    labelY: 195,
    name: "岡山",
  },
  // 広島（中央東）
  hiroshima: {
    d: "M 240 130 L 430 120 L 440 230 L 250 240 Z",
    labelX: 340,
    labelY: 185,
    name: "広島",
  },
  // 山口（南西）
  yamaguchi: {
    d: "M 30 240 L 240 250 L 250 310 L 40 305 Z",
    labelX: 130,
    labelY: 280,
    name: "山口",
  },
};
```

注意: 上記は地理を反映した抽象パスであり、実装後に Designer がオーナーレビューを経て実地形に近い path に差し替える可能性あり（W3 末ゲートで確定）。MVP は本パスで十分シグネチャ要素となる。

### 1.5 実装方針

- **SVG + Framer Motion**（外部 GIS ライブラリ不要、bundle 軽量化）
- 県の塗り変化は `<motion.path animate={{ fill: ... }} transition={{ duration: 0.6 }} />`
- ツールチップは Radix UI `<Tooltip>` または独自実装（ポインタ追従 + portal）
- レスポンシブ: viewBox を保持しつつ親の幅にフィット（`width="100%" height="auto"`）
- Mobile（< 768px）では非表示 → ランキング表のみ表示

### 1.6 実装擬似コード

```tsx
"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHUGOKU_PATHS, type PrefectureCode } from "./chugoku-paths";

type Props = {
  data: PrefectureData[];
  orgSlug: string;
  className?: string;
};

function rateToChartLevel(rate: number): string {
  if (rate > 1.0) return "var(--chart-overflow)";
  if (rate > 0.8) return "var(--chart-5)";
  if (rate > 0.6) return "var(--chart-4)";
  if (rate > 0.4) return "var(--chart-3)";
  if (rate > 0.2) return "var(--chart-2)";
  return "var(--chart-1)";
}

export function ChugokuPrefectureMap({ data, orgSlug, className }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<PrefectureCode | null>(null);
  const dataMap = new Map(data.map((d) => [d.code, d]));

  return (
    <div className={className} role="img" aria-label="中国地方5県の予算消化率マップ">
      <svg
        viewBox="0 0 480 320"
        width="100%"
        height="auto"
        className="hidden md:block"
      >
        {(Object.keys(CHUGOKU_PATHS) as PrefectureCode[]).map((code, i) => {
          const path = CHUGOKU_PATHS[code];
          const pref = dataMap.get(code);
          const fill = pref ? `hsl(${rateToChartLevel(pref.rate)})` : "hsl(var(--muted))";
          const isOver = pref && pref.rate > 1.0;

          return (
            <g key={code}>
              <motion.path
                d={path.d}
                role="button"
                tabIndex={0}
                aria-label={`${path.name}県: 予算消化率 ${pref ? Math.round(pref.rate * 100) : 0}%`}
                fill={fill}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                style={{ cursor: "pointer", outline: "none" }}
                initial={{ fill: "hsl(var(--chart-1))", opacity: 0 }}
                animate={{
                  fill,
                  opacity: hovered === code ? 1.0 : 0.85,
                  ...(isOver && hovered === code
                    ? { x: [-2, 2, -2, 2, 0] }
                    : {}),
                }}
                transition={{
                  fill: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 },
                  opacity: { duration: 0.15 },
                  x: { duration: 0.2, repeat: 0 },
                }}
                onMouseEnter={() => setHovered(code)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(code)}
                onBlur={() => setHovered(null)}
                onClick={() => router.push(`/${orgSlug}/${code}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/${orgSlug}/${code}`);
                  }
                }}
              />
              <text
                x={path.labelX}
                y={path.labelY}
                fill="hsl(var(--foreground))"
                fontSize="14"
                fontWeight="500"
                textAnchor="middle"
                pointerEvents="none"
              >
                {path.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip (hover 時のみ) */}
      {hovered && dataMap.get(hovered) && (
        <PrefectureTooltip data={dataMap.get(hovered)!} />
      )}
    </div>
  );
}
```

### 1.7 a11y

- `role="img"` + `aria-label="中国地方5県の予算消化率マップ"`
- 各県 path に `role="button"` + `tabIndex={0}` + `aria-label` で消化率を読み上げ
- キーボード操作: Tab で県を順次フォーカス、Enter/Space で遷移
- 色だけに頼らない: ランキング表（同ページ内）で同じ情報を冗長提供
- `prefers-reduced-motion: reduce` 時:
  - 初回フェードイン無効化（即時最終色）
  - 100% 超過の揺れ無効化（color のみ変化）

---

## 2. 要素②: タビュラー数字 600ms カウントアップ（KPI カード）

### 2.1 コンポーネント名 + props

```tsx
<MotionNumber
  value={742300}             // number (target)
  duration={600}             // ms (default 600)
  format={formatJpy}         // (n: number) => string
  className="text-display"
  ariaLabel="執行額 ¥742,300" // optional
/>
```

```ts
// lib/format.ts
export function formatJpy(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

export function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
```

### 2.2 動作仕様

| 状態 | 動作 |
|------|------|
| 初回マウント | `0` から `value` まで 600ms easing-out（emphasized）でカウントアップ |
| `value` 変更 | 現在表示値 → 新値へ 600ms カウント |
| マウント時に `prefers-reduced-motion: reduce` | 即時 `value` を表示（アニメーションなし） |
| アニメ完了 | `aria-live="polite"` で完了値を読み上げ |

### 2.3 実装方針

- **Framer Motion `useMotionValue` + `useTransform` + `animate`**
- 表示要素は `<motion.span>` で `style={{ fontVariantNumeric: "tabular-nums slashed-zero" }}`
- フォーマット関数で書式適用（カンマ区切り / 単位）

### 2.4 実装擬似コード

```tsx
"use client";

import { animate, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect, useReducer, useRef } from "react";

type Props = {
  value: number;
  duration?: number;          // ms
  format: (n: number) => string;
  className?: string;
  ariaLabel?: string;
};

export function MotionNumber({
  value,
  duration = 600,
  format,
  className,
  ariaLabel,
}: Props) {
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (latest) => format(latest));
  const announcedRef = useRef(false);
  const [_, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      motionValue.set(value);
      announcedRef.current = true;
      forceUpdate();
      return;
    }

    announcedRef.current = false;
    const controls = animate(motionValue, value, {
      duration: duration / 1000,
      ease: [0.16, 1, 0.3, 1],
      onComplete: () => {
        announcedRef.current = true;
        forceUpdate();
      },
    });
    return () => controls.stop();
  }, [value, duration, motionValue]);

  return (
    <>
      <motion.span
        className={className}
        style={{ fontVariantNumeric: "tabular-nums slashed-zero" }}
        aria-hidden="true"
      >
        {display}
      </motion.span>
      {/* a11y: アニメ中は読み上げず、完了後に最終値のみ通知 */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcedRef.current ? (ariaLabel ?? format(value)) : ""}
      </span>
    </>
  );
}
```

### 2.5 KPI カードでの使用例

```tsx
<Card className="p-6">
  <p className="text-small text-muted-foreground uppercase tracking-wider">執行額</p>
  <MotionNumber
    value={budget.consumed}
    format={formatJpy}
    className="text-display font-semibold mt-2 block"
    ariaLabel={`執行額 ${formatJpy(budget.consumed)}`}
  />
  <p className="text-body-sm text-muted-foreground mt-1">前月比 +12%</p>
</Card>
```

### 2.6 a11y

- アニメ中は `aria-hidden="true"`（途中の中途半端な数値を読み上げない）
- 完了後のみ `aria-live="polite"` で `ariaLabel` または `format(value)` を読み上げ
- `prefers-reduced-motion: reduce` で即値表示
- フォーカスは奪わない（KPI カード自体は非インタラクティブ）

---

## 3. 要素③: テニスボール軌跡で予算消化可視化

### 3.1 コンポーネント名 + props

```tsx
<TennisBallProgress
  consumed={742300}      // 消化額
  total={1200000}        // 予算枠
  height={80}            // px (default 80)
  className="..."
/>
```

### 3.2 動作仕様

| 状態 | 動作 |
|------|------|
| 初回マウント | コート + ネットの SVG が即時描画 → ボールがベースライン位置から弧を描いて消化率位置まで 800ms hero でアニメ |
| Idle | ボールが消化率位置で停止 |
| Hover | 軌跡を再描画（800ms）+ ツールチップ表示「消化額 ¥742,300 / 残額 ¥457,700 / 消化率 61.9%」 |
| 100% 超過 | ボールが赤色（chart-overflow）+ 200ms × 3 揺れ（hover 時のみ） |
| Mobile（< 768px） | テニスボール軌跡をスキップして単純な進捗バー（`<Progress>` shadcn/ui）にフォールバック |

### 3.3 メタファー設計

```
コート全長 = 予算 100%
ベースライン (左端) = 0%
ネット (中央) = 50%
反対サイドのベースライン (右端) = 100%

ボールの y 軌跡 = ベースラインから打ち出された弧（quadratic Bezier）
     最高点 = path 中点で y = -40 (上方向)
     終点 = 消化率に応じた x 座標、y = ベースライン

100% 超過時:
     ボールが右端を超えてフレーム外へ → 警告表示（シルエットで揺れ）
```

### 3.4 SVG レイアウト

viewBox = `0 0 800 100`:

```
y=10  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← コート上端ライン (ヘアライン)
y=20  ┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊┊  ← サービスライン (薄)
                  │                    ← ネット (x=400, y=10〜90)
y=80  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← ベースライン
ボール ●  ←（消化率位置に停止）
```

### 3.5 実装方針

- SVG（コート + ネット + ボール path）+ Framer Motion（ball position）
- ボールは `<motion.circle cx={...} cy={...} />` で path に沿って移動
- 軌跡 = quadratic Bezier `M 20 80 Q 410 0 ${endX} 80` を `<motion.path>` で描画
- レスポンシブ: 親幅にフィット、Mobile は `<TennisBallProgress>` 自体が `<Progress>` を返す

### 3.6 実装擬似コード

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";

type Props = {
  consumed: number;
  total: number;
  height?: number;
  className?: string;
};

export function TennisBallProgress({ consumed, total, height = 80, className }: Props) {
  const [hovered, setHovered] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const reduced = useReducedMotion();

  const rate = Math.min(consumed / total, 1.5); // 100% 超過は最大 150% でクランプ
  const isOver = rate > 1.0;
  const VIEW_W = 800;
  const PADDING = 20;
  const trackW = VIEW_W - PADDING * 2;
  // 消化率位置の x 座標（100% 超過分は右端外へ）
  const ballX = PADDING + Math.min(rate, 1.5) * trackW;
  const ballY = 80;

  // 軌跡パス: ベースライン (20, 80) → 弧の頂点 (中点, 10) → 終点 (ballX, 80)
  const arcPath = `M ${PADDING} 80 Q ${(PADDING + ballX) / 2} 10 ${ballX} 80`;

  // Mobile fallback
  // 親で window 幅を見るより useMediaQuery が確実、ここでは CSS で隠す
  return (
    <>
      {/* Mobile fallback */}
      <div className={`md:hidden ${className ?? ""}`}>
        <div className="flex justify-between text-body-sm mb-1">
          <span className="text-muted-foreground">予算消化</span>
          <span className="text-numeric">{(rate * 100).toFixed(1)}%</span>
        </div>
        <Progress value={Math.min(rate * 100, 100)} className="h-2" />
      </div>

      {/* Desktop SVG */}
      <div
        className={`hidden md:block relative ${className ?? ""}`}
        onMouseEnter={() => {
          setHovered(true);
          setReplayKey((k) => k + 1);
        }}
        onMouseLeave={() => setHovered(false)}
        role="img"
        aria-label={`予算消化率 ${(rate * 100).toFixed(1)}%、消化額 ${formatJpy(consumed)}、残額 ${formatJpy(total - consumed)}`}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} 100`}
          width="100%"
          height={height}
          style={{ display: "block" }}
        >
          {/* コート上端ライン */}
          <line x1={PADDING} y1="10" x2={VIEW_W - PADDING} y2="10" stroke="hsl(var(--border))" strokeWidth="0.5" />
          {/* サービスライン */}
          <line x1={PADDING} y1="20" x2={VIEW_W - PADDING} y2="20" stroke="hsl(var(--border))" strokeWidth="0.5" strokeDasharray="2 4" />
          {/* ネット */}
          <line x1={VIEW_W / 2} y1="10" x2={VIEW_W / 2} y2="90" stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
          {/* ベースライン */}
          <line x1={PADDING} y1="80" x2={VIEW_W - PADDING} y2="80" stroke="hsl(var(--foreground))" strokeWidth="1" />
          {/* 軌跡 */}
          <motion.path
            key={replayKey}
            d={arcPath}
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* ボール */}
          <motion.circle
            r="8"
            fill={isOver ? "hsl(var(--chart-overflow))" : "hsl(var(--accent))"}
            stroke="hsl(var(--background))"
            strokeWidth="2"
            initial={reduced ? { cx: ballX, cy: ballY } : { cx: PADDING, cy: ballY }}
            animate={{
              cx: ballX,
              cy: ballY,
              ...(isOver && hovered && !reduced ? { x: [-3, 3, -3, 3, 0] } : { x: 0 }),
            }}
            transition={{
              cx: { duration: reduced ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] },
              cy: { duration: reduced ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] },
              x: { duration: 0.2 },
            }}
          />
        </svg>

        {/* ツールチップ */}
        {hovered && (
          <div
            className="absolute top-0 right-4 bg-popover text-popover-foreground border border-border rounded-md px-3 py-2 shadow-elevated text-body-sm"
            style={{ pointerEvents: "none" }}
          >
            <div className="text-numeric font-semibold">{(rate * 100).toFixed(1)}%</div>
            <div className="text-muted-foreground">
              {formatJpy(consumed)} / {formatJpy(total)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

### 3.7 a11y

- `role="img"` + `aria-label` で消化率/消化額/残額をすべて読み上げ
- 色だけに頼らない: ツールチップ + Mobile fallback の Progress バーは数値テキスト併記
- 100% 超過時の揺れは `prefers-reduced-motion: reduce` で無効化
- ボール SVG にはフォーカス不可（hover のみ反応 / 詳細はランキング表で代替）

### 3.8 注意事項

- アニメは初回マウントのみ、リサイズで再起動しない（不必要な再描画防止）
- ホバー replay は意図的（ユーザーが演出を再確認できる）
- 100% 超過は赤揺れ + ツールチップで「予算超過」と明記

---

## 4. パフォーマンス影響評価

| 要素 | 追加 bundle | 初回レンダリング | 再レンダリング | 備考 |
|------|------------|------------|------------|------|
| ChugokuPrefectureMap | < 5KB（SVG path 静的）| 1 SVG + 5 path | hover 時のみ 1 path | OK |
| MotionNumber | 0KB（既存 Framer Motion 再利用） | 1 motion span | value 変更時のみ | OK |
| TennisBallProgress | < 3KB（SVG + path）| 1 SVG | hover 時のみ replay | OK |
| **合計** | **< 8KB** | | | bundle 影響軽微 |

Framer Motion は既に shadcn/ui Sheet / Dialog で導入済みのため重複インストール不要。

---

## 5. テスト要件（W7 で実施）

### 5.1 視覚回帰テスト

各要素の以下状態をスクリーンショット保存:
- ChugokuPrefectureMap: idle / hover okayama / 100% 超過 hiroshima / mobile（hidden 確認）
- MotionNumber: idle / アニメ中 50% / 完了
- TennisBallProgress: 50% / 100% / 110% / mobile fallback

### 5.2 a11y テスト

- axe-core で各要素を検証
- VoiceOver / NVDA で読み上げ確認:
  - マップ: 「岡山県: 予算消化率 62 パーセント」
  - 数字: 「執行額 ¥742,300」
  - ボール: 「予算消化率 61.9 パーセント、消化額 ¥742,300、残額 ¥457,700」

### 5.3 パフォーマンステスト

- LCP < 2.5s（ダッシュボードページ）
- INP < 200ms（hover 操作）
- マップ初回描画 < 100ms

---

## 6. 改訂履歴

| 日付 | 内容 | 改訂者 |
|------|------|--------|
| 2026-04-26 | 初版（3 要素、Phase 1 W1 適用版） | Designer |
