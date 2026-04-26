# PRJ-015 意思決定ログ

PRJ-015「テニス部予算管理Webアプリ（仮称）」に関する意思決定を時系列で記録する。

---

## DEC-001: PRJ-015 起案
- **日付**: 2026-04-26
- **決裁者**: オーナー（発注） / CEO（受領・採番） / 秘書（登録）
- **決定内容**: 「テニス部予算管理Webアプリ（仮称）」を新規案件として PRJ-015 で採番し、Phase 0（要件定義）として正式起案する。
- **理由**:
  - オーナーからの新規発注。
  - テニス部（中国地方5県：岡山・広島・山口・鳥取・島根）における予算・活動費管理ニーズが明確。
  - ユーザー種別3階層（全体管理者 / 県管理者 / 一般ユーザー）と領収証・インボイス対応という具体要件が初動から提示されており、要件定義に進む十分な根拠あり。
- **代替案**:
  - 既存の汎用経費精算SaaS（マネーフォワード経費 / freee経費 / 楽楽精算）の導入提案 → 5県広域組織 × 部活動 × 県活動費充当判断というドメイン特性のため不採用。専用設計で差別化。
- **影響範囲**:
  - `dashboard/active-projects.md` に PRJ-015 を稼働中案件として追加。
  - 次の案件IDを PRJ-016 に更新。
  - 全部署（PM / リサーチ / 開発 / マーケ / レビュー / Web運営）招集 → 要件定義・実装計画策定フェーズへ移行。
- **アクションアイテム**:
  - [ ] PM: タスク分解・WBS 作成
  - [ ] リサーチ: 競合経費精算SaaSの機能比較 / 電子帳簿保存法 + インボイス制度の要件整理
  - [ ] 開発: 技術スタック確定（Next.js + Supabase + Vercel ベースで詳細化）+ DB スキーマ初期案
  - [ ] マーケ: 提供価値・命名候補の整理（テニス部内製ツールか、汎用化して他部活向け SaaS 化するかの戦略仕切り）
  - [ ] レビュー: 品質ゲート設計（RLS / 5県スコープ漏洩防止のテスト方針）
  - [ ] 秘書: ヒアリング項目（`project-brief.md` 未確認事項）をオーナーに照会

---

## DEC-002: 統合スタック確定（Next.js 16 + Supabase + Tremor + Framer Motion）
- **日付**: 2026-04-26
- **決裁者**: CEO（リサーチ・開発部門の推奨を採用）
- **決定内容**: 中核技術スタックを以下で確定する。
  - フロント: Next.js 16 App Router + TypeScript + shadcn/ui + Tailwind v4
  - バック: Supabase（Postgres + Auth + Storage + Realtime、単一org + `prefecture` enum + 全表 RLS）
  - データビズ: Tremor + Recharts
  - アニメーション: Framer Motion
  - メール: Resend
  - デプロイ: Vercel
- **理由**: 組織標準と完全整合 + リサーチ部門の比較検証で「最高 UX × おしゃれ」要件を満たすベストフィット。マルチテナント不要（5県固定）のため `prefecture` enum で十分。
- **代替案**: Tremor 不採用で素の Recharts → カスタム工数膨張でNG。Auth.js → Supabase Auth と Storage の統合性で劣るため不採用。
- **影響範囲**: 全実装フェーズ。

---

## DEC-003: デザイン方針 = A案 Quiet Luxury Sport 採用
- **日付**: 2026-04-26
- **決裁者**: CEO（デザイン部門の推奨を採用）
- **決定内容**: デザインムードを **A案 Quiet Luxury Sport**（Linear/Mercury 系の静謐な高級感、Court Green アクセント）で確定。「あっと驚き要素」TOP3（中国地方5県インタラクティブマップ choropleth / タビュラー数字 600ms カウントアップ / テニスボール軌跡で予算消化可視化）を MVP P0 として実装する。
- **理由**: AI 感を出さずクリーンで信頼感を出すという組織デザインガイドと完全整合。金銭・承認業務に必要な厳格さと、案件文脈（テニス部）に強くフィットする"驚き"を両立。
- **代替案**: B案 Editorial × Court Vision（雑誌的）/ C案 Glassmorphism Tactile（ガラス質） → 高級感は出るが、本案件の業務フォーマル性には A 案が最適と判定。
- **影響範囲**: デザイントークン / Tailwind config / 全画面スタイル。

---

## DEC-004: プロダクト命名 = Coatly（コートリー）
- **日付**: 2026-04-26
- **決裁者**: CEO（マーケティング部門の推奨を採用）
- **決定内容**: プロダクト名を **Coatly（コートリー）** で仮確定する。Court + ly の造語で、テニス起点ながら横展開（他部活・町内会・NPO）にもブランド毀損しにくく、courtly（上品）の含意で「おしゃれ UI」要望と整合。ヒーローキャッチ初期案: **「部費が、散らからない。」**
- **理由**: 5案中最もブランドポテンシャルが高く、汎用拡張・受託派生の両方に耐える命名。
- **代替案**: 他4命名候補は marketing-positioning.md 参照。
- **影響範囲**:
  - 全レポートの「テニス部予算管理Webアプリ（仮称）」を順次「Coatly」に置換（W1 着手前まで）。
  - ドメイン取得: `coatly.app` / `coatly.jp` の WHOIS 確認 + 商標 J-PlatPat 検索を別タスク化。
- **オーナー最終承認待ち**: 命名最終確定はオーナー判断（暫定 Go）。

