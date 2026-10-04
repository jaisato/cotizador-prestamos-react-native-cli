/**
 * Reads one of the numeric fields.
 *
 * TextInput hands back a string, and feeding it straight to the arithmetic
 * broke on two inputs a Spanish user actually types: "3,5" for three and a
 * half is NaN to JavaScript, and anything the numeric keyboard lets through
 * that is not a number ("1e", a stray "-") is too. NaN then propagated all the
 * way to the summary, which read "NaN €".
 *
 * The comma is normalised to a decimal point; anything still not finite comes
 * back as null so the caller can show the field's own message instead.
 */
export const toNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalised = String(value).trim().replace(',', '.');

  if (normalised === '') {
    return null;
  }

  const parsed = Number(normalised);

  return Number.isFinite(parsed) ? parsed : null;
};

// "1.000", "25.000", "1.250.000" and "1.500,50": digits grouped in threes by
// dots, optionally followed by a decimal comma - the Spanish way of writing an
// amount.
const GROUPED_AMOUNT = /^\d{1,3}(\.\d{3})+(,\d+)?$/;

/**
 * Reads the amount in euros.
 *
 * In Spanish the dot groups thousands, so a user asking for a thousand euros
 * types "1.000". toNumber reads that as 1 - the summary then showed
 * "Cantidad solicitada: 1.000 €" next to the instalments for a one-euro loan,
 * and "1.500,50" was rejected as not a number at all. An amount of euros never
 * has three decimals, so dots in that grouped shape are thousands separators.
 * Anything else ("1500", "1500,50", "1500.50") is read as before.
 */
export const toAmount = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();

  if (GROUPED_AMOUNT.test(trimmed)) {
    return toNumber(trimmed.replace(/\./g, ''));
  }

  return toNumber(trimmed);
};
