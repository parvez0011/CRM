const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n: number): string {
  let str = '';
  if (n >= 100) {
    str += `${ONES[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    str += `${TENS[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) {
    str += `${ONES[n]} `;
  }
  return str.trim();
}

/** Converts a positive number into English words grouped by the international scale (Thousand/Million/Billion). */
export function numberToWords(amount: number): string {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);

  if (whole === 0 && cents === 0) return 'Zero';

  const groups = [
    { value: 1_000_000_000, label: 'Billion' },
    { value: 1_000_000, label: 'Million' },
    { value: 1_000, label: 'Thousand' },
    { value: 1, label: '' },
  ];

  let remaining = whole;
  const parts: string[] = [];
  for (const group of groups) {
    const count = Math.floor(remaining / group.value);
    if (count > 0) {
      parts.push(`${threeDigitsToWords(count)} ${group.label}`.trim());
      remaining %= group.value;
    }
  }

  let result = parts.join(' ') || 'Zero';
  if (cents > 0) {
    result += ` and ${threeDigitsToWords(cents)} Cents`;
  }
  return result;
}

export function amountInWords(amount: number, currency = 'USD'): string {
  const currencyNames: Record<string, string> = {
    USD: 'US Dollars',
    EUR: 'Euros',
    GBP: 'Pounds Sterling',
    JPY: 'Japanese Yen',
    INR: 'Indian Rupees',
    AUD: 'Australian Dollars',
    CAD: 'Canadian Dollars',
  };
  return `${numberToWords(amount)} ${currencyNames[currency] || currency} Only`;
}
