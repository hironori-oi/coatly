/**
 * プライバシーポリシー（Server Component / public route）
 *
 * - proxy.ts §isPublic で `/privacy` は認証不要として通過する
 * - 個人情報保護法準拠の最小項目: 収集する情報 / 利用目的 / 第三者提供 /
 *   開示請求窓口 / 改定履歴
 * - 文書クラス: MVP 版（Phase 2 以降に法務レビューを通して再改訂予定）
 */
import Link from 'next/link';

export const metadata = {
  title: 'プライバシーポリシー',
  description:
    'Coatly のプライバシーポリシー。取得する情報、利用目的、第三者提供、開示請求窓口について記載しています。',
  robots: { index: false, follow: false },
};

const LAST_UPDATED = '2026-04-26';
const SUPPORT_EMAIL = 'support@improver.jp';

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <article className="prose prose-stone max-w-none dark:prose-invert">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            プライバシーポリシー
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            最終更新日: {LAST_UPDATED}
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. はじめに</h2>
          <p className="text-sm leading-7">
            Coatly（以下「本サービス」といいます）は、利用者から取得する個人情報を
            個人情報の保護に関する法律（個人情報保護法）その他の関連法令を遵守して
            適切に取り扱います。本ポリシーは、本サービスにおける個人情報の取り扱い
            方針を定めるものです。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">2. 取得する情報</h2>
          <p className="text-sm leading-7">
            本サービスは、サービス提供のため以下の情報を取得します。
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>氏名、メールアドレス、所属組織・所属グループ等のアカウント情報</li>
            <li>本サービスにご入力いただいた活動費申請の内容、金額、日付、適格請求書番号等</li>
            <li>領収書としてアップロードされた画像または PDF ファイル</li>
            <li>アクセスログ、IP アドレス、ユーザーエージェント、Cookie 等の技術情報</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">3. 利用目的</h2>
          <p className="text-sm leading-7">
            取得した情報は次の目的で利用します。
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>本サービスの提供、本人認証、利用者間の権限管理</li>
            <li>活動費申請の記録・承認・集計および予算管理</li>
            <li>不正利用の検知、セキュリティ確保および監査ログの保存</li>
            <li>本サービスの改善、機能追加に関する内部分析</li>
            <li>重要なお知らせ、規約変更通知等のご連絡</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">4. 第三者提供</h2>
          <p className="text-sm leading-7">
            法令に基づく場合、または利用者ご本人の同意がある場合を除き、取得した
            個人情報を第三者に提供することはありません。なお、本サービスは
            運営に必要な範囲で次のクラウドサービスを利用しており、これらは
            個人情報保護法上の「委託先」に該当します。
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>Vercel Inc.（アプリケーションホスティング）</li>
            <li>Turso（データベース）</li>
            <li>Cloudflare R2（領収書ファイルの保管）</li>
            <li>Resend（メール送信）</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">5. 保管期間と削除</h2>
          <p className="text-sm leading-7">
            領収書画像および活動費申請データは、法人税法の保存義務に準じ最長 7
            年間保管します。利用者がアカウントを退会した場合、特段の法定保存義務
            のないデータは速やかに削除します。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">6. 開示・訂正・削除等のご請求</h2>
          <p className="text-sm leading-7">
            利用者ご本人から、ご自身の個人情報について開示、訂正、利用停止または
            削除のご請求があった場合、本人確認を行ったうえで合理的な期間内に対応
            します。お問い合わせは下記窓口までお願いします。
          </p>
          <p className="text-sm leading-7">
            お問い合わせ窓口:{' '}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">7. Cookie の利用</h2>
          <p className="text-sm leading-7">
            本サービスはログイン状態の維持および CSRF 対策のため Cookie を使用
            します。Cookie の保存設定はブラウザの設定から変更可能ですが、無効化
            すると本サービスを正常にご利用いただけない場合があります。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">8. 本ポリシーの改定</h2>
          <p className="text-sm leading-7">
            本ポリシーは、法令の改正またはサービス内容の変更に応じて改定すること
            があります。重要な変更がある場合は、本サービス内またはメール等で事前
            にお知らせします。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">9. 改定履歴</h2>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>{LAST_UPDATED}: 初版公開（Phase 1 MVP リリース時）</li>
          </ul>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-sm">
          <Link href="/" className="text-muted-foreground underline">
            トップに戻る
          </Link>
          <span className="mx-3 text-muted-foreground">/</span>
          <Link href="/terms" className="text-muted-foreground underline">
            利用規約
          </Link>
        </footer>
      </article>
    </main>
  );
}
