# Coatly RUNBOOK

PRJ-015 Coatly（テニス部 予算管理 Web アプリ）の運用・障害対応 playbook。

- **最終更新**: 2026-04-26（W3-A 仕上げで全面更新）
- **対象 Phase**: Phase 1 MVP（5/12 リリース直後を想定）
- **スタック**: Vercel + Turso (libSQL) + Cloudflare R2 + Resend + Sentry + Better Auth

---

## 1. 概要

### 想定読者

- オーナー（経営判断 / 障害宣言）
- CEO 部門 + 運用担当（一次対応）
- 開発（PRJ-015 Dev 部門 / 修正・恒久対応）

### いつ参照するか

- `/api/health` が 5 分以上連続で `503` を返す
- 利用者から「ログインできない」「ダッシュボードが真っ白」等の報告
- Vercel デプロイメントが失敗 / 無限デプロイ
- Turso 利用量が Free tier 上限の 80% を超えた通知が来た
- Cloudflare R2 経由で領収書がアップロードできない
- Resend からメール送信エラー率が急上昇
- Sentry で error rate が baseline の 3 倍以上に増加

---

## 2. 緊急連絡先

| 役割 | 連絡先 | 備考 |
|---|---|---|
| オーナー（最終判断） | `support@improver.jp` | 障害宣言 / 公表判断（**オーナーのみ**）|
| CEO 部門 | （内部チャネル） | 一次トリアージ |
| Vercel Status | https://vercel-status.com | プラットフォーム障害確認 |
| Turso Status | https://status.turso.tech | DB 障害確認 |
| Cloudflare Status | https://www.cloudflarestatus.com | R2 障害確認 |
| Resend Status | https://status.resend.com | メール障害確認 |
| Sentry Status | https://status.sentry.io | 観測スタック障害確認 |

---

## 3. 監視

### 3.1 ヘルスチェック

- **URL**: `https://coatly-mu.vercel.app/api/health`
- **正常**: `200 + { ok: true, db: 'up', version: <sha7> }`
- **異常**: `503 + { ok: false, db: 'down', error }`
- **実装**: `src/app/api/health/route.ts`（`SELECT 1` を `db.run` で実行）

### 3.2 Vercel ダッシュボード

- Project: `coatly`
- 確認:
  - **Deployments**: 最新が `Ready`、Build error の有無
  - **Function logs**: `[invite] notifyInvitation failed` 等のエラーが頻出していないか
  - **Analytics**: P95 / P99 / エラーレート（4xx / 5xx）
  - **Usage**: Function invocations / Bandwidth が Free tier 内（100GB/月）

### 3.3 Sentry

- Project: `coatly` (org: `improver-jp`)
- 確認:
  - **Issues**: error rate / unique error 数
  - **Performance**: transaction p95 / database span / N+1
  - **Releases**: sourcemap が upload されているか

### 3.4 Turso ダッシュボード

- DB: `coatly`（リージョン: ap-northeast-1）
- 確認:
  - **Reads / Writes**: Free 1B reads / 25M writes per month の閾値
  - **DB size**: 9GB 上限。領収書は R2 なのでメタデータのみ（通常 100MB 未満）

### 3.5 Cloudflare R2

- Bucket: `coatly-receipts`
- 確認:
  - **Storage**: 10GB Free
  - **Class A operations**（PUT 等）/ **Class B operations**（GET 等）の上限

### 3.6 Resend

- 確認:
  - **Sent / Delivered / Bounced / Complained**
  - 月間 3,000 通の Free 枠超過アラート
  - DNS 認証（SPF / DKIM / DMARC）が外れていないか

---

## 4. 障害シナリオ別 playbook

### 4.1 DB 接続障害（Turso ダウン）

**兆候**: `/api/health` が `db: 'down'`、Vercel logs に `LIBSQL_INTERNAL_ERROR` / `connect ETIMEDOUT` 多発。

**対応**:
1. Turso Status を確認 → リージョン障害か全体障害か切り分け
2. 短期（< 30 分）なら待機。利用者には Sentry / log で観測継続
3. 長期化したら **MAINTENANCE_MODE=1** を Vercel env vars に追加（Phase 2 実装予定 / MVP は手動でメンテ画面 deploy）
4. 復旧後: `curl https://coatly-mu.vercel.app/api/health` で 200 確認

**libsql client retry 設定**: `src/lib/db/client.ts` で `intMode: 'number'` のみ設定。retry は libsql client 標準の TCP 再接続に依存。Phase 2 で `p-retry` 追加検討（§9 早期 P2 課題）。