---

## DEC-005: Phase 1 MVP スコープ凍結（38人日 / 7.6週）
- **日付**: 2026-04-26
- **決裁者**: CEO（PM / 開発部門の推奨を採用）
- **決定内容**: Phase 1 MVP のスコープを以下で凍結する。
  - **MUST 14 ストーリー**（招待→ログイン→活動費申請→領収証添付→承認→集計→ダッシュボード→全体管理者ビュー）
  - **工数**: 38人日 / 8週（W1 環境構築 → W8 E2E＋デプロイ）
  - **SHOULD（CSV / メール通知 / 監査UI / ダークモード）**: Phase 2 へ繰り延べ（ただし Phase 1 中の余力で着手可）
  - **NICE（OCR / PWA / 超過アラート）**: Phase 2/3 で扱う
  - レスポンシブ・WCAG 2.2 AA は MUST に含む
- **理由**: 「最高 UX × あっと驚き」を達成するためには磨き込み時間が必要。MVP を MUST に絞り、デザイン磨き込みに余力を確保する戦略。
- **影響範囲**: PM の WBS、開発の Week 計画、レビューの受入基準。

---

## DEC-006: Phase 0 → Phase 1 = Conditional Go（条件付き着手承認）
- **日付**: 2026-04-26
- **決裁者**: CEO（レビュー部門判定を採用）
- **決定内容**: Phase 0（要件定義・計画策定）の品質ゲートを **Conditional Go** で通過とする。以下5条件を W1 着手前に解消することを実装着手の必要条件とする。
  - C-01: オーナー決裁4件（電子帳簿保存法対応の要否 / 年度開始月 / FY2026 予算初期値 / 命名 Coatly 確定 + ドメイン取得）の確定
  - C-02: セキュリティテンプレ（CSRF / Rate Limiting / セキュリティヘッダー）を dev-technical-spec.md に追記
  - C-03: 個人情報・領収証画像の法務方針（保存期間 / 退会時削除権 / プライバシーポリシー）の確定
  - C-04: Phase 1→2 受入基準を客観指標化（E2E 5本 PASS / カバレッジ 70% / Lighthouse 90+ など）
  - C-05: Figma カンプ確定タイミングを Dev 計画に組み込み（W1 並行で 3画面カンプ着手）
- **理由**: 設計品質は W1 着手可能水準に到達。残課題は実装着手前に確実に潰せる範囲。
- **影響範囲**: 着手予定 = **2026-05-01**（条件解消後）。

---

## DEC-007: 個人情報・法務リスクの先行クリア（Phase 0 中）
- **日付**: 2026-04-26
- **決裁者**: CEO
- **決定内容**: レビュー部門が指摘した重大抜け漏れ TOP1（個人情報・領収証画像の扱い + 法務）を Phase 0 残タスクとして即時着手する。
  - 領収証画像の保存期間（推奨: 7年＝法人税法準拠 / 任意削除可）
  - 退会時の削除フロー（Storage 削除 + DB 論理削除）
  - プライバシーポリシー / 利用規約 雛形作成
  - 個人情報保護法（改正法）対応チェックリスト
- **理由**: 領収証は氏名・購入履歴・個人特定情報を含む。法務不備のままリリースすると致命的。Phase 1 着手前に整理し、DDL とポリシー文書に反映する。
- **アクションアイテム**:
  - [ ] レビュー部門 + 開発部門で `projects/PRJ-015/reports/legal-privacy-policy.md` 起案
  - [ ] PM: タスク追加（法務クリア = Phase 0 完了の必須条件に組込み）

---

## DEC-008: オーナー上申事項（決裁待ち5件）
- **日付**: 2026-04-26
- **決裁者**: オーナー（CEO 経由で上申）
- **決定内容**: 以下5項目をオーナーに即時照会する。回答が揃い次第 W1 着手判断を確定する。
  - Q-01: **年度開始月**（推奨 = 4月、テニス部の会計年度に合わせる）
  - Q-02: **電子帳簿保存法対応の要否**（推奨 = MVP は保存のみ、本格対応は Phase 2）
  - Q-03: **FY2026 予算初期値**（5県 + 全体の6値、seed データ作成に必要）
  - Q-04: **命名「Coatly」最終確定 + ドメイン**（`coatly.app` or `coatly.jp` 取得）
  - Q-05: **このアプリは「テニス部内製専用」か「他部活SaaS化前提」か**（DB設計の汎用度に直結）
- **回答期限**: 2026-04-30 までに回答取得。

---

## DEC-009: オーナー上申5件への回答受領
- **日付**: 2026-04-26
- **決裁者**: オーナー
- **決定内容**: DEC-008 で上申した Q-01〜Q-05 へのオーナー回答を以下で確定する。
  - **Q-01 年度開始月** = **4月**（テニス部の会計年度に合わせる）
  - **Q-02 電子帳簿保存法対応** = **MVP は保存のみ、本格対応は Phase 2**（推奨案採用）
  - **Q-03 FY2026 予算初期値** = **テニス部全体 ¥300,000 + 各県（5県）¥100,000 ずつ、計 ¥800,000**
    - seed: organizations.budget = 300000、prefectures × 5 各 100000
  - **Q-04 命名 Coatly** = **確定**、ただし**ドメイン取得は不要**
    - 影響: コーポレートサイト連携や独自ドメイン公開は対象外。Vercel default domain（`coatly.vercel.app` 等）で運用。商標 J-PlatPat 検索タスクは保留（個人開発の小規模利用のため）。
  - **Q-05 SaaS 化方針** = **将来的に他部活 SaaS 化も視野**（DB は汎用設計）
    - 影響: DB 設計を `organizations`（テニス部・他部活・町内会・PTA等を表す汎用テナント）+ `groups`（県＝中国地方5県、他部活では支部・チーム等）の2階層汎用構造に再設計する。`prefecture` enum は MVP 用 fallback として残しつつ、本筋は `groups` テーブルで表現。
