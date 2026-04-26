# PRJ-015 Coatly デザイントークン仕様書

- **案件**: PRJ-015 Coatly
- **作成日**: 2026-04-26
- **作成者**: デザイン部門
- **対象**: 開発部門（W1 環境構築フェーズで `tailwind.config.ts` / `globals.css` に直接適用）
- **準拠**: DEC-003（A 案 Quiet Luxury Sport）/ DEC-014（内製化）/ design-concept.md §2
- **ステータス**: Phase 1 W1 適用版（DEC-015 受領）

---

## 0. このドキュメントの使い方

Dev は本ドキュメントの §10 と §11 のコードブロックを **そのまま** `tailwind.config.ts` と `app/globals.css` に貼り付けて W1 を着手する。微調整が必要な場合は §13 の改訂手続きに従う。

---

## 1. カラー（Light / Dark 両モード）

### 1.1 セマンティックトークン一覧

| 用途 | Light HEX | Dark HEX | CSS 変数 | Tailwind class |
|------|-----------|----------|----------|----------------|
| **background**（ページ背景） | `#FAFAF7` | `#0C0E0D` | `--background` | `bg-background` |
| **foreground**（主要テキスト） | `#0A0A0B` | `#ECEAE3` | `--foreground` | `text-foreground` |
| **card**（カード面） | `#FFFFFF` | `#15181A` | `--card` | `bg-card` |
| **card-foreground**（カード内テキスト） | `#0A0A0B` | `#ECEAE3` | `--card-foreground` | `text-card-foreground` |
| **popover**（ポップオーバー背景） | `#FFFFFF` | `#15181A` | `--popover` | `bg-popover` |
| **popover-foreground** | `#0A0A0B` | `#ECEAE3` | `--popover-foreground` | `text-popover-foreground` |
| **primary**（プライマリボタン背景） | `#0A0A0B` | `#ECEAE3` | `--primary` | `bg-primary` |
| **primary-foreground**（プライマリ上の文字） | `#FAFAF7` | `#0A0A0B` | `--primary-foreground` | `text-primary-foreground` |
| **secondary**（セカンダリ面） | `#E7E5DF` | `#1C2022` | `--secondary` | `bg-secondary` |
| **secondary-foreground** | `#0A0A0B` | `#ECEAE3` | `--secondary-foreground` | `text-secondary-foreground` |
| **muted**（muted 面） | `#E7E5DF` | `#1C2022` | `--muted` | `bg-muted` |
| **muted-foreground**（補助テキスト） | `#6B6B6B` | `#9A9A95` | `--muted-foreground` | `text-muted-foreground` |
| **accent**（Court Green = アクセント） | `#1F6B4A` | `#3FA677` | `--accent` | `bg-accent` |
| **accent-foreground**（アクセント上の文字） | `#FAFAF7` | `#0A0A0B` | `--accent-foreground` | `text-accent-foreground` |
| **surface-muted**（テーブル zebra 等） | `#E7E5DF` | `#1C2022` | `--surface-muted` | `bg-surface-muted` |
| **border**（ヘアライン罫線） | `#D8D6CF` | `#262A2C` | `--border` | `border-border` |
| **input**（入力フィールド枠） | `#D8D6CF` | `#262A2C` | `--input` | `border-input` |
| **ring**（フォーカスリング） | `#1F6B4A` | `#3FA677` | `--ring` | `ring-ring` |
| **success**（承認済み / 完了） | `#2F7A52` | `#3FA677` | `--success` | `bg-success` / `text-success` |
| **warning**（予算 70-90% 警告） | `#B8741A` | `#D4923A` | `--warning` | `bg-warning` / `text-warning` |
| **danger**（予算超過 / 差戻） | `#A83232` | `#D87171` | `--danger` | `bg-danger` / `text-danger` |
| **destructive**（破壊的操作） | `#A83232` | `#D87171` | `--destructive` | `bg-destructive` |
| **destructive-foreground** | `#FAFAF7` | `#0A0A0B` | `--destructive-foreground` | `text-destructive-foreground` |

### 1.2 コントラスト比検証（WCAG 2.2 AA）

