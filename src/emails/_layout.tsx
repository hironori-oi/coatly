/**
 * Coatly メールテンプレ共通レイアウト
 *
 * - ヘッダ: 「Coatly」テキストロゴ + テニスボール SVG（黄緑円 + 白線縫い目）
 * - フッタ: 心当たりがない場合の文言 + Coatly 表記
 * - 絵文字禁止 / Heroicons 不可なので SVG 直書き
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

const COURT_GREEN = '#1F6B4A';
const INK = '#0A0A0B';
const PAPER = '#FAFAF7';
const HAIRLINE = '#D8D6CF';
const MUTED = '#6B6B6B';
const BALL_YELLOW = '#D8E84A';

type LayoutProps = {
  preview: string;
  children: ReactNode;
};

export function CoatlyEmailLayout({ preview, children }: LayoutProps) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body
          style={{
            backgroundColor: PAPER,
            color: INK,
            fontFamily:
              '"Noto Sans JP", system-ui, -apple-system, "Segoe UI", sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container
            style={{
              maxWidth: '560px',
              margin: '0 auto',
              padding: '32px 24px',
              backgroundColor: '#FFFFFF',
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '14px',
              marginTop: '32px',
              marginBottom: '32px',
            }}
          >
            {/* ヘッダ */}
            <Section
              style={{
                paddingBottom: '20px',
                borderBottom: `1px solid ${HAIRLINE}`,
                marginBottom: '24px',
              }}
            >
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                style={{ borderCollapse: 'collapse' }}
              >
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: 'middle', paddingRight: '12px' }}>
                      {/* Tennis ball SVG */}
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 28 28"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          cx="14"
                          cy="14"
                          r="12"
                          fill={BALL_YELLOW}
                          stroke={COURT_GREEN}
                          strokeWidth="1"
                        />
                        <path
                          d="M 4 8 Q 14 14 24 8"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M 4 20 Q 14 14 24 20"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="1.4"
                        />
                      </svg>
                    </td>
                    <td style={{ verticalAlign: 'middle' }}>
                      <Text
                        style={{
                          margin: 0,
                          fontSize: '20px',
                          fontWeight: 600,
                          letterSpacing: '-0.01em',
                          color: INK,
                        }}
                      >
                        Coatly
                      </Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* 本文 */}
            <Section>{children}</Section>

            {/* フッタ */}
            <Hr
              style={{
                borderColor: HAIRLINE,
                margin: '32px 0 16px 0',
              }}
            />
            <Section>
              <Text
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: MUTED,
                  lineHeight: '1.6',
                }}
              >
                このメールに心当たりがない場合は、お手数ですがそのまま削除してください。
              </Text>
              <Text
                style={{
                  margin: '8px 0 0 0',
                  fontSize: '12px',
                  color: MUTED,
                }}
              >
                Coatly &mdash; 部費が、散らからない。
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/** Court Green ボタン CTA */
export function CtaButton({ href, label }: { href: string; label: string }) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderCollapse: 'collapse', margin: '24px 0' }}
    >
      <tbody>
        <tr>
          <td>
            <a
              href={href}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                backgroundColor: COURT_GREEN,
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                borderRadius: '8px',
                letterSpacing: '0.01em',
              }}
            >
              {label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export const EMAIL_TOKENS = {
  COURT_GREEN,
  INK,
  PAPER,
  HAIRLINE,
  MUTED,
  BALL_YELLOW,
};