- **理由**: オーナー判断を尊重しつつ、SaaS 化視野により MVP 設計をマルチテナント対応に格上げ。これにより Phase 2 以降の他部活展開が DB マイグレーション不要で可能になる。
- **影響範囲**:
  - DDL の `prefectures` enum 中心設計 → `organizations + groups` 汎用テーブル設計に再構成
  - seed データに具体的予算金額を反映
  - ドメイン取得タスクを WBS から削除
  - 電帳法 Phase 2 対応を「将来要件」として `decisions.md` に明記済み
- **アクションアイテム**:
  - [ ] Dev: DDL を `organizations / groups` 構造に再設計（DEC-010 の Turso 対応と合わせて実施）
  - [ ] PM: WBS からドメイン取得タスクを削除
  - [ ] Designer: 「中国地方5県マップ」は MVP では `organizations.kind = 'tennis_club'` 時のみ表示する条件分岐に変更（他部活展開時は別ビュー）

---

## DEC-010: DB を Supabase から Turso（libSQL）に変更
- **日付**: 2026-04-26
- **決裁者**: オーナー（CEO 承認）
- **決定内容**: DB プラットフォームを **Supabase（Postgres）から Turso（libSQL = SQLite fork）に変更**する。これに伴い、Supabase が提供していた Auth / Storage / Realtime / RLS 機能を以下の代替で実装する（最終的な技術スタックは Research 部門の調査結果を踏まえ DEC-011 で確定）。
  - **DB**: Turso（libSQL、Free tier = 500 DBs / 9GB / 1B row reads/月 / 25M row writes/月）
  - **ORM**: Drizzle ORM（Turso 公式推奨、TS 型安全、マイグレーション機能あり）
  - **Auth**: 候補 = Better Auth / Auth.js v5 / Clerk Free tier（Research 部門が比較検証）
  - **Storage**: 候補 = Vercel Blob / Cloudflare R2 / UploadThing（無料枠と Vercel 連携性で比較）
  - **Realtime**: MVP では不採用（ポーリング or 楽観更新で代替、Phase 2 で必要なら検討）
  - **RLS**: アプリケーション層で `requireRole(scope, group, role)` ヘルパを Server Actions / Route Handlers に必須適用。Drizzle のクエリビルダで where 句を強制するパターンを採用。
- **理由**:
  - **コスト**: オーナー要望「無料で行きたい」を最優先。Supabase Free（500MB DB / 1GB Storage）でも MVP は収まるが、Turso Free の方がスケール余地が圧倒的に大きい（9GB）。
  - **Edge 性能**: Turso は libSQL で edge replicas を持ち、Vercel Edge Runtime と相性が良い。
  - **シンプルさ**: SQLite ベースで運用知識が広く、ローカル開発も `libsql-server` または file: で完結。
  - **SaaS 化視野（Q-05）**: 各テナント DB を Turso で個別作成可能（500 DB まで Free）、将来の database-per-tenant 戦略にも対応可能。
- **代替案検討**:
  - **Supabase Free 継続**: Auth/Storage/Realtime 統合済みで最速。ただしコスト要望に反するため不採用（オーナー指示優先）。
  - **Neon Free（Postgres）**: 0.5GB / 1 DB のみ、SaaS 化視野では Turso に劣る。
  - **PlanetScale**: 2024 に Free tier 廃止、不採用。
  - **Cloudflare D1**: SQLite だが Cloudflare Pages 専用色が強く、Vercel との組み合わせで Turso が優位。
- **トレードオフ（オーナー認識すべきリスク）**:
  - **R-Turso-01**: SQLite なので Postgres 固有機能（PostGIS / array / jsonb 高度クエリ / pg_cron）が使えない。本案件では不要レベル。
  - **R-Turso-02**: RLS が DB レイヤで強制できないため、アプリ層の認可漏れが致命的。**統合テストで全 RLS 相当ロジックを E2E 検証する必要あり**（Phase 1 W2 でテスト整備）。
  - **R-Turso-03**: Auth / Storage / Realtime をそれぞれ別ベンダーで組むため、運用コンポーネント数が増える（Vercel + Turso + Better Auth + Vercel Blob = 4 ベンダー）。
  - **R-Turso-04**: Auth ライブラリ選定次第で学習コスト・実装難度が変わる（Better Auth は新興、Auth.js v5 は安定だが API が複雑）。
  - **R-Turso-05**: ファイルアップロード（領収証）は別サービスで、署名 URL / アクセス制御を自前実装。Storage RLS が DB と切り離されるため、整合性チェックが必須。
- **影響範囲**:
  - DEC-002（統合スタック確定）を**部分撤回・改訂**し、DEC-011（v2 確定）として再決裁する。
  - Dev の technical-spec.md → v2 に改訂（DDL を libSQL/SQLite syntax に変換、RLS をアプリ層認可に変換、Storage を Vercel Blob/R2 に置換）。
  - Research の研究範囲拡張（Turso + Auth + Storage + ORM の比較検証）。
  - Phase 1 工数: Auth / Storage の自前統合分で **+2〜3人日**（38人日 → 40〜41人日見込み）。Research 部門の検証結果次第で確定。
