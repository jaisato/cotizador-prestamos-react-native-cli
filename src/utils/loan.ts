/**
 * Loan quote maths, kept free of React so it can be tested on its own.
 *
 * The interest field is the rate per month, in percent, and the quote is a
 * French-style annuity: the same fee every month for the whole term.
 */

/** What the form hands over: TextInput text, the picker's value, or nothing. */
export type LoanInput = string | number | null | undefined;

export interface LoanQuote {
  /** Monthly fee with two decimals and a decimal comma, e.g. "88,85". */
  monthlyFee: string;
  /** Fee times the number of months, same format. */
  totalPayable: string;
}

export type LoanResult =
  | { ok: true; quote: LoanQuote }
  | { ok: false; error: string };

/** The messages the app shows, checked in this order. */
export const ERROR_MESSAGES = {
  capital: 'Añade la cantidad que quieres solicitar',
  interest: 'Añade el interes del prestamos',
  months: 'Seleccióna los meses a pagar',
} as const;

/**
 * Reads one of the numeric fields.
 *
 * TextInput hands back a string, and the previous code fed it straight to the
 * arithmetic. Two inputs a Spanish user actually types broke that: "3,5" for
 * three and a half is NaN to JavaScript, and anything the numeric keyboard lets
 * through that is not a number ("1e", a stray "-") is too. NaN then propagated
 * all the way to the summary, which read "NaN €".
 *
 * The comma is normalised to a decimal point; anything still not finite comes
 * back as null so the caller can show the field's own message instead.
 */
export function toNumber(value: LoanInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalised = String(value).trim().replace(',', '.');

  if (normalised === '') {
    return null;
  }

  const parsed = Number(normalised);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Monthly fee for `capital` at `ratePercent` per month over `months` months.
 * Expects already validated numbers: capital and months above zero, rate zero
 * or above.
 */
export function monthlyFee(
  capital: number,
  ratePercent: number,
  months: number,
): number {
  const i = ratePercent / 100;

  // At 0% the annuity formula is 0/0: (1 - (1+0)^-n) is zero and so is the
  // divisor, so the monthly fee came out NaN and the summary read "NaN €".
  // With no interest the payment is just the capital spread over the term.
  if (i === 0) {
    return capital / months;
  }

  // For a rate that is tiny but not zero, writing that numerator as
  // 1 - Math.pow(1 + i, -months) cancels almost entirely: at i = 1e-15 and a
  // 1.000 € twelve-month loan it gave 75,06 € instead of 83,33 €, and by
  // i = 1e-16 the divisor reached zero and the summary read "Infinity €".
  // expm1 and log1p compute the same quantity without ever forming the
  // near-1 intermediate, so the value slides into the 0% answer instead of
  // falling apart near it. Above about 1e-8 both spellings agree exactly.
  const discount = -Math.expm1(-months * Math.log1p(i));

  return capital / (discount / i);
}

/** Two decimals with a decimal comma, as the summary shows money. */
export function formatAmount(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/**
 * Validates the three form values and, when they are usable, quotes the loan.
 * Pure: same inputs, same result, no state.
 */
export function calculateLoan(
  capital: LoanInput,
  interest: LoanInput,
  months: LoanInput,
): LoanResult {
  const amount = toNumber(capital);
  const rate = toNumber(interest);
  const term = toNumber(months);

  if (amount === null || amount <= 0) {
    return { ok: false, error: ERROR_MESSAGES.capital };
  }

  if (rate === null || rate < 0) {
    return { ok: false, error: ERROR_MESSAGES.interest };
  }

  if (term === null || term <= 0) {
    return { ok: false, error: ERROR_MESSAGES.months };
  }

  const fee = monthlyFee(amount, rate, term);

  return {
    ok: true,
    quote: {
      monthlyFee: formatAmount(fee),
      totalPayable: formatAmount(fee * term),
    },
  };
}
