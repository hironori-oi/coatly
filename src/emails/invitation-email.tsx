/**
 * 招待メール（react-email）
 *
 * dev-technical-spec-v2.md §3.4 より:
 * - 宛先名 / 組織名 / 招待者名 / 招待リンク / 7 日有効期限
 * - Court Green CTA ボタン
 */
import { Section, Text } from '@react-email/components';
import { CoatlyEmailLayout, CtaButton, EMAIL_TOKENS } from './_layout';

export type InvitationEmailProps = {
  /** 受信者の表示名（招待時 email から推定 / 未指定時は email を使う）*/
  recipientName?: string;
  recipientEmail: string;
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  /** 7 日後の有効期限（ja-JP 表示） */
  expiresAtLabel: string;
  /** 招待時に付与される role 表示（例: 'member' / 'admin'）*/
  roleLabel: string;
};

export default function InvitationEmail({
  recipientName,
  recipientEmail,
  organizationName,
  inviterName,
  inviteUrl,
  expiresAtLabel,
  roleLabel,
}: InvitationEmailProps) {
  const display = recipientName?.trim() || recipientEmail;
  const preview = `${organizationName} から Coatly への招待が届いています`;

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
        Coatly への招待
      </Text>
      <Text
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: EMAIL_TOKENS.INK,
          lineHeight: '1.7',
        }}
      >
        {display} さん、こんにちは。
      </Text>
      <Text
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: EMAIL_TOKENS.INK,
          lineHeight: '1.7',
        }}
      >
        <strong>{inviterName}</strong> さんから、Coatly の組織
        「<strong>{organizationName}</strong>」への参加（権限: {roleLabel}）が届きました。
        下のボタンからアカウントを作成すると、活動費の申請・承認が始められます。
      </Text>

      <CtaButton href={inviteUrl} label="招待を受ける" />

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
          {inviteUrl}
        </Text>
      </Section>

      <Text
        style={{
          margin: '0',
          fontSize: '12px',
          color: EMAIL_TOKENS.MUTED,
          lineHeight: '1.6',
        }}
      >
        この招待は <strong>{expiresAtLabel}</strong> まで有効です（発行から 7 日間）。
      </Text>
    </CoatlyEmailLayout>
  );
}

InvitationEmail.PreviewProps = {
  recipientName: '佐藤',
  recipientEmail: 'sato@example.com',
  organizationName: 'テニス部',
  inviterName: 'Coatly Owner',
  inviteUrl: 'http://localhost:3000/invite/inv_abc123?email=sato%40example.com',
  expiresAtLabel: '2026年5月3日 23:59',
  roleLabel: 'member',
} satisfies InvitationEmailProps;
