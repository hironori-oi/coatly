# Coatly RUNBOOK

PRJ-015 Coatly（テニス部 予算管理 Web アプリ）の運用・障害対応手順書。

- **最終更新**: 2026-04-26（Phase 1 cleanup 時に新規作成）
- **対象 phase**: Phase 1 MVP（公開前 / 公開直後を想定）
- **対象範囲**: Vercel + Turso + Cloudflare R2 + Resend スタック

---

## 1. 概要

### 想定読者

- オーナー（経営判断 / 障害宣言）
- CEO 部門 + 運用担当（一次対応）
- 開発（PRJ-015 Dev 部門 / 修正・恒久対応）

### いつ参照するか

- `/api/health` が 5 分以上連続で `503` を返す
- 利用者から「ログインできない」「ダッシュボードが真っ白」等の報告を受けた
- Vercel デプロイメントが失敗する / 無限デプロイ
- Turso 利用量が Free tier 上限の 80% を超えた通知が来た
- Cloudflare R2 経由で領収書がアップロードできない
- Resend からメール送信エラー率が急上昇した

---

## 2. 緊急連絡先

| 役割 | 連絡先 | 備考 |
|---|---|---|
| オーナー（最終判断） | `ai-lab@improver.jp` | 障害宣言・公表判断 |
| CEO 部門 | （内部チャネル） | 一次トリアージ |
| サポート窓口（公開） | `support@coatly.example.jp` | プラポリ / 規約に記載 |
| Vercel | https://vercel-status.com | プラットフォーム障害確認 |
| Turso | https://status.turso.tech | DB 障害確認 |
| Cloudflare | https://www.cloudflarestatus.com | R2 障害確認 |
| Resend | https://status.resend.com | メール障害確認 |

---

## 3. 監視

### 3.1 ヘルスチェック

- **エンドポイント**: `https://<本番ドメイン>/api/health`
- **正常レスポンス**: `200` + `{ ok: true, db: 'up', version: <sha7> }`
- **異常レスポンス**: `503` + `{ ok: false, db: 'down', error }`
- **実装**: `src/app/api/health/route.ts`（`SELECT 1` を `db.run` で実行）

### 3.2 Vercel ダッシュボード

- Project: `coatly`
- 確認ポイント:
  - **Deployments**: 最新が `Ready` か / Build error の有無
  - **Logs**: Production の Function logs に `[invite] notifyInvitation failed` 等のエラーが頻出していないか
  - **Analytics**: P95 / P99 レスポンスタイム、エラーレート（4xx / 5xx）
  - **Usage**: Function invocations, Bandwidth が Free tier 内（100GB / 月）に収まっているか

### 3.3 Turso ダッシュボード

- DB: `coatly`（リージョン: ap-northeast-1）
- 確認ポイント:
  - **Reads / Writes** が Free tier（1B reads / 25M writes per month）の閾値に近づいていないか
  - **DB size** が 9GB に近づいていないか（領収書は R2 なのでメタデータのみ。通常 100MB 未満で推移）

### 3.4 Cloudflare R2

- Bucket: `coatly-receipts`
- 確認ポイント:
  - **Storage**: 10GB Free に対して使用量
  - **Class A operations**（PUT 等）/ **Class B operations**（GET 等）の上限

### 3.5 Resend

- ダッシュボード:
  - **Sent / Delivered / Bounced / Complained**
  - 月間 3,000 通の Free 枠超過アラート

---

## 4. インシデント対応フロー

```
  兆候検知
     ↓
  P1: 影響範囲の確認  ──→ 利用者 0 件 / 一部 / 全員
     ↓
  P2: 一次トリアージ  ──→ /api/health, Vercel / Turso / R2 status を並行確認
     ↓
  P3: ロールバック判断 ──→ 直近デプロイが原因なら即 promote
     ↓                    インフラ障害なら待機 + 縮退 / お知らせ表示
  P4: 恒久対応
     ↓
  P5: ポストモーテム  （§10 テンプレ参照）
```

### 4.1 一次トリアージ チェックリスト（5 分以内）

- [ ] `curl -i https://<本番>/api/health` のステータスを取得
- [ ] Vercel の Production Deployments を確認、最新が `Ready` か
- [ ] Vercel Status / Turso Status / Cloudflare Status を確認
- [ ] Vercel Function logs を `Error` フィルタで直近 30 分を確認
- [ ] サポート問い合わせ（`support@coatly.example.jp`）の流量を確認

### 4.2 影響度（Severity）の暫定基準