### 4.2 Resend メール不達

**兆候**: 招待メール / 申請通知が届かない、Vercel logs に `[invite] notifyInvitation failed` / `[magic-link] notifyMagicLink failed` 多発。

**対応**:
1. Resend ダッシュボードで bounce / complaint 率を確認
2. `improver.jp` の DNS（SPF / DKIM / DMARC）が外れていないか `dig TXT improver.jp` で確認
3. **API key revoke 時の挙動**: `sendInvitationEmail` は try/catch で握り潰す設計（`src/lib/auth/better-auth.ts`）→ 招待自体は成功する。管理者画面の `/admin/members` から招待 URL を直接共有可能
4. 短期障害なら待機、長期化なら新 API key を発行 + Vercel env vars 更新 + 再デプロイ
5. 失敗キューが必要な規模なら Phase 2 で `notifyQueue` テーブル追加

**DNS 確認手順**:
```bash
dig TXT improver.jp +short        # SPF
dig TXT default._domainkey.improver.jp +short  # DKIM
dig TXT _dmarc.improver.jp +short # DMARC
```

### 4.3 R2 アップロード失敗

**兆候**: 領収書添付が失敗、`/api/upload-url` が 5xx を返す。

**対応**:
1. Cloudflare Status / R2 ダッシュボードを確認
2. **presigned URL の有効期限**: 既定 5 分（`src/lib/r2/signed-url.ts`）。client が時計ズレしているケースもあり、5 分以内に PUT 完了しているかブラウザ DevTools の Network で確認
3. **CORS 設定確認**: R2 bucket → CORS Policy で `AllowedOrigins` に本番 + localhost が含まれていること、`AllowedMethods: ["GET", "PUT"]` であることを確認
4. 長期障害（>30 分）の場合、`RECEIPT_UPLOAD_DISABLED=1` を Vercel env に追加し dropzone を非表示化（MVP は緊急 deploy で対応、Phase 2 で正式 feature flag 化）
5. 復旧後、障害期間に申請された expense の `hasReceipt=false` を抽出 → 該当ユーザーに「領収書添付のお願い」メールを手動送信

### 4.4 認証エラー多発

**兆候**: 「ログインできない」報告、Sentry に `unauthorized` / `session expired` の急増。

**対応**:
1. `auth_sessions` テーブルの中身を Turso shell で確認:
   ```sql
   SELECT COUNT(*) FROM auth_sessions WHERE expires_at > unixepoch();
   ```
2. Better Auth の `cookieCache` を **無効化** する手順（緊急時）:
   - `src/lib/auth/better-auth.ts` の `session: { cookieCache: { enabled: true, maxAge: 5*60 } }` を `enabled: false` に変更し再 deploy
   - これにより毎リクエストで DB を引きにいくため、stale cookie の問題が消える
3. **session 一斉 invalidation** が必要な場合:
   ```sql
   DELETE FROM auth_sessions WHERE expires_at < unixepoch();
   -- もしくは全 invalidation
   DELETE FROM auth_sessions;
   ```
4. `BETTER_AUTH_SECRET` の rotate が必要な場合は事前に全ユーザに告知（rotate と同時に全 session が失効する）

### 4.5 パフォーマンス劣化

**兆候**: ダッシュボードが遅い、Vercel Analytics で P95 が普段の 3 倍超。

**切り分け順序**:
1. `/api/health` の応答時間（`time curl https://.../api/health`）
   - 200ms 以下: アプリ健全 → CDN / DNS / クライアント側
   - 200ms-2s: DB 遅延 → Turso latency 確認
   - 2s 以上: cold start or DB タイムアウト
2. **Vercel Analytics** で P95 / P99 が急上昇しているルートを特定
3. **Sentry transaction** で当該ルートの spans を確認（DB span が長い → query 問題、cold start → ISR/PPR 検討）
4. **Turso DB metrics** の Query latency を確認

**よくある原因**:

| 原因 | 対応 |
|---|---|
| Server Component で N+1 クエリ | drizzle の `with: { ... }` で eager load、または join に書き直す |
| Turso のリージョン遅延 | embedded replicas を Phase 2 で検討 |
| Better Auth `getSession` の DB 問い合わせ | `cookieCache: { enabled: true, maxAge: 5*60 }` 設定済み |
| 大量の expense 一覧 SSR | `limit(50)` を一覧系に必ず付ける |
| Lighthouse CI の LCP 劣化 | hero 画像の `priority` / font preload 確認 |