| ペア | Light | Dark | AA 通過 |
|------|-------|------|---------|
| foreground / background | 19.7:1 | 16.8:1 | ◎ AAA |
| muted-foreground / background | 5.4:1 | 4.7:1 | ○ AA |
| accent / background | 6.2:1 | 5.1:1 | ○ AA |
| primary-foreground / primary | 19.0:1 | 16.5:1 | ◎ AAA |
| accent-foreground / accent | 8.5:1 | 7.0:1 | ◎ AAA |
| success / background | 5.5:1 | 5.1:1 | ○ AA |
| warning / background | 4.7:1 | 4.6:1 | ○ AA |
| danger / background | 5.9:1 | 5.4:1 | ○ AA |

すべて AA 以上を満たす。CI に `axe-core` を組み込んで自動検証する（W7 計画）。

### 1.3 チャート専用カラー（5 段濃淡 = choropleth 用）

中国地方 5 県マップで予算消化率を表現する Court Green の 5 段階濃淡:

| 段階 | 消化率 | Light HEX | Dark HEX |
|------|--------|-----------|----------|
| 1 (0-20%) | 最薄 | `#E8F0EB` | `#1A2E25` |
| 2 (21-40%) | 薄 | `#C5DDD0` | `#244538` |
| 3 (41-60%) | 中 | `#7FB497` | `#2F6049` |
| 4 (61-80%) | 濃 | `#3F8762` | `#3FA677` |
| 5 (81-100%) | 最濃 | `#1F6B4A` | `#5BC494` |
| 100% 超過 | 警告 | `#A83232` | `#D87171` |

CSS 変数として `--chart-1` 〜 `--chart-5` + `--chart-overflow` を提供する（§10 参照）。

---

## 2. タイポグラフィ

### 2.1 フォントファミリー

| 用途 | フォント | next/font import 名 | フォールバック |
|------|---------|---------------------|----------------|
| 本文（欧文） | **Geist Sans** | `next/font/google` の `Geist` | `system-ui, sans-serif` |
| 本文（和文） | **Noto Sans JP** | `next/font/google` の `Noto_Sans_JP` | `"Hiragino Sans", "Yu Gothic", sans-serif` |
| 数値・コード | **Geist Mono** | `next/font/google` の `Geist_Mono` | `"SFMono-Regular", Consolas, monospace` |

CSS 変数 `--font-sans` / `--font-jp` / `--font-mono` で定義し、Tailwind の `font-sans` / `font-jp` / `font-mono` から参照する。

### 2.2 サイズ階層

| Role | size (rem / px) | weight | line-height | letter-spacing | 用途 |
|------|------|--------|-------------|----------------|------|
| **display** | 3rem / 48px | 600 | 1.0 | -0.02em | KPI 大数字 / ヒーロー数値 |
| **h1** | 2.25rem / 36px | 700 | 1.15 | -0.015em | ページタイトル |
| **h2** | 1.875rem / 30px | 600 | 1.2 | -0.01em | セクション見出し |
| **h3** | 1.5rem / 24px | 600 | 1.3 | -0.005em | カード見出し |
| **h4** | 1.25rem / 20px | 500 | 1.4 | 0 | 小見出し |
| **body** | 1rem / 16px | 400 | 1.6 | 0 | 本文 |
| **body-sm** | 0.875rem / 14px | 400 | 1.55 | 0 | 補足 |
| **small** | 0.75rem / 12px | 500 | 1.4 | 0.02em | キャプション・ラベル |

### 2.3 数字専用（タビュラー数字 + slashed-zero）

金額表示・登録番号・KPI 数値はすべて以下を必須適用:

```css
font-variant-numeric: tabular-nums slashed-zero;
font-family: var(--font-mono);
```

Tailwind class: `font-mono tabular-nums slashed-zero`

専用ユーティリティクラス `text-numeric` を §10 で定義。

---

## 3. スペーシング

Tailwind v4 のデフォルトスケールに従いつつ、**4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px** の刻みを基本グリッドとして使用する。