| Sev | 兆候 | 例 |
|---|---|---|
| Sev1 | 全利用者がログイン / 主要機能を利用不可 | DB ダウン、Vercel 全 deployment 502 |
| Sev2 | 一部機能が利用不可 | 領収書アップロードのみ失敗 / 招待メールが届かない |
| Sev3 | 軽微 / 回避策あり | エラーメッセージ表示の崩れ、KPI count-up が動かない |

---

## 5. ロールバック手順

### 5.1 アプリケーション（Vercel）

1. Vercel ダッシュボード → Deployments タブ
2. 直前の `Ready` ステータスの deployment を選択
3. 右上「⋯」メニュー → **Promote to Production**
4. ドメインが旧 deployment に向いたことを `curl https://<本番>/api/health` で確認
5. 暫定対応として完了。恒久対応は次デプロイで本格修正。

### 5.2 データベース（Turso / Drizzle）

> Drizzle Kit には自動 down マイグレーションが**ない**ため、手動 SQL で戻す。

破壊的変更（`DROP COLUMN` / `DROP TABLE` / `RENAME`）を含む migration は以下を**事前に**準備:

1. PR 段階で down SQL（手書き）を `projects/PRJ-015/app/drizzle/rollback/<n>_down.sql` に置く
2. 本番適用前に Turso の `turso db dump coatly > backups/<timestamp>.sql` でバックアップ取得
3. ロールバック時は `turso db shell coatly < drizzle/rollback/<n>_down.sql`
4. アプリの deployment は §5.1 で旧版に戻す（schema と app version の整合）

非破壊的変更（`ADD COLUMN NULLABLE` 等）はアプリ側ロールバックのみで OK。

### 5.3 Better Auth セッション

セッション cookie 仕様変更に伴うログアウト一斉対応が必要な場合:

```sql
DELETE FROM auth_sessions WHERE expires_at < unixepoch();
-- もしくは全 invalidation
DELETE FROM auth_sessions;
```

---

## 6. Turso 障害時のフォールバック

### 6.1 兆候

- `/api/health` が `db: 'down'` を返す
- Vercel logs に `LIBSQL_INTERNAL_ERROR` / `connect ETIMEDOUT` 多発

### 6.2 対応（MVP 期）

1. Turso Status を確認（リージョン障害か全体障害か）
2. **MVP では「サービス停止 + お知らせ表示」を選択**
   - 暫定的に Vercel の Environment Variable に `MAINTENANCE_MODE=1` を設定 → 全ページにメンテ画面を表示する middleware を入れる方針（Phase 2 で実装予定。MVP では `/api/health` を監視している外部に対して 503 を返し続ける現状動作を許容）
   - 組織管理者には `support@coatly.example.jp` 経由で「Coatly 一時停止のお知らせ」をメール（手動）

### 6.3 リージョン切替（Phase 2 候補）

Turso は libSQL の **embedded replicas** をサポート。リージョン障害時は別リージョンの replica へフェイルオーバー可能。

- 公式 doc: https://docs.turso.tech/features/embedded-replicas
- 実装は Phase 2 後半で検討（コスト vs 価値の見極め）

### 6.4 読み取り専用モード（Phase 2 候補）

- feature flag `READ_ONLY_MODE` を実装し、Server Actions で `if (process.env.READ_ONLY_MODE) throw 503` を入れる
- Phase 1 MVP ではスコープ外（Phase 2 で検討、§9 早期 P2 課題に追加）

---

## 7. R2 障害時のフォールバック

### 7.1 兆候

- 領収書添付が失敗する（Cloudflare R2 障害）
- `/api/upload-url` が 5xx を返す

### 7.2 対応

1. Cloudflare Status を確認
2. 短期障害なら待機
3. 長期化（>30 分）の場合、**領収書添付を一時無効化**:
   - 環境変数 `RECEIPT_UPLOAD_DISABLED=1` を Vercel に追加
   - `expense-form.tsx` で当該フラグ確認時は dropzone を非表示 + 「領収書添付は現在ご利用いただけません」のバナー
   - ※ Phase 1 MVP には未実装。緊急時は `app/(app)/[organizationSlug]/expenses/new/page.tsx` の `<ReceiptDropzone>` を一時的にコメントアウトしてホットフィックス deploy する
4. 申請自体は引き続き受付可能（`hasReceipt = false` で submit 可能、後追いで添付を依頼）

### 7.3 R2 復旧後

- 障害期間に申請された expense のうち `hasReceipt=false` のものを抽出 → 該当ユーザーに「領収書添付のお願い」メールを `notifyInvitation` 同様の経路で送信（手動 SQL でリスト抽出）

---

## 8. Resend 障害時のフォールバック

### 8.1 兆候

- 招待メール / 申請通知が届かないという報告
- Vercel logs に `[invite] notifyInvitation failed` / `[magic-link] notifyMagicLink failed` 多発

