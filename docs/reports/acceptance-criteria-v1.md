# PRJ-015 Coatly Phase 1 → Phase 2 受入基準（客観指標版）

- **案件ID**: PRJ-015
- **案件名**: Coatly（中国地方テニス部 予算管理 Webアプリ）
- **作成日**: 2026-04-26
- **作成者**: 開発部門 + レビュー部門 + PM 部門
- **目的**: DEC-006 残条件 C-04（受入基準の客観指標化）の解消。
- **位置づけ**: Phase 1 MVP 完成 → Phase 2 SHOULD 着手のための **Gate 1→2 移行基準**。「最高 UX × あっと驚き」を主観評価で終わらせず数値で測定可能にする。
- **参照**:
  - `organization/rules/quality-gates.md`（組織標準 Gate 6 / Gate 7）
  - `organization/rules/review-checklist.md`
  - `organization/rules/testing-policy.md`
  - `projects/PRJ-015/reports/dev-technical-spec.md` §12 テスト戦略
  - `projects/PRJ-015/reports/security-baseline.md`（C-02 成果物）
  - `projects/PRJ-015/reports/legal-privacy-policy.md`（C-03 成果物）

---

## 0. エグゼクティブサマリー

| カテゴリ | 指標数 | 合格ラインの厳しさ |
|---------|------:|------------------|
| 機能完了 | 1 | MUST 14 ストーリー全 PASS |
| テスト | 5 | E2E 5 本以上 / 認可漏れ E2E 5 本以上 / カバレッジ 70%+ |
| 静的品質 | 3 | TS / ESLint / Build エラー全ゼロ |
| パフォーマンス | 5 | Lighthouse 90+/95+/90+ / bundle / LCP |
| アクセシビリティ | 2 | axe-core 0 件 / キーボード可達 |
| セキュリティ | 2 | OWASP ZAP/Snyk 0 / Mozilla Observatory A+ |
| デザイン | 2 | カンプ一致 95% / 驚き要素 3 点動作 |
| 運用 | 1 | README + RUNBOOK 完備 |
| 法務 | 1 | プラポリ・規約公開済み |
| **合計** | **22 指標** | **1 つでも未達 → ロールバック or 追加スプリント** |

---

## 1. Phase 1 → Phase 2 移行受入基準（客観指標）

### 1.1 機能完了

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| F-1 | **MUST 14 ストーリー（US-A01-05 / US-M01-05 / US-U01-06）全 PASS** | 100%（14/14） | 手動 UAT + E2E | W8 末 |

### 1.2 テスト

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| T-1 | **E2E テスト本数** | **5 本以上**（招待ログイン / 申請作成 / 領収証アップロード / 承認 / 全体ダッシュボード） | `playwright test` のテスト数 | CI 毎回 |
| T-2 | **E2E PASS 率** | **100%**（flaky retry 1 回まで許容） | CI 結果 | CI 毎回 |
| T-3 | **ユニット + 統合カバレッジ（lib/actions / lib/validators / lib/auth）** | **70% 以上**（statements / branches / functions / lines いずれも） | `vitest --coverage` | CI 毎回 |
| T-4 | **認可漏れ E2E（県スコープ / グループスコープ）** | **5 本以上 PASS**（他県の expense select / 他県 update / 他県 storage put / member の admin 操作 / expired session） | Playwright + Drizzle テストフィクスチャ | CI 毎回 |
| T-5 | **インテグレーションテスト（Drizzle + Turso ローカル）** | **20 本以上 PASS** | `vitest run tests/integration` | CI 毎回 |

**備考（T-4 詳細）**: DEC-010 R-Turso-02「RLS が DB 層で強制できないため、アプリ層認可漏れが致命的」に対する対策。以下 5 ケースを必須:

| Case | シナリオ | 期待結果 |
|------|---------|---------|
| C1 | 県A の member が県B の expense を SELECT | 0 件 |
| C2 | 県A の manager が県B の expense を UPDATE 試行 | 403 Forbidden |
| C3 | 県A の member が県B の receipt path を直接叩く | 403 Forbidden |
| C4 | member が `/admin/*` にアクセス | 403 Forbidden + redirect |
| C5 | expired / tampered session で API 呼び出し | 401 Unauthorized |

### 1.3 静的品質

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| Q-1 | **TypeScript エラー** | **0 件** | `pnpm tsc --noEmit` | コミット前 + CI |
| Q-2 | **ESLint エラー** | **0 件**（warning も `--max-warnings=0`） | `pnpm eslint . --max-warnings=0` | コミット前 + CI |
| Q-3 | **Build 成功（全ルート緑）** | **全ルート成功** | `pnpm next build` | CI 毎回 |

### 1.4 パフォーマンス

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| P-1 | **Lighthouse Performance** | **90 以上** | `@lhci/cli` を CI で実行 | PR 毎 + W8 |
| P-2 | **Lighthouse Accessibility** | **95 以上** | 同上 | 同上 |
| P-3 | **Lighthouse SEO** | **90 以上** | 同上 | 同上 |
| P-4 | **Initial JS bundle**（ダッシュボード） | **< 200KB gzip** | `@next/bundle-analyzer` | W8 |
| P-5 | **LCP（ダッシュボード）** | **< 2.5s**（モバイル中速回線シミュレーション） | Vercel Speed Insights / Lighthouse | W8 |