- **アクションアイテム**:
  - [ ] Research: Turso ecosystem 深掘り → `reports/research-turso-ecosystem.md` 提出
  - [ ] Dev: technical-spec v2 改訂 → `reports/dev-technical-spec-v2.md` 提出
  - [ ] Review: v2 を品質ゲート再判定
  - [ ] CEO: DEC-011 で v2 統合スタックを再決裁

---

## DEC-011: 統合無料スタック v2 確定（Turso + Drizzle + Better Auth + R2）
- **日付**: 2026-04-26
- **決裁者**: CEO（Research 部門の Turso ecosystem 深掘り + Dev 部門 v2 spec + Review 部門 v2 ゲート判定を採用）
- **決定内容**: PRJ-015 Coatly の統合スタックを以下で確定する（DEC-002 を完全置換）:

```
Frontend:    Next.js 16 App Router + TypeScript + shadcn/ui + Tailwind v4 + Tremor + Framer Motion
DB:          Turso (libSQL)               [Free 9GB / 1B reads/月 / 25M writes/月]
ORM:         Drizzle ORM + drizzle-zod    [OSS]
Auth:        Better Auth + organization plugin  [OSS、MAU 無制限]
Storage:     Cloudflare R2                [Free 10GB / egress 完全無料]
Email:       Resend                       [Free 3K通/月]
Hosting:     Vercel Hobby                 [Free + 100GB帯域 / Server Actions 無制限]
Realtime:    なし（楽観更新 + revalidatePath + 30秒ポーリング）  [MVP]
```

- **MVP（部員 200名規模）月額運用コスト**: **¥0**（全層 Free tier 50% 以下使用）
- **5部活 1000名規模スケール時**: 月 $0〜20 程度

- **理由**:
  - オーナー要望「無料で行きたい」を満たし、かつ Phase 2 以降の SaaS 化（DEC-009 Q-05）に対応する database-per-tenant 戦略の余地を確保
  - Better Auth の organization plugin が DEC-009 の `organizations + groups` 設計に完全合致
  - R2 は egress 無料で領収証画像配信のコスト爆発リスクをゼロ化
  - Drizzle ORM は Turso 公式推奨 + drizzle-zod でフォーム DX 最高

- **3層認可防衛戦略**（RLS 不在の代替）:
  1. middleware.ts でルーティングガード
  2. Server Action / Route Handler 冒頭で `requireXxxRole()` ヘルパ呼び出し
  3. Drizzle クエリで `scopedXxx()` ヘルパ強制使用（生クエリ禁止 ESLint ルール）
  - **統合テスト**: マルチテナント漏洩 E2E 7本（C1〜C7）で全認可境界を機械的に検証

- **W1 POC（2件、合格条件明文化）**:
  - **POC-1**: Better Auth + organization plugin が招待フロー + RBAC を実現できるか
    - 失敗時フォールバック: Auth.js v5（+3人日）
  - **POC-2**: Cloudflare R2 + presigned URL + CORS が領収証アップロードに使えるか
    - 失敗時フォールバック: Vercel Blob（-0.5人日、ただし Free 1GB 上限注意）

- **影響範囲**:
  - DEC-002 を撤回・置換
  - dev-technical-spec.md（v1）→ archive 扱い、dev-technical-spec-v2.md を正式版に
  - 工数: 38人日 → **41人日**（+3人日、Auth/Storage 自前統合分）+ Designer 6人日（並行）
  - リリース日: 2026-05-01 着手 → **2026-07-03 MVP 完成**（6/26 計画から 1週延期、figma-schedule.md 反映）

---

## DEC-012: Phase 0→1 ゲート v2 判定 = Conditional Go（W1 POC 通過で本格進行）
- **日付**: 2026-04-26
- **決裁者**: CEO（Review 部門 v2 判定を採用）
- **決定内容**: Phase 0 を **完了** とし、Phase 1（実装）を **2026-05-01 月曜から開始**する。条件は W1 POC 2件（Better Auth / R2）の合格のみ。
- **POC 失敗時の対応**:
  - POC-1 失敗 → W1 末に Auth.js v5 フォールバック判断、+3人日工数追加
  - POC-2 失敗 → W1 末に Vercel Blob フォールバック判断、-0.5人日（ただし容量制約注意）
  - 両方失敗してもフォールバックは確立済み、W1 末で必ず本格進行可能
- **追加品質補強（Review 提言の M-01〜M-04）**:
  - M-01: 全テーブル scopedXxx ヘルパ作成義務化（W2 設計レビュー）
  - M-02: マルチテナント漏洩 E2E（C6/C7）追加 = 計 7本
  - M-03: Better Auth フォールバックトリガ条件明文化（POC で 1項目でも赤信号 → 即フォールバック）
  - M-04: R2 public access disable + CORS smoke test を W1 セットアップ時に必須化
- **理由**: 設計品質はレビュー◎判定。実装着手のリスクは W1 POC で early fail / fallback 設計済みのため許容範囲。
- **影響範囲**: Phase 1 着手即可。

---

