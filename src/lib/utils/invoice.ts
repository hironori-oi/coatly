/**
 * 適格請求書発行事業者の登録番号（インボイス番号）バリデーション
 *
 * 仕様（国税庁公表）:
 * - フォーマット: `T` + 13 桁数字（例: T1234567890123）
 * - 13 桁数字は法人番号と同じチェックデジット規則を持つ
 *   - 12 桁の数字 + 1 桁のチェックデジット
 *   - 計算: 9 - ( Σ(P_n * Q_n) mod 9 )
 *     - P_n: 12 桁の各桁
 *     - Q_n: 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2（左から）
 *
 * 参考: 国税庁「法人番号の指定に関するQ&A」
 */

/**
 * 形式チェック（T + 13 桁数字）。
 */
export function isValidInvoiceNumberFormat(value: string): boolean {
  return /^T\d{13}$/.test(value);
}

/**
 * チェックデジット計算（13 桁の法人番号部分のみ）。
 *
 * @param twelveDigits 12 桁の数字文字列（先頭桁 = チェックデジットの根拠）
 * @returns チェックデジット（0-9）
 */
export function computeInvoiceCheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error('twelveDigits must be exactly 12 numeric chars');
  }
  // 法人番号は 13 桁で構成され、最上位桁がチェックデジット。
  // 残り 12 桁を右から順に「奇数桁 = ×1、偶数桁 = ×2」で重み付けする。
  // 仕様式: CD = 9 - ( Σ(P_n × Q_n) mod 9 )
  //   - 右から数えて n が偶数 → Q_n = 2、奇数 → Q_n = 1
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(twelveDigits[i]);
    // i=11 (最右) → 奇数桁 (n=1) → ×1
    // i=10        → 偶数桁 (n=2) → ×2
    const positionFromRight = 12 - i;
    const weight = positionFromRight % 2 === 0 ? 2 : 1;
    sum += digit * weight;
  }
  const cd = 9 - (sum % 9);
  return cd;
}

/**
 * チェックデジット検証付きの完全バリデーション。
 *
 * 注: 形式エラー時は false（throw しない）。
 */
export function isValidInvoiceNumber(value: string): boolean {
  if (!isValidInvoiceNumberFormat(value)) return false;
  // T を除いた 13 桁: 1 桁目 = チェックデジット、残り 12 桁 = 法人番号本体
  const digits = value.slice(1);
  const checkDigit = Number(digits[0]);
  const body = digits.slice(1);
  return computeInvoiceCheckDigit(body) === checkDigit;
}