**Lighthouse 計測対象ルート**:
- `/login`
- `/dashboard`（県管理者ロール）
- `/admin/overview`（全体管理者ロール）
- `/expenses/new`

各ルートの Performance 90+ 必須。最も重い `/admin/overview` で 90 取れない場合は dynamic import で遅延ロードに調整。

### 1.5 アクセシビリティ

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| A-1 | **axe-core 検出違反（critical）** | **0 件** | `@axe-core/playwright` を E2E に組込 | E2E 実行毎 |
| A-2 | **キーボード操作完遂**（全フォーム / 主要操作 Tab で操作可能） | **全 4 フォーム合格**（ログイン / 申請 / 承認 / 予算設定） | 手動チェック（オーナー UAT 同席） | W8 |

**A-1 詳細**: axe-core の `critical` / `serious` レベルは 0 必須、`moderate` 以下は理由付きで許容（最大 5 件）。

### 1.6 セキュリティ

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| S-1 | **OWASP ZAP / Snyk High+ 脆弱性** | **0 件** | `pnpm audit --audit-level=high` + Snyk Free スキャン | CI 毎回 + W8 |
| S-2 | **セキュリティヘッダー（Mozilla Observatory）** | **A+ グレード** | observatory.mozilla.org でドメインスキャン | W8 |

**追加チェック（合格ライン外だが推奨）**:
- securityheaders.com で **A+**
- 5 回ログイン失敗でアカウントロック発動を smoke test で確認
- 領収証 MIME 偽装攻撃を smoke test で確認

### 1.7 デザイン

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| D-1 | **Figma カンプ vs 実装の一致度** | **95% 以上** | Designer + Dev による画面別目視レビュー（チェックリスト方式） | W8 |
| D-2 | **「あっと驚き要素」3 点全実装 + 動作** | **3/3 動作**（中国地方マップ choropleth / カウントアップ / テニスボール軌跡） | デザイン部門 + CEO 確認 | W8 |

**D-1 計測手順**:
- 主要 8 画面（ログイン / ダッシュボード県管理者 / ダッシュボード admin / 申請新規 / 申請詳細 / 承認サイドパネル / 予算設定 / ユーザー管理）
- 各画面で 20 項目チェックリスト（色 / 余白 / フォント / アイコン / アニメ / レイアウト / 状態（hover/focus/disabled）/ レスポンシブ）
- 一致 = 160 項目中 152 項目以上（95%）
- ピクセルパーフェクト要求ではなく「ガイドライン準拠」レベル

**D-2 計測手順**:
- 中国地方マップ: 県を hover で fill 切替 / クリックで県別画面へ遷移
- カウントアップ: ダッシュボード遷移時に 600ms でカウント
- テニスボール軌跡: 月切替で 800ms でボールが移動 / `prefers-reduced-motion` で即値

### 1.8 運用

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| O-1 | **README + RUNBOOK + DEPLOYMENT + ARCHITECTURE 完備** | 4 ファイル全て揃い、レビュー部門承認 | レビュー部門目視 | W8 |

**必須ドキュメント内容**:
- `README.md`: セットアップ手順（5 分で動かせる粒度）
- `RUNBOOK.md`: 障害対応フロー / Sentry アラート対応 / シークレットローテーション / バックアップ復元手順
- `DEPLOYMENT.md`: Vercel / Turso / Vercel Blob / Resend のデプロイ・環境変数設定手順
- `ARCHITECTURE.md`: 技術選定の根拠 + データフロー + 認可レイヤ図

### 1.9 法務

| # | 指標 | 合格ライン | 計測方法 | 計測タイミング |
|---|------|----------|---------|--------------|
| L-1 | **プライバシーポリシー + 利用規約公開済み** | `/privacy` / `/terms` の URL に 200 OK でアクセス可能 + フッターリンク | curl / 手動アクセス確認 | W8 |

---

## 2. 合否判定ルール

### 2.1 全項目合格 → Phase 2 着手 OK

22 指標全てが合格ライン以上の場合のみ Phase 2 SHOULD 機能（CSV / 通知 / 監査 UI / ダークモード）の着手を承認する。

### 2.2 1 項目でも未達 → 以下 3 オプションのいずれか

| オプション | 適用条件 | 措置 |
|-----------|---------|------|
| **A. 追加スプリント**（推奨） | 未達指標 ≤ 5 件 / 推定追加工数 ≤ 5 人日 | W9〜W10 で潰す。Phase 1 リリース日を 2 週間延期。 |
| **B. Phase 1 ロールバック** | 重大セキュリティ問題 / 認可漏れ E2E 不合格 / 機能未完成 | 該当 Week にロールバックし設計から見直し。 |
| **C. 例外承認**（Conditional Pass） | デザイン D-1 の一致度 90-94% 等、品質に直結しない軽微 | CEO + オーナー承認で Phase 2 着手 + 即座に修正タスク発行。max 3 項目まで。 |