### 8.2 設計上の挙動

- `src/lib/auth/better-auth.ts` の `sendInvitationEmail` は **try/catch で握り潰し**、招待自体は成功させる
- すなわち「メール失敗 ≠ 業務停止」になる設計
- ただし招待 link は `/invite/{invitation.id}` の URL なので、管理者が直接そのリンクを共有すれば運用継続可能

### 8.3 対応

1. Resend ダッシュボードで bounce / complaint 率を確認（独自ドメイン認証が外れていないか）
2. 短期障害なら待機
3. 招待が届かない問い合わせには **管理者の `/admin/members` ページから招待を再送 + 招待 URL を直接共有**を案内
4. Resend 復旧後、失敗キューが必要な規模なら Phase 2 で `notifyQueue` テーブルを追加して再送実装

### 8.4 ログによる事後再送（MVP 暫定）

- Vercel logs を Resend で grep し、失敗した invite の `email` / `inviteUrl` を抽出
- 管理者画面の「招待再送」ボタン（`members-client.tsx` 実装済み）から該当行を選んで再送

---

## 9. パフォーマンス劣化時の調査

### 9.1 切り分け順序

1. `/api/health` の応答時間（`time curl https://.../api/health`）を計測
   - 200ms 以下: アプリは健全 → Vercel エッジ / DNS / クライアント側問題
   - 200ms-2s: DB クエリ遅延 → Turso latency 確認
   - 2s 以上: Vercel function cold start or DB タイムアウト
2. Vercel Analytics で P95 / P99 を確認、急上昇しているルートを特定
3. Vercel logs で当該ルートの `Duration` を確認
4. Turso ダッシュボードの **Query latency** を確認

### 9.2 よくある原因と対応

| 原因 | 対応 |
|---|---|
| Server Component で N+1 クエリ | drizzle の `with: { ... }` で eager load、または join に書き直す |
| Turso のリージョン遅延 | embedded replicas を Phase 2 で検討 |
| Better Auth `getSession` の DB 問い合わせ | `cookieCache: { enabled: true, maxAge: 5*60 }` 設定済み（5 分キャッシュ） |
| 大量の expense 一覧 SSR | pagination の上限を再確認（一覧系は `limit(50)` を必ず付ける） |

---

## 10. ポストモーテム テンプレート

```markdown
# Postmortem: <インシデントタイトル>

- **発生日時**: YYYY-MM-DD HH:MM JST
- **検知日時**: YYYY-MM-DD HH:MM JST
- **収束日時**: YYYY-MM-DD HH:MM JST
- **Severity**: Sev1 / Sev2 / Sev3
- **記載者**: <名前 / ロール>

## タイムライン

| 時刻 (JST) | 出来事 |
|---|---|
| HH:MM | 兆候検知（誰が / どこで） |
| HH:MM | 一次トリアージ実施 |
| HH:MM | ロールバック実施 |
| HH:MM | サービス復旧確認 |
| HH:MM | 利用者へ復旧連絡 |

## 影響範囲

- **影響を受けた利用者**: 全員 / 一部（n 名 / 何 % / どの組織）
- **影響を受けた機能**: ログイン / 申請 / 承認 / 領収書アップロード / その他
- **データ損失**: あり / なし（ありの場合は詳細）
- **問い合わせ件数**: n 件

## 根本原因 (Root Cause)

<5 Whys を追って末端の原因を 1 段落で>

## トリガー

<何をきっかけに表面化したか>

## 検知

<どう気づいたか / 監視で見つかったか / 通報で見つかったか>

## 対応

<取った行動の要約>

## 何が機能したか

- <うまく動いた監視・手順・ロールバック>

## 何が機能しなかったか

- <うまくいかなかった点>

## 再発防止アクション

| AI No | アクション | 担当 | 期限 |
|---|---|---|---|
| AI-1 | <例: 監視追加> | <部門> | YYYY-MM-DD |
| AI-2 | <例: RUNBOOK 更新> | Dev | YYYY-MM-DD |

## 補遺

<参考リンク / Vercel deployment ID / 関連 PR>
```

---

## 11. 参照ドキュメント

- `projects/PRJ-015/app/README.md` — セットアップ / スクリプト
- `projects/PRJ-015/decisions.md` — DEC-001〜（特に DEC-010 / DEC-011 / DEC-018 / DEC-020）
- `projects/PRJ-015/reports/review-phase1-quality-gate.md` — Phase 1 品質ゲート結果
- `projects/PRJ-015/reports/dev-vercel-deploy-checklist.md` — デプロイ前チェック
- `projects/PRJ-015/reports/security-baseline.md` — セキュリティ baseline
- `.github/workflows/ci-prj015.yml` — CI 設定