---

## 5. 緊急ロールバック手順

### 5.1 アプリケーション（Vercel）

1. Vercel ダッシュボード → **Deployments** タブ
2. 直前の `Ready` ステータスの deployment を選択
3. 右上「⋯」→ **Promote to Production**
4. `curl https://coatly-mu.vercel.app/api/health` で 200 を確認

### 5.2 データベース（Turso / Drizzle）

> **重要**: Drizzle Kit には自動 down マイグレーションが**ない**（forward-only）。破壊的変更を含む migration の rollback は手動 SQL が必須。

破壊的変更（`DROP COLUMN` / `DROP TABLE` / `RENAME`）を含む PR は以下を**事前に**準備:

1. PR 段階で down SQL を `drizzle/rollback/<n>_down.sql` に置く
2. 本番適用前に `turso db dump coatly > backups/<timestamp>.sql` でバックアップ
3. ロールバック時は `turso db shell coatly < drizzle/rollback/<n>_down.sql`
4. アプリ側を §5.1 で旧版に promote（schema と app version の整合）

非破壊的変更（`ADD COLUMN NULLABLE` 等）はアプリ側 promote のみで OK。

### 5.3 Better Auth セッション

cookie 仕様変更や緊急セキュリティ対応:
```sql
-- 期限切れのみ清掃
DELETE FROM auth_sessions WHERE expires_at < unixepoch();
-- 全 invalidation（強制ログアウト）
DELETE FROM auth_sessions;
```

---

## 6. インシデントトリアージ チェックリスト（5 分以内）

- [ ] `curl -i https://coatly-mu.vercel.app/api/health` のステータス取得
- [ ] Vercel Production Deployments の最新が `Ready` か
- [ ] Vercel Status / Turso Status / Cloudflare Status / Resend Status / Sentry Status を並行確認
- [ ] Vercel Function logs を `Error` フィルタで直近 30 分確認
- [ ] Sentry の Issues タブで「Last seen < 30m」を確認
- [ ] サポート問い合わせ（`support@improver.jp`）の流量を確認

### Severity 暫定基準

| Sev | 兆候 | 例 |
|---|---|---|
| Sev1 | 全利用者がログイン / 主要機能を利用不可 | DB ダウン、Vercel 全 deployment 502 |
| Sev2 | 一部機能のみ利用不可 | 領収書アップロードのみ失敗 / 招待メールが届かない |
| Sev3 | 軽微 / 回避策あり | エラーメッセージ表示の崩れ、KPI count-up が動かない |

---

## 7. ポストモーテム テンプレート

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
| HH:MM | 兆候検知 |
| HH:MM | 一次トリアージ実施 |
| HH:MM | ロールバック実施 |
| HH:MM | サービス復旧確認 |
| HH:MM | 利用者へ復旧連絡 |

## 影響範囲

- **影響を受けた利用者**: 全員 / 一部（n 名 / どの組織）
- **影響を受けた機能**: ログイン / 申請 / 承認 / 領収書 / その他
- **データ損失**: あり / なし
- **問い合わせ件数**: n 件

## 根本原因（5 Whys）

<5 Whys を末端まで追い、1 段落で記述>

## トリガー / 検知 / 対応

<取った行動と検知経路の要約>

## 何が機能したか / しなかったか

- うまく動いた監視・手順・ロールバック
- うまくいかなかった点

## 再発防止アクション

| AI No | アクション | 担当 | 期限 |
|---|---|---|---|
| AI-1 | 監視追加 | <部門> | YYYY-MM-DD |
| AI-2 | RUNBOOK 更新 | Dev | YYYY-MM-DD |

## 補遺

参考リンク / Vercel deployment ID / 関連 PR / Sentry issue link
```

---

## 8. 参照ドキュメント

- `README.md` — セットアップ / スクリプト
- `DEPLOYMENT.md` — 本番デプロイ手順
- `ARCHITECTURE.md` — 技術アーキテクチャ
- `docs/decisions.md` — 意思決定ログ（特に DEC-010 / DEC-011 / DEC-018 / DEC-020 / DEC-038〜DEC-045）
- `docs/reports/security-baseline.md` — セキュリティ baseline
- `docs/reports/dev-technical-spec-v2.md` — 正式技術仕様 v2
- `.github/workflows/ci.yml` — CI 設定
- `.github/workflows/lighthouse-ci.yml` — Lighthouse CI
- `.github/workflows/observatory.yml` — Mozilla Observatory 週次スキャン