### 2.3 判定主体

- **テスト系（T-1〜T-5 / Q-1〜Q-3 / P-1〜P-5 / A-1 / S-1）**: CI が自動判定（PASS/FAIL）
- **手動系（F-1 / A-2 / S-2 / D-1 / D-2 / O-1 / L-1）**: レビュー部門 + デザイン部門 + CEO の三者合意
- **総合判定**: CEO（オーナー上申はオーナーへ）

---

## 3. CI における自動チェック実装方針

### 3.1 GitHub Actions ワークフロー

```yaml
# .github/workflows/ci.yml（抜粋）
jobs:
  lint:
    - run: pnpm tsc --noEmit          # Q-1
    - run: pnpm eslint . --max-warnings=0  # Q-2

  test:
    - run: pnpm vitest run --coverage  # T-3 / T-5
    - run: pnpm playwright test        # T-1 / T-2 / T-4

  build:
    - run: pnpm next build             # Q-3
    - run: pnpm next-bundle-analyzer   # P-4

  audit:
    - run: pnpm audit --audit-level=high  # S-1

  lighthouse:
    - run: pnpm lhci autorun           # P-1 / P-2 / P-3 / P-5

  axe:
    - run: pnpm playwright test --grep @axe  # A-1
```

### 3.2 PR マージ条件

- 上記 6 job 全て green
- レビュー部門 1 名以上の approve
- main へのダイレクトプッシュ禁止

### 3.3 Phase 1 → 2 移行 Gate チェック実行

W8 末に以下スクリプトを実行し、22 指標の合否を一覧表で出力:

```bash
# scripts/gate-check.sh
pnpm gate:functional   # F-1
pnpm gate:test         # T-1〜T-5
pnpm gate:static       # Q-1〜Q-3
pnpm gate:performance  # P-1〜P-5
pnpm gate:a11y         # A-1
pnpm gate:security     # S-1
# 手動系は別途レビュー記録
```

---

## 4. Phase 0 既存指標との整合

`pm-requirements-wbs.md` §5 Gate 2→3 / Gate 3→4 と本書の対応:

| WBS 指標 | 本書 ID | 整合 |
|---------|--------|------|
| 全 Phase 1 MUST 機能の実装完了 | F-1 | ✓ |
| ローカルで主要フロー動作 | F-1 + T-1 | ✓ |
| ユニットテストカバレッジ 70%+ | T-3 | ✓（具体的な対象 lib を明示） |
| Core Web Vitals（LCP/CLS/INP） | P-5 + Lighthouse | ✓（CLS/INP は Lighthouse 指標に内包） |
| E2E テスト全 PASS | T-2 | ✓ |
| RLS 漏れテスト全 PASS | T-4 | ✓（DEC-010 で「アプリ層認可」に変換） |
| `npm audit --audit-level=high` ゼロ | S-1 | ✓ |
| `.env.local` が `.gitignore` 済み | security-baseline.md §8.2 | ✓（PR レビューで毎回確認） |
| WCAG 2.1 AA レベル | A-1 + A-2 | ✓（WCAG 2.2 AA に格上げ） |
| レビュー部門の Critical ゼロ | S-1 + 全項目 | ✓ |

---

## 5. 主観基準の客観化（DEC-006 C-04 の核心）

レビュー判定 §4.5「最高 UX × あっと驚く」が主観依存だった問題への対応:

| 元の主観基準 | 客観指標 |
|------------|---------|
| 「最高 UX」 | P-1 Lighthouse Performance 90+ / A-1 axe-core 0 / D-1 カンプ一致 95%+ |
| 「あっと驚き」 | D-2 装飾要素 3 点全動作 |
| 「おしゃれ」 | D-1 カンプ一致 95%+ + デザイン部門目視 |
| 「使うのが楽しい」 | **オーナー UAT 5 段階評価 4 以上**（W8 末に実施） |
| 「業務が回る」 | F-1 全 14 ストーリー PASS + T-1 E2E 5 本 PASS |

**オーナー UAT 評価項目（5 段階 4 以上を合格）**:
1. ログイン〜申請が直感的に行えるか
2. 領収証アップロードが負担にならないか
3. 承認画面で必要情報が一目で分かるか
4. ダッシュボードで予算消化が「あっと驚く」か
5. 全体的なデザインの好み（高級感 / 信頼感）
6. レスポンシブ（スマホ）の操作性
7. 「使うのが楽しい」と感じるか

→ 平均 4.0 以上 + 最低点 3 以上 を合格条件とする。

---

## 6. 改訂履歴

| 日付 | 内容 | 作成者 |
|------|------|-------|
| 2026-04-26 | 初版作成（DEC-006 C-04 解消） | 開発 + レビュー + PM 部門 |

---

**本書は DEC-006 残条件 C-04 の成果物として CEO 承認をもって有効化する。Phase 1 W1 着手前に decisions.md に「Phase 1→2 受入基準として本書を採用」を明記する。**