## DEC-013: オーナーへの最終承認依頼（軽承認3件）
- **日付**: 2026-04-26
- **決裁者**: オーナー（CEO 経由で軽承認依頼）
- **決定内容**: 以下3件はCEO裁量で進行可能だが、オーナー認識を取りたい:
  - **A-01**: プライバシーポリシーの問合せ窓口メール = `ai-lab@improver.jp`（オーナーメモから採用）で公開してよいか
  - **A-02**: Designer 外部委託予算の保険枠（必要時のみ、最大 ¥100,000）を確保してよいか
  - **A-03**: Phase 1 MVP リリース日 = **2026-07-03**（Designer Figma 並行 6人日 反映による 1週延期）を承認するか

- **回答期限**: 2026-04-30 までに回答取得。**未回答の場合は CEO 推奨案で進行**:
  - A-01 → 公開する（推奨）
  - A-02 → 保険枠確保する（推奨、内製で吸収できれば不執行）
  - A-03 → 7月3日リリースで進行（推奨）

---

## DEC-014: オーナー軽承認3件への回答受領 + 早期化方針
- **日付**: 2026-04-26
- **決裁者**: オーナー
- **決定内容**: DEC-013 で上申した A-01〜A-03 へのオーナー回答を以下で確定する。
  - **A-01 プラポリ問合せ窓口メール** = **「別途」**（プラポリ公開時に確定する）
    - 影響: Phase 1 W7 のプラポリ公開タスクで「窓口メール = 別途確定」として placeholder で進行、公開直前にオーナー再確認。
  - **A-02 Designer 外部委託** = **なし**（保険枠 ¥100K も不要、内製で完遂）
    - 影響: Designer 部門が Figma 相当の内製ドキュメント（design-tokens / mockups markdown）で進行。図面は ASCII ワイヤー + Tailwind コンポーネント仕様で代替。
  - **A-03 リリース日** = **可能な限り早期実装を目指す**（7/3 を上限とせず短縮目指す）
    - 影響: 並列化最大化 + スコープ凝縮で最短リリースを追求。Dev 部門に「Maximum velocity モード」発令。
- **理由**: オーナーの「無料・スピード」志向を最優先する判断。
- **影響範囲**:
  - Designer: 内製モード確定、Figma 工数 6人日 → markdown ドキュメント化で大幅圧縮
  - Dev: 早期化目標 → W1 + W2 の前倒し並列、POC 早期判定
  - リリース日: 6月中旬を新目標に置く（最大2週間短縮を狙う）

---

## DEC-015: Phase 1 W1 実装着手 = GO（即時開始）
- **日付**: 2026-04-26
- **決裁者**: CEO（オーナー実装開始指示を受領）
- **決定内容**: PRJ-015 Coatly Phase 1 W1（環境構築 + POC 2件）を**即時着手**する。リリース計画は以下:
  - **W1（即時開始）**: 環境構築 + Better Auth POC + R2 POC + 初回 migration + seed
  - **早期化目標**: W1 完了時に POC 結果を踏まえ、W2〜W3 並列化計画を策定（理想は 7週で MVP 完成）
- **着手作業（Dev 部門への発令）**:
  - `projects/PRJ-015/app/` 配下に Next.js 16 アプリ scaffold
  - Turso + Drizzle ORM + Better Auth + Cloudflare R2 SDK + Resend のセットアップ
  - migration 001（organizations / groups / users / memberships / group_memberships / budgets / expenses / expense_attachments / approval_logs / audit_logs + Better Auth tables）
  - seed（FY2026 = ¥800K = 全体¥300K + 各県¥100K × 5）
  - POC-1（Better Auth 招待 + RBAC）
  - POC-2（R2 presigned URL + CORS）
  - Smoke test（typecheck / lint / build PASS）
  - W1 完了レポート提出
- **並行作業（Designer 部門）**:
  - 内製デザイントークン仕様書（CSS variables + Tailwind config 完成形）
  - 主要 5 画面のモックアップ markdown（ログイン / ダッシュボード / 活動費入力 / 承認 / 全体管理）
  - 「あっと驚き要素」3点の実装仕様（中国地方マップ choropleth / カウントアップ / テニスボール軌跡）
- **理由**: オーナー指示「実装を進めてください」 + 設計・計画は v2 で完備、W1 POC で技術リスク最終確認したのち本格実装へ。
- **影響範囲**: 累計進捗 20% → W1 完了時 30% 想定。

---

## DEC-016: 編集フォームを `expense-form.tsx` に共通化
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `/expenses/new` と `/expenses/[id]/edit` で同一の `<ExpenseForm>` コンポーネントを使用する。`mode: 'create' | 'edit'` の discriminated union props で初期値・ボタンラベル・呼び出す Server Action を切替える。
- **理由**: フィールド・バリデーション・領収書アップロード UI が完全一致するため、片側だけ修正して仕様乖離するリスクを排除する。
- **代替案**: 別コンポーネント 2 個 → ロジック重複 + 修正漏れリスクのため不採用。
- **影響範囲**: `src/components/expense-form.tsx`（新規）、`/expenses/new/page.tsx` リファクタ、`/expenses/[id]/edit/page.tsx` 新設。

---

## DEC-017: 編集権限は「オーナー本人 × draft / rejected のみ」
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `/expenses/[id]/edit` のアクセス条件は `expense.userId === ctx.user.id` かつ `status ∈ {'draft', 'rejected'}` のみ通す。submitted 以降は編集不可で、修正したい場合は「取下げ → draft 化 → 再編集 → 再申請」の動線とする。
- **理由**: 監査ログの一貫性を最優先。submitted/approved 中の編集は履歴を破壊する。
- **代替案**: submitted も編集可 + 編集履歴を audit_logs に記録 → Phase 2 で検討。
- **影響範囲**: `/expenses/[id]/edit/page.tsx` の guard、`updateExpense` action の status バリデーション。