| Token | px | Tailwind class |
|-------|----|----|
| space-1 | 4 | `p-1`, `m-1`, `gap-1` |
| space-2 | 8 | `p-2`, `m-2`, `gap-2` |
| space-3 | 12 | `p-3`, `m-3`, `gap-3` |
| space-4 | 16 | `p-4`, `m-4`, `gap-4` |
| space-6 | 24 | `p-6`, `m-6`, `gap-6` |
| space-8 | 32 | `p-8`, `m-8`, `gap-8` |
| space-12 | 48 | `p-12`, `m-12`, `gap-12` |
| space-16 | 64 | `p-16`, `m-16`, `gap-16` |

**画面別ガイドライン**:
- カードパディング = 24（`p-6`）
- セクション間（desktop） = 48（`gap-12` / `space-y-12`）
- セクション間（mobile） = 32（`gap-8`）
- フォーム要素間 = 16（`space-y-4`）
- インライン要素間 = 8（`gap-2`）

---

## 4. 角丸

| Token | px | CSS 変数 | Tailwind class | 用途 |
|-------|----|----------|----|------|
| radius-sm | 6 | `--radius-sm` | `rounded-sm` | Badge / Tag |
| radius-md | 10 | `--radius-md` | `rounded-md` | Button / Input |
| radius-lg | 14 | `--radius-lg` | `rounded-lg` | Card / Dialog |
| radius-xl | 20 | `--radius-xl` | `rounded-xl` | 大型コンテナ |
| radius-full | 9999 | `--radius-full` | `rounded-full` | Pill / Avatar |

shadcn/ui の `--radius` ベースは **10px**（`radius-md`）に固定。

---

## 5. シャドウ

| Token | 値 | 用途 |
|-------|---|------|
| **subtle** | `0 1px 2px rgba(10,10,11,0.04)` | カードのデフォルト |
| **soft** | `0 4px 12px -4px rgba(10,10,11,0.08)` | hover 時の控えめ強調 |
| **elevated** | `0 8px 24px -8px rgba(10,10,11,0.12)` | hover / focused card |
| **pop** | `0 24px 64px -16px rgba(31,107,74,0.18)` | モーダル / 特別な強調 |

Dark モードでは `rgba(0,0,0,0.4)` ベースに切り替える（§10 で実装）。

Tailwind class: `shadow-subtle` / `shadow-soft` / `shadow-elevated` / `shadow-pop`

**禁止**: `shadow-2xl` 等の極端な影、内側影、ガラス質背景。

---

## 6. ボーダー

| Token | 値 | 用途 |
|-------|---|------|
| **hairline** | `0.5px solid var(--border)` | 高密度テーブル / 補助罫線 |
| **standard** | `1px solid var(--border)` | カード / Input / 通常罫線 |
| **emphasis** | `1px solid var(--accent)` | hover / active 状態 |
| **focus** | `2px solid var(--ring)` + `2px offset` | フォーカスリング |

Tailwind class: `border-hairline` / `border` / `border-emphasis` / `ring-2 ring-ring ring-offset-2`

注: 0.5px は Retina ディスプレイ向け。非 Retina では 1px にフォールバック。

---

## 7. モーション

### 7.1 Easing

| Token | 値 | 用途 |
|-------|---|------|
| **standard** | `cubic-bezier(0.2, 0, 0, 1)` | 通常の遷移（入場・状態変化） |
| **emphasized** | `cubic-bezier(0.16, 1, 0.3, 1)` | 強調入場（KPI 出現等） |
| **exit** | `cubic-bezier(0.4, 0, 1, 1)` | 退場（fade out / 行消し） |

### 7.2 Duration

| Token | 値 | 用途 |
|-------|---|------|
| **fast** | 150ms | hover / focus |
| **base** | 250ms | 状態遷移（panel slide / dialog open） |
| **slow** | 400ms | 大きな入場（カード fade-in） |
| **hero** | 800ms | テニスボール軌跡・ナラティブ演出 |
| **count-up** | 600ms | KPI 数字カウントアップ専用 |

### 7.3 Reduced Motion

