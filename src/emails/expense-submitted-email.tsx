/**
 * 申請提出通知メール（manager 宛 / react-email）
 *
 * dev-technical-spec-v2.md §1.2 (8〜9):
 * - 申請者名 / 利用日 / 内容 / 金額 / グループ名 / 詳細リンク
 */
import { Section, Text } from '@react-email/components';
import { CoatlyEmailLayout, CtaButton, EMAIL_TOKENS } from './_layout';

export type ExpenseSubmittedEmailProps = {
  managerName?: string;
  submitterName: string;
  groupName: string;
  /** ja-JP 表示済みの利用日（例: 2026年4月20日） */
  dateLabel: string;
  description: string;
  /** ja-JP yen 表示済みの金額（例: ¥5,000） */
  amountLabel: string;
  detailUrl: string;
};

export default function ExpenseSubmittedEmail({
  managerName,
  submitterName,
  groupName,
  dateLabel,
  description,
  amountLabel,
  detailUrl,
}: ExpenseSubmittedEmailProps) {
  const display = managerName?.trim() || 'マネージャー';
  const preview = `${groupName} で新しい活動費申請（${amountLabel}）が提出されました`;

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
        承認待ちの申請があります
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
        <br />
        <strong>{groupName}</strong> で活動費の申請が提出されました。内容を確認のうえ、承認または差戻をお願いします。
      </Text>

      <Section
        style={{
          padding: '16px',
          backgroundColor: '#F4F2EC',
          borderRadius: '8px',
          margin: '0 0 16px 0',
        }}
      >
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: 'collapse', width: '100%' }}
        >
          <tbody>
            <Row label="申請者" value={submitterName} />
            <Row label="グループ" value={groupName} />
            <Row label="利用日" value={dateLabel} />
            <Row label="内容" value={description} />
            <Row
              label="金額"
              value={amountLabel}
              valueStyle={{ fontWeight: 600 }}
            />
          </tbody>
        </table>
      </Section>

      <CtaButton href={detailUrl} label="申請を確認する" />

      <Text
        style={{
          margin: '8px 0 0 0',
          fontSize: '12px',
          color: EMAIL_TOKENS.MUTED,
          lineHeight: '1.6',
        }}
      >
        Coatly のダッシュボードからもいつでも確認できます。
      </Text>
    </CoatlyEmailLayout>
  );
}

function Row({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <tr>
      <td
        style={{
          fontSize: '12px',
          color: EMAIL_TOKENS.MUTED,
          padding: '4px 0',
          width: '80px',
          verticalAlign: 'top',
        }}
      >
        {label}
      </td>
      <td
        style={{
          fontSize: '13px',
          color: EMAIL_TOKENS.INK,
          padding: '4px 0',
          ...valueStyle,
        }}
      >
        {value}
      </td>
    </tr>
  );
}

ExpenseSubmittedEmail.PreviewProps = {
  managerName: '岡山マネージャー',
  submitterName: '田中 太郎',
  groupName: '岡山',
  dateLabel: '2026年4月20日',
  description: 'コート使用料（県大会練習）',
  amountLabel: '¥5,000',
  detailUrl:
    'http://localhost:3000/coatly-tennis/expenses/01H8XYZ123ABC',
} satisfies ExpenseSubmittedEmailProps;