---

## DEC-018: 既存添付ファイルの差替えは Phase 2 へ
- **日付**: 2026-04-26
- **決裁者**: CEO（スコープ管理）
- **決定内容**: 編集ページでは既存の領収書を **read-only 表示**のみとし、削除・差替えは Phase 2 で対応する。新しい領収書を**追加**する操作だけを提供する。
- **理由**: R2 の orphan 削除 + 監査ログ整合性が要設計のため、polish スコープ外に追い出す。
- **代替案**: 編集時にすべて作り直し → 旧領収書が orphan 化するため不採用。
- **影響範囲**: `/expenses/[id]/edit/page.tsx` 既存添付セクション、Phase 2 タスクへ繰越。

---

## DEC-019: 予算編集はモーダル / 「未設定の行は新規作成」UX 統一
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `/admin/budgets` テーブルの各行（組織全体 + 各 group）に「編集 / 作成」ボタンを置き、Radix Dialog で予算額を入力する。`budget` レコードが未作成の行は `setBudget`（UPSERT）、既存の場合は `updateBudget(id, amountJpy)` を呼ぶ。
- **理由**: 5 県 + 全体 = 6 行をテーブル + モーダルでまとめて見渡せる UX が PM-S レベル管理者の体験に合う。
- **代替案**: 別ページ遷移で編集 → クリック数増 + テーブル全景の見通しが落ちるため不採用。
- **影響範囲**: `setBudget` action（新規）、`updateBudget` action 拡張、`budget-editor.tsx` client component。

---

## DEC-020: 既消化額未満の予算額に下げることを禁止
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `setBudget` / `updateBudget` で `amountJpy < usedAmountJpy` の入力をバリデーションエラーで拒否する。UI 側にも「既に消化済み: ¥X」の補足表示を出す。
- **理由**: 予算超過状態を後付けで作ってしまうと、承認済みの履歴が「予算違反」扱いに変わってしまう。整合性のために事前禁止する。
- **代替案**: 警告のみで通す → 予算超過判定が遡及的に崩れるため不採用。
- **影響範囲**: `lib/actions/budget.ts` バリデーション、`budget-editor.tsx` の min バインド。

---

## DEC-021: Radix overlay 系ラッパは必ず `'use client'`
- **日付**: 2026-04-26
- **決裁者**: CEO（レビュー部門指摘を採用）
- **決定内容**: `Dialog` / `DropdownMenu` / `Tooltip` / `Popover` 等の Radix ベース UI ラッパは、サーバーから直接 import されないようファイル先頭で `'use client'` を明示する。Server Component の page.tsx からは 1 階層挟んだ client component（例: `members-client.tsx`, `budget-editor.tsx`）経由で import する。
- **理由**: Radix overlay は内部で `useState` / portal を使うため Server Component から直接 import すると build 時に hydration mismatch / Module は serializable でなくなる。
- **代替案**: page.tsx に `'use client'` を付ける → SQL 直叩きの Server Component が消えるため不採用。
- **影響範囲**: `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx` ほか overlay 系すべて。

---

## DEC-022: メンバー操作は 1 ファイル 3 モードの `members-client.tsx`
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `/admin/members` の client インタラクションを 1 ファイル `members-client.tsx` にまとめ、`mode='invite' | 'member' | 'invitation'` の discriminated props で 3 つの UI（招待モーダル / 三点メニュー / 再送・取消）を出し分ける。
- **理由**: 招待アクションと既存メンバー操作はセマンティクスが連続しており、相互の状態（招待済み → メンバー化）も将来結合する見込みのため、コロケーションが保守性に直結する。
- **代替案**: 3 つの別ファイル → import 散逸 + 共通スタイルの差分が出やすくなるため不採用。
- **影響範囲**: `app/(app)/[organizationSlug]/admin/members/members-client.tsx`。

---

## DEC-023: 招待は Better Auth API ではなく直 INSERT で実装
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: 招待発行は `auth.api.createInvitation()` を呼ばず、`invitations` テーブルへ直接 INSERT して `notifyInvitation()` を別途呼ぶ実装にする。受諾は `/invite/[token]/accept` の Server Action で対応済みの設計を踏襲する。
- **理由**: Better Auth 1.6.x の organization plugin の `createInvitation` は signature が安定せず（型推論が壊れる / orgId の渡し方がバージョン差で変わる）、Phase 1 のスコープでは直 INSERT 方式の方がリスクが小さい。
- **代替案**: Better Auth API を使う → 動作はするが、エラー時のフォールバック制御が困難なため Phase 2 で再評価。
- **影響範囲**: `lib/actions/invite.ts`、`/invite/[token]/page.tsx` の互換性は担保。

---

## DEC-024: 自分自身のロール変更・無効化を禁止
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `updateMemberRole` と `deactivateMember` で `ctx.user.id === data.userId` の場合は `ValidationError` を返す。owner の自己降格 / admin の自己無効化による組織ロックアウトを防ぐ。
- **理由**: 唯一の owner が自分を member に変えると組織が誰も管理できない状態になる。
- **代替案**: owner 専用の「組織を別 owner に譲渡」フロー → Phase 2 で実装。
- **影響範囲**: `lib/actions/invite.ts` の 2 関数。

