import {
  calculateLoan,
  ERROR_MESSAGES,
  formatAmount,
  monthlyFee,
  toNumber,
  type LoanInput,
} from '../src/utils/loan';

const quote = (capital: LoanInput, interest: LoanInput, months: LoanInput) => {
  const result = calculateLoan(capital, interest, months);

  if (!result.ok) {
    throw new Error(`Expected a quote, got "${result.error}"`);
  }

  return result.quote;
};

describe('calculateLoan', () => {
  describe('normal cases', () => {
    // Reference values: the usual annuity formula, as a spreadsheet's PMT
    // gives them (e.g. PMT(1%; 12; 1000) = 88,85).
    it.each([
      ['1000', '1', 12, '88,85', '1066,19'],
      ['10000', '0,5', 24, '443,21', '10636,95'],
      ['6000', '2', 6, '1071,15', '6426,93'],
      ['1500', '3,5', 3, '535,40', '1606,20'],
      ['250000', '0.35', 24, '10878,50', '261083,97'],
    ])(
      '%s € at %s %% for %i months: %s € a month, %s € in total',
      (capital, interest, months, fee, total) => {
        expect(quote(capital, interest, months)).toEqual({
          monthlyFee: fee,
          totalPayable: total,
        });
      },
    );

    it('reads a decimal comma and surrounding spaces', () => {
      expect(quote(' 1000 ', '1,5', '12')).toEqual(quote('1000', '1.5', 12));
    });
  });

  describe('0 % interest', () => {
    it('spreads the capital evenly over the term', () => {
      expect(quote('1200', '0', 12)).toEqual({
        monthlyFee: '100,00',
        totalPayable: '1200,00',
      });
    });

    it('rounds the fee but not the capital', () => {
      expect(quote('1000', '0', 3)).toEqual({
        monthlyFee: '333,33',
        totalPayable: '1000,00',
      });
    });

    it('accepts "0,0" as zero', () => {
      expect(quote('1200', '0,0', 12)).toEqual(quote('1200', '0', 12));
    });
  });

  describe('limits', () => {
    it.each([
      ['0', ERROR_MESSAGES.capital],
      ['-100', ERROR_MESSAGES.capital],
    ])('rejects a capital of %s', (capital, error) => {
      expect(calculateLoan(capital, '1', 12)).toEqual({ ok: false, error });
    });

    it('rejects a negative interest', () => {
      expect(calculateLoan('1000', '-1', 12)).toEqual({
        ok: false,
        error: ERROR_MESSAGES.interest,
      });
    });

    it.each([0, -3])('rejects a term of %i months', months => {
      expect(calculateLoan('1000', '1', months)).toEqual({
        ok: false,
        error: ERROR_MESSAGES.months,
      });
    });

    it('quotes the smallest amount the summary can show', () => {
      expect(quote('0,01', '1', 3)).toEqual({
        monthlyFee: '0,00',
        totalPayable: '0,01',
      });
    });

    it('charges one month of interest on a one-month loan', () => {
      expect(quote('1000', '1', 1)).toEqual({
        monthlyFee: '1010,00',
        totalPayable: '1010,00',
      });
      expect(quote('1000', '100', 1)).toEqual({
        monthlyFee: '2000,00',
        totalPayable: '2000,00',
      });
    });

    it('handles a large capital', () => {
      expect(quote('1000000000', '1', 24)).toEqual({
        monthlyFee: '47073472,22',
        totalPayable: '1129763333,36',
      });
    });

    // The naive 1 - (1 + i)^-n gives 75,06 € at 1e-13 % and Infinity € at
    // 1e-14 %; a rate that small has to land on the 0 % answer.
    it.each(['1e-6', '1e-13', '1e-14', '1e-300'])(
      'slides into the 0 %% answer at %s %%',
      interest => {
        expect(quote('1000', interest, 12)).toEqual({
          monthlyFee: '83,33',
          totalPayable: '1000,00',
        });
      },
    );
  });

  describe('empty inputs', () => {
    it.each([[''], ['   '], [null], [undefined]])(
      'asks for the capital first when it is %p',
      capital => {
        expect(calculateLoan(capital, '', null)).toEqual({
          ok: false,
          error: ERROR_MESSAGES.capital,
        });
      },
    );

    it.each([[''], [null], [undefined]])(
      'asks for the interest when it is %p',
      interest => {
        expect(calculateLoan('1000', interest, 12)).toEqual({
          ok: false,
          error: ERROR_MESSAGES.interest,
        });
      },
    );

    it.each([[''], [null], [undefined]])(
      'asks for the term when it is %p',
      months => {
        expect(calculateLoan('1000', '1', months)).toEqual({
          ok: false,
          error: ERROR_MESSAGES.months,
        });
      },
    );

    it.each(['abc', '1e', '-', ',', '1e400'])(
      'treats "%s" like an empty field',
      capital => {
        expect(calculateLoan(capital, '1', 12)).toEqual({
          ok: false,
          error: ERROR_MESSAGES.capital,
        });
      },
    );
  });
});

describe('toNumber', () => {
  it.each([
    ['3,5', 3.5],
    [' 12 ', 12],
    [24, 24],
    ['0', 0],
    ['1e3', 1000],
  ])('reads %p as %p', (value, expected) => {
    expect(toNumber(value)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['  '], ['NaN'], ['Infinity']])(
    'returns null for %p',
    value => {
      expect(toNumber(value)).toBeNull();
    },
  );
});

describe('monthlyFee', () => {
  it('matches the annuity formula away from zero', () => {
    const i = 0.01;
    const naive = (1000 * i) / (1 - Math.pow(1 + i, -12));

    expect(monthlyFee(1000, 1, 12)).toBeCloseTo(naive, 10);
  });
});

describe('formatAmount', () => {
  it('uses two decimals and a decimal comma', () => {
    expect(formatAmount(1234.5)).toBe('1234,50');
    expect(formatAmount(0)).toBe('0,00');
  });
});
