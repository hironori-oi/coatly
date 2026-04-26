/**
 * 承認結果通知メール（申請者宛 / react-email）
 *
 * dev-technical-spec-v2.md §1.2 (12〜13):
 * - 結果（承認 or 差戻）/ 分類 / 差戻理由 / 詳細リンク
 */
import { Section, Text } from '@react-email/components';
import { CoatlyEmailLayout, CtaButton, EMAIL_TOKENS } from './_layout';

export type ExpenseApprovedEmailProps = {
  recipientName?: string;
  /** 'approved' = 承認 / 'rejected' = 差戻 */
  result: 'approved' | 'rejected';
  /** 充当先（approved 時のみ意味あり） */
  classificationLabel?: string;
  /** 差戻時の理由（rejected 時のみ） */
  rejectionReason?: string;
  groupName: string;
  dateLabel: string;
  description: string;
  amountLabel: string;
  detailUrl: string;
};

export default function ExpenseApprovedEmail({
  recipientName,
  result,
  classificationLabel,
  rejectionReason,
  groupName,
  dateLabel,
  description,
  amountLabel,
  detailUrl,
}: ExpenseApprovedEmailProps) {
  const display = recipientName?.trim() || '申請者';
  const isApproved = result === 'approved';
  const headline = isApproved ? '申請が承認されました' : '申請が差し戻されました';
  const accent = isApproved ? EMAIL_TOKENS.COURT_GREEN : '#A83232';

  const preview = isApproved
    ? `${groupName} の申請（${amountLabel}）が承認されました`
    : `${groupName} の申請（${amountLabel}）について確認のお願い`;

  return (
    <CoatlyEmailLayout preview={preview}>
      {/* 結果バナー */}
      <Section
        style={{
          padding: '12px 16px',
          backgroundColor: isApproved ? '#E8F0EB' : '#F7E6E6',
          borderLeft: `3px solid ${accent}`,
          borderRadius: '6px',
          margin: '0 0 20px 0',
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: accent,
          }}
        >
          {headline}
        </Text>
      </Section>

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
        提出いただいた活動費申請の処理結果をお知らせします。
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
            <Row label="グループ" value={groupName} />
            <Row label="利用日" value={dateLabel} />
            <Row label="内容" value={description} />
            <Row
              label="金額"
              value={amountLabel}
              valueStyle={{ fontWeight: 600 }}
            />
            {isApproved && classificationLabel ? (
              <Row label="充当先" value={classificationLabel} />
            ) : null}
          </tbody>
        </table>
      </Section>

      {!isApproved && rejectionReason ? (
        <Section
          style={{
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            border: `1px solid ${EMAIL_TOKENS.HAIRLINE}`,
            borderRadius: '8px',
            margin: '0 0 16px 0',
          }}
        >
          <Text
            style={{
              margin: '0 0 6px 0',
              fontSize: '12px',
              color: EMAIL_TOKENS.MUTED,
            }}
          >
            差戻理由
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: '13px',
              color: EMAIL_TOKENS.INK,
              lineHeight: '1.7',
              whiteSpace: 'pre-wrap',
            }}
          >
            {rejectionReason}
          </Text>
        </Section>
      ) : null}

      <CtaButton
        href={detailUrl}
        label={isApproved ? '申請を確認する' : '内容を修正して再提出する'}
      />
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

ExpenseApprovedEmail.PreviewProps = {
  recipientName: '田中 太郎',
  result: 'approved',
  classificationLabel: 'グループ予算',
  groupName: '岡山',
  dateLabel: '2026年4月20日',
  description: 'コート使用料（県大会練習）',
  amountLabel: '¥5,000',
  detailUrl:
    'http://localhost:3000/coatly-tennis/expenses/01H8XYZ123ABC',
} satisfies ExpenseApprovedEmailProps;