---

## DEC-025: CSV エクスポートは UTF-8 BOM + CRLF（Excel 互換）
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `/api/export/expenses?fy=YYYY` の出力は先頭に `\uFEFF` BOM、行区切り `\r\n`、囲み文字 `"` で `,` `"` 改行を含むセルをエスケープする。
- **理由**: 経理担当の Excel での開き直しが最頻ユースケース。BOM 無しだと Shift_JIS で開かれて文字化けする。
- **代替案**: BOM 無し UTF-8 → Excel が文字化けするため不採用。
- **影響範囲**: `app/api/export/expenses/route.ts`。

---

## DEC-026: ローディング / エラー / 404 を `[organizationSlug]` 直下に配置
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `loading.tsx` `error.tsx` `not-found.tsx` を `(app)/[organizationSlug]/` 直下に 1 セットだけ置く。子ルート（/expenses, /admin, ...）は親の境界を継承する。
- **理由**: コンテンツのシルエットがほぼ共通（KPI 4 + コンテナ 1）なので Skeleton も共有できる。子ごとの個別 fallback は YAGNI。
- **代替案**: 子ルートごとに loading.tsx を置く → 重複コード増。
- **影響範囲**: `app/(app)/[organizationSlug]/{loading,error,not-found}.tsx`、`app/not-found.tsx`（root）。

---

## DEC-027: 設定ページのテーマ切替は `next-themes` を直接利用
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `/settings` ページの「外観」セクションでは layout の `ThemeToggle` とは別に、`useTheme()` を直接使った 3 択（ライト / ダーク / システム）UI を提供する。テーマは localStorage に保存。
- **理由**: ヘッダの ThemeToggle は 2 値（明/暗）切替向けのコンパクト UI のため、設定画面では「システムに従う」を含む明示的な 3 択が必要。
- **代替案**: `ThemeToggle` を再利用 → 「システム追従」が表現できないため不採用。
- **影響範囲**: `settings-client.tsx` の `ThemeSection`。

---

## DEC-028: パスワード変更は `authClient.changePassword` を client から直接呼ぶ
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: パスワード変更は Server Action を経由せず、`'use client'` の form ハンドラから `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` を直接呼ぶ。
- **理由**: Better Auth client は HttpOnly cookie + CSRF を内部で処理するため、Server Action ラッパは追加価値が薄い。`revokeOtherSessions: true` で他セッションの即時失効も自動で行える。
- **代替案**: Server Action 経由 → cookie の橋渡しコードが冗長になり、Better Auth が将来 API を変えた際の追従が二重になる。
- **影響範囲**: `settings-client.tsx` の `PasswordSection`、退会（deleteAccount）は Phase 2 stub。

---

## DEC-029: `no-restricted-imports`（schema 直 import 禁止）を Phase 1 では warn、Phase 2 で error 化
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を承認）
- **決定内容**: `eslint.config.mjs` の `no-restricted-imports` ルール（`@/lib/db/schema` から `expenses` / `budgets` を直接 import 禁止 → `scopedXxx` ヘルパ経由を強制）を、Phase 1 リリースまでは `warn` レベルで運用し、Phase 2 で `error` に昇格する。
- **理由**:
  - W2-A/W2-B/W3 の並列 dispatch 時に当該ルールが未整備で、`actions/expense.ts` `actions/approval.ts` `actions/budget.ts` `auth/guards.ts` `auth/better-auth.ts` 等で直 import が発生済み（合計 26 箇所）。
  - これを一括で `scopedXxx` 化するには Server Action 内のトランザクション境界も再設計が必要で、Phase 1 リリースに間に合わない。
  - dev-technical-spec-v2.md §3.4 の方針自体は維持したいので、**ルール削除ではなく warn 化**で「将来 error 化する」シグナルを残す。
- **代替案**:
  - error のまま放置 → `pnpm lint` が通らず CI が組めない。却下。
  - ルール削除 → Phase 2 で再導入する強制力を失う。却下。
- **影響範囲**: `eslint.config.mjs` のルール severity のみ。Phase 2 の TODO として `phase1-cleanup-report.md` と本 DEC に明記。
- **コミット予定**: Phase 2 着手時に DEC-029-FOLLOWUP として error 昇格＋ scopedXxx 全面適用を別 dispatch 化。

---

## DEC-030: スモーク E2E は「リダイレクタとしての /」と公開ページのみ検証する
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `tests/e2e/smoke.spec.ts` は DEC-020（root を redirect-only Server Component 化）と整合させ、以下 5 ケースのみを担う:
  1. `/` → 未ログインで `/login` へ redirect
  2. `/login` の主要見出しが描画される
  3. `/privacy` が未ログインで 200
  4. `/terms` が未ログインで 200
  5. 不正 org slug の保護ページは `/login?next=...` へ redirect
- **理由**: 認可漏洩の細部は `authorization.spec.ts` （C1〜C7）で担保しており、smoke は「未ログイン入口導線が壊れていないか」だけを最速で確認する役割に専念させたい。
- **代替案**: smoke にダッシュボード全画面 visual を含める → `dashboard-visual.spec.ts` と責務重複、削除。
- **影響範囲**: `tests/e2e/smoke.spec.ts`（書き換え）。CI の必須ジョブには smoke ではなく authorization を採用（DEC-031）。

---