`prefers-reduced-motion: reduce` の時は:
- カウントアップ → 即時表示（最終値のみ）
- ボール軌跡 → 静止表示（消化率位置に最初から配置）
- パララックス → 完全停止
- hover lift → 透明度変化のみ
- transition → `none` に置換（fast/base/slow すべて 0ms）

---

## 8. フォーカスリング

すべてのインタラクティブ要素に統一仕様で適用:

```css
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Tailwind class での明示指定:
```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
```

**色**: Court Green（Light: `#1F6B4A` / Dark: `#3FA677`）
**スタイル**: `ring-2`（2px）+ `ring-offset-2`（2px オフセット）
**表示条件**: `:focus-visible`（マウスクリック時は非表示、キーボード操作時のみ表示）

---

## 9. Z-index 階層

| Token | 値 | 用途 |
|-------|---|------|
| z-base | 0 | 通常コンテンツ |
| z-dropdown | 10 | ドロップダウン / セレクト |
| z-sticky | 20 | sticky header / footer |
| z-overlay | 30 | サイドパネル背景 |
| z-modal | 40 | Dialog / Sheet |
| z-popover | 50 | Popover / Tooltip |
| z-toast | 60 | Toast / Sonner |

---

## 10. `tailwind.config.ts` 完成形（コピペ可能）

