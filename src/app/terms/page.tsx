/**
 * 利用規約（Server Component / public route）
 *
 * - proxy.ts §isPublic で `/terms` は認証不要として通過する
 * - SaaS の最低限項目: 適用範囲 / アカウント / 禁止事項 / 免責 / 準拠法・管轄
 * - 文書クラス: MVP 版（Phase 2 以降に法務レビューを通して再改訂予定）
 */
import Link from 'next/link';

export const metadata = {
  title: '利用規約',
  description:
    'Coatly 利用規約。本サービスの提供条件、利用者の遵守事項、免責事項について記載しています。',
  robots: { index: false, follow: false },
};

const LAST_UPDATED = '2026-04-26';
const SUPPORT_EMAIL = 'support@improver.jp';

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <article className="prose prose-stone max-w-none dark:prose-invert">
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">利用規約</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            最終更新日: {LAST_UPDATED}
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">第 1 条（適用範囲）</h2>
          <p className="text-sm leading-7">
            本規約は、Coatly（以下「本サービス」といいます）の提供条件および本
            サービスの利用に関する権利義務関係を定めるものです。利用者は本規約に
            同意したうえで本サービスを利用するものとします。本サービスの運営者
            （以下「運営者」といいます）が本サービス上に掲載する個別のガイド
            ライン等は、本規約の一部を構成します。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 2 条（アカウント）</h2>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>
              本サービスは、運営者または運営者の権限を有する組織管理者が発行する
              招待を通じてのみ利用可能です。
            </li>
            <li>
              利用者は、登録情報（氏名、メールアドレス等）を正確かつ最新の状態に
              保つものとします。
            </li>
            <li>
              利用者は、自己の認証情報（パスワード等）を第三者に開示せず、自己の
              責任で管理するものとします。
            </li>
            <li>
              アカウントの不正利用が発生した場合、運営者は当該アカウントの停止
              その他必要な措置を講じることがあります。
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 3 条（禁止事項）</h2>
          <p className="text-sm leading-7">
            利用者は本サービスの利用にあたり、次の行為を行ってはなりません。
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>法令、公序良俗または本規約に違反する行為</li>
            <li>虚偽または不正確な情報を入力する行為</li>
            <li>他の利用者または第三者の権利を侵害する行為</li>
            <li>
              本サービスの運営を妨害する行為、または運営者のサーバ・ネットワーク
              に過度な負荷を与える行為
            </li>
            <li>本サービスのリバースエンジニアリング、または不正な方法でのアクセス</li>
            <li>権限のない範囲でのデータの閲覧、改ざんまたは取得</li>
            <li>本サービスを通じた営利目的の勧誘、スパム、迷惑行為</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 4 条（コンテンツの取り扱い）</h2>
          <p className="text-sm leading-7">
            利用者が本サービス上に登録した活動費申請データおよび領収書画像等の
            コンテンツに関する権利は、当該利用者または所属組織に帰属します。
            運営者は、本サービスの提供および改善のために必要な範囲で当該
            コンテンツを利用できるものとします。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 5 条（サービスの変更・中断）</h2>
          <p className="text-sm leading-7">
            運営者は、利用者への事前通知のうえ本サービスの内容を変更し、または
            本サービスを中止することがあります。緊急のメンテナンス、不可抗力
            その他やむを得ない場合は、事前通知を行わない場合があります。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 6 条（免責）</h2>
          <ul className="list-disc space-y-1 pl-6 text-sm leading-7">
            <li>
              運営者は、本サービスが利用者の特定の目的に適合すること、期待する
              機能・正確性・有用性を有することを保証しません。
            </li>
            <li>
              運営者は、本サービスの利用に関連して利用者に生じた損害について、
              運営者の故意または重大な過失による場合を除き、責任を負いません。
            </li>
            <li>
              運営者は、本サービスにおける Cloudflare R2、Vercel、Turso 等の
              第三者サービスの障害に起因する損害について責任を負いません。
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 7 条（規約の変更）</h2>
          <p className="text-sm leading-7">
            運営者は、必要に応じて本規約を変更することがあります。変更後の規約
            は、本サービス上に掲示した時点で効力を生じます。利用者が変更後も本
            サービスを継続して利用した場合、変更後の規約に同意したものとみなし
            ます。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 8 条（準拠法および管轄裁判所）</h2>
          <p className="text-sm leading-7">
            本規約の解釈および本サービスに関する一切の紛争については、日本法を
            準拠法とし、運営者の本店所在地を管轄する地方裁判所を第一審の専属的
            合意管轄裁判所とします。
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">第 9 条（お問い合わせ窓口）</h2>
          <p className="text-sm leading-7">
            本規約または本サービスに関するお問い合わせは下記窓口までお願いします。
          </p>
          <p className="text-sm leading-7">
            お問い合わせ窓口:{' '}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-sm">
          <Link href="/" className="text-muted-foreground underline">
            トップに戻る
          </Link>
          <span className="mx-3 text-muted-foreground">/</span>
          <Link href="/privacy" className="text-muted-foreground underline">
            プライバシーポリシー
          </Link>
        </footer>
      </article>
    </main>
  );
}