## DEC-032: メール送信元は `noreply@improver.jp`（メインドメイン直）
- **日付**: 2026-04-26
- **決裁者**: オーナー（即決） / CEO（記録）
- **決定内容**:
  - 送信元: `Coatly <noreply@improver.jp>`
  - Reply-To: `support@improver.jp`
  - Resend 認証ドメイン: `improver.jp` メインドメイン直
  - DMARC は `p=none`（Phase 1）→ `p=quarantine` 段階強化（Phase 2）
- **理由**:
  - サブドメイン `coatly.improver.jp` 案も提示したが、**MVP の招待件数が小さく**（5 県 × 5〜10 名 = 25〜50 通／初日）、メイン業務の reputation 毀損リスクが事実上ない
  - DNS 設定の手数が 1/2（既存 `improver.jp` の zone に追記するだけ、サブドメイン委譲不要）
  - Phase 2 で SaaS 化＋送信量増加のフェーズで、改めてサブドメインまたは独自ドメインへ移行を検討
- **代替案**:
  - サブドメイン分離 → 上記理由で却下（Phase 2 で再検討余地）
  - 独自ドメイン取得 (`coatly.app`) → DEC-009「ドメイン取得不要」と矛盾、却下
- **影響範囲**:
  - `app/.env.example` の `EMAIL_FROM` `EMAIL_REPLY_TO` プレースホルダ
  - `src/lib/email/resend.ts` の from / replyTo を環境変数化（Phase 1 cleanup の追加項目）
  - DNS 設定（`improver.jp` zone に MX / SPF / DKIM / DMARC × 4 レコード）

---

## DEC-033: Coatly は `app/` 配下を root とする独立 GitHub repo として運用
- **日付**: 2026-04-26
- **決裁者**: オーナー（リポジトリ作成 = `https://github.com/hironori-oi/coatly`） / CEO（構成判断・実行）
- **決定内容**:
  - GitHub repo: `hironori-oi/coatly`（既存 `claude-code-company` とは別）
  - リポジトリ root = `projects/PRJ-015/app/` 配下（`src/` `package.json` 等が直下に来る）
  - `claude-code-company` と Coatly repo は **二重管理せず**、Coatly repo 側を Coatly の正本とする
  - `claude-code-company` 側の `projects/PRJ-015/app/` は **継続存在**（CEO/Dev/Review からの参照用ローカルワークツリー）。親 repo の `.gitignore` で `projects/*/app/` 既に除外済みのため、衝突なし
  - CI: `.github/workflows/ci-prj015.yml`（親 repo 内）→ `.github/workflows/ci.yml`（Coatly repo 内）に移植・パス修正（`projects/PRJ-015/app/**` → `**`）
  - Dependabot: 同様に Coatly repo 内に再設置（`directory: "/"`）
  - ドキュメント: `decisions.md` `project-brief.md` `RUNBOOK.md` `reports/` の主要 9 件を `app/docs/` にコピーし、Coatly repo 内で完結する読書経路を確保
- **理由**:
  - Vercel の Root Directory が `/` で済み、Vercel 設定がシンプル
  - Coatly コントリビュータが `claude-code-company` の AI 組織運営構造を見せられずに済む（守秘）
  - dependabot / CI が Coatly のみを対象とできて誤検知ゼロ
- **代替案**:
  - `git subtree push` で `claude-code-company` から `app/` だけプッシュ → 履歴と branch ハンドリングが複雑、後の維持コスト高、却下
  - submodule 化 → コントリビュータ体験が悪化、却下
- **影響範囲**:
  - `app/.github/`（新規作成、ci.yml + dependabot.yml）
  - `app/docs/`（新規作成、主要 9 ドキュメントをコピー）
  - `app/RUNBOOK.md`（projects/PRJ-015/RUNBOOK.md からコピー、Coatly repo 直下からも読めるように）
  - `app/README.md`（リンクを `projects/PRJ-015/...` → `docs/...` に修正）
  - 親 `claude-code-company` の `.github/workflows/ci-prj015.yml` は **削除**（Coatly repo 側で動かすため、二重実行を避ける）
  - 親 `claude-code-company` の `.github/dependabot.yml` の npm セクションも **削除**（github-actions セクションは残す）

---

## DEC-031: CI 必須ジョブは typecheck-build と authorization E2E の 2 段
- **日付**: 2026-04-26
- **決裁者**: CEO（dev 提案を採用）
- **決定内容**: `.github/workflows/ci-prj015.yml` の必須ジョブは以下 2 段構成:
  1. `typecheck-build` — `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm build`（CI 用ダミー env で）
  2. `e2e-authorization` — needs: typecheck-build。Playwright で `tests/e2e/authorization.spec.ts` のみ実行。失敗時は report を artifact 化。
- **理由**:
  - **lint は warning が許容されている（DEC-029）** ため、CI でブロッカ化しない。
  - **smoke / dashboard-visual** は dev サーバ起動に Better Auth + Turso ライブ接続が必要で、CI でのコスト・不安定性が高い。authorization.spec.ts は file-based libsql + seed:e2e で完全に閉じるため CI フレンドリ。
  - typecheck と認可漏洩防止だけは「リリース前に絶対緑」という要件。
- **代替案**:
  - lint も必須化 → DEC-029 と矛盾、却下。
  - 全 E2E を CI 化 → 実行時間 15 分超、コスト過大、却下（手動 run も可能）。
- **影響範囲**: `.github/workflows/ci-prj015.yml`、`.github/dependabot.yml`（npm ＋ github-actions）。

---
