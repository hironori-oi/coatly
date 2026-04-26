/**
 * Magic Link メール（passwordless ログイン）
 *
 * dev-technical-spec-v2.md §3.4 / Better Auth magicLink plugin より:
 * - 5 分有効
 * - リンクは 1 度きり
 */
import { Section, Text } from '@react-email/components';
import { CoatlyEmailLayout, CtaButton, EMAIL_TOKENS } from './_layout';

export type MagicLinkEmailProps = {
  recipientEmail: string;
  magicLinkUrl: string;
};

export default function MagicLinkEmail({
  recipientEmail,
  magicLinkUrl,
}: MagicLinkEmailProps) {
  const preview = 'Coatly へのログインリンク（5 分有効）';

  return (
    <CoatlyEmailLayout preview={preview}>
      <Text
        style={{
          margin: '0 0 8px 0',
          fontSize: '20px',
          fontWeight: 600,
          color: EMAIL_TOKENS.INK,
        }}
      >
        Coatly へのログイン
      </Text>
      <Text
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: EMAIL_TOKENS.INK,
          lineHeight: '1.7',
        }}
      >
        {recipientEmail} 宛にログインリンクが発行されました。
        下のボタンを押すとブラウザが開き、自動的にサインインします。
      </Text>

      <CtaButton href={magicLinkUrl} label="Coatly にログイン" />

      <Section
        style={{
          padding: '12px 16px',
          backgroundColor: '#F4F2EC',
          borderRadius: '8px',
          margin: '8px 0 16px 0',
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: '12px',
            color: EMAIL_TOKENS.MUTED,
            lineHeight: '1.6',
          }}
        >
          リンクが開けないときは、以下の URL をブラウザに貼り付けてください。
        </Text>
        <Text
          style={{
            margin: '8px 0 0 0',
            fontSize: '12px',
            wordBreak: 'break-all',
            color: EMAIL_TOKENS.INK,
          }}
        >
          {magicLinkUrl}
        </Text>
      </Section>

      <Text
        style={{
          margin: 0,
          fontSize: '12px',
          color: EMAIL_TOKENS.MUTED,
          lineHeight: '1.6',
        }}
      >
        このリンクの有効期限は <strong>5 分間</strong>、利用は 1 回限りです。
      </Text>
    </CoatlyEmailLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  recipientEmail: 'user@example.com',
  magicLinkUrl:
    'http://localhost:3000/api/auth/magic-link/verify?token=abcdef123456',
} satisfies MagicLinkEmailProps;