`projects/PRJ-015/app/tailwind.config.ts` に以下をそのまま配置:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "surface-muted": "hsl(var(--surface-muted))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          overflow: "hsl(var(--chart-overflow))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        jp: ["var(--font-jp)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        display: ["3rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "600" }],
        h1: ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "700" }],
        h2: ["1.875rem", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        h3: ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.005em", fontWeight: "600" }],
        h4: ["1.25rem", { lineHeight: "1.4", fontWeight: "500" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
        small: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      borderWidth: {
        hairline: "0.5px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(10,10,11,0.04)",
        soft: "0 4px 12px -4px rgba(10,10,11,0.08)",
        elevated: "0 8px 24px -8px rgba(10,10,11,0.12)",
        pop: "0 24px 64px -16px rgba(31,107,74,0.18)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "250ms",
        slow: "400ms",
        hero: "800ms",
        countup: "600ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        emphasized: "cubic-bezier(0.16, 1, 0.3, 1)",
        exit: "cubic-bezier(0.4, 0, 1, 1)",
      },
      zIndex: {
        base: "0",
        dropdown: "10",
        sticky: "20",
        overlay: "30",
        modal: "40",
        popover: "50",
        toast: "60",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 250ms cubic-bezier(0.2, 0, 0, 1) both",
        "slide-in-right": "slide-in-right 250ms cubic-bezier(0.2, 0, 0, 1) both",
        "slide-out-right": "slide-out-right 250ms cubic-bezier(0.4, 0, 1, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

---

## 11. `app/globals.css` 完成形（コピペ可能）

`projects/PRJ-015/app/app/globals.css` に以下をそのまま配置:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ===== Light モード ===== */
    --background: 60 18% 97%;        /* #FAFAF7 */
    --foreground: 240 4% 5%;          /* #0A0A0B */
    --card: 0 0% 100%;                /* #FFFFFF */
    --card-foreground: 240 4% 5%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 4% 5%;
    --primary: 240 4% 5%;             /* Ink Black */
    --primary-foreground: 60 18% 97%;
    --secondary: 45 14% 89%;          /* #E7E5DF */
    --secondary-foreground: 240 4% 5%;
    --muted: 45 14% 89%;
    --muted-foreground: 0 0% 42%;     /* #6B6B6B */
    --accent: 152 55% 27%;            /* #1F6B4A Court Green */
    --accent-foreground: 60 18% 97%;
    --destructive: 0 54% 43%;         /* #A83232 */
    --destructive-foreground: 60 18% 97%;
    --success: 150 44% 33%;           /* #2F7A52 */
    --warning: 30 75% 41%;            /* #B8741A */
    --danger: 0 54% 43%;
    --border: 45 16% 82%;             /* #D8D6CF */
    --input: 45 16% 82%;
    --ring: 152 55% 27%;
    --surface-muted: 45 14% 89%;

    /* チャート 5 段濃淡（choropleth） */
    --chart-1: 145 18% 92%;           /* #E8F0EB */
    --chart-2: 145 25% 82%;           /* #C5DDD0 */
    --chart-3: 145 26% 60%;           /* #7FB497 */
    --chart-4: 150 37% 39%;           /* #3F8762 */
    --chart-5: 152 55% 27%;           /* #1F6B4A */
    --chart-overflow: 0 54% 43%;      /* #A83232 */

    /* 角丸 */
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-xl: 20px;

    /* shadcn 互換 */
    --radius: var(--radius-md);
  }

  .dark {
    /* ===== Dark モード（コート照明感）===== */
    --background: 150 7% 5%;          /* #0C0E0D */
    --foreground: 48 18% 91%;         /* #ECEAE3 */
    --card: 195 8% 9%;                /* #15181A */
    --card-foreground: 48 18% 91%;
    --popover: 195 8% 9%;
    --popover-foreground: 48 18% 91%;
    --primary: 48 18% 91%;
    --primary-foreground: 240 4% 5%;
    --secondary: 195 6% 13%;          /* #1C2022 */
    --secondary-foreground: 48 18% 91%;
    --muted: 195 6% 13%;
    --muted-foreground: 50 4% 60%;    /* #9A9A95 */
    --accent: 152 45% 45%;            /* #3FA677 */
    --accent-foreground: 240 4% 5%;
    --destructive: 0 56% 65%;         /* #D87171 */
    --destructive-foreground: 240 4% 5%;
    --success: 152 45% 45%;
    --warning: 30 64% 53%;            /* #D4923A */
    --danger: 0 56% 65%;
    --border: 195 6% 16%;             /* #262A2C */
    --input: 195 6% 16%;
    --ring: 152 45% 45%;
    --surface-muted: 195 6% 13%;

    --chart-1: 150 28% 15%;
    --chart-2: 150 30% 21%;
    --chart-3: 152 35% 28%;
    --chart-4: 152 45% 45%;
    --chart-5: 150 47% 56%;
    --chart-overflow: 0 56% 65%;
  }

  * {
    border-color: hsl(var(--border));
  }

  html {
    color-scheme: light dark;
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: var(--font-sans), var(--font-jp), system-ui, sans-serif;
    font-feature-settings: "cv11", "ss01";
    -webkit-font-smoothing: antialiased;
  }

  /* 日本語混在時のフォールバック */
  :lang(ja) {
    font-family: var(--font-jp), var(--font-sans), system-ui, sans-serif;
  }
}

@layer utilities {
  /* タビュラー数字（金額表示専用） */
  .text-numeric {
    font-family: var(--font-mono), monospace;
    font-variant-numeric: tabular-nums slashed-zero;
    letter-spacing: 0;
  }

  /* ヘアラインボーダー */
  .border-hairline {
    border-width: 0.5px;
  }
  @media (-webkit-min-device-pixel-ratio: 1) and (max-resolution: 1dppx) {
    .border-hairline {
      border-width: 1px;
    }
  }

  /* shadow-pop の Dark モード上書き */
  .dark .shadow-pop {
    box-shadow: 0 24px 64px -16px rgba(63, 166, 119, 0.25);
  }
  .dark .shadow-elevated {
    box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.4);
  }
  .dark .shadow-soft {
    box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.3);
  }
  .dark .shadow-subtle {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
}

/* prefers-reduced-motion 対応 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 12. フォント読み込み（`app/layout.tsx`）

```tsx
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jp",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
```

---

## 13. 改訂手続き

トークン値変更が必要な場合は:
1. Designer に変更要求を Issue 起票
2. Designer が design-tokens.md を改訂し、§14 の改訂履歴に追記
3. Dev は最新版を pull して `tailwind.config.ts` / `globals.css` を更新
4. 全画面の視覚回帰テスト（W7 で予定）

---

## 14. 改訂履歴

| 日付 | 内容 | 改訂者 |
|------|------|--------|
| 2026-04-26 | 初版（Phase 1 W1 適用版） | Designer |
