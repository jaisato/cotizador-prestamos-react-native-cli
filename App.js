import React, {useState, useEffect} from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  StatusBar,
  YellowBox,
  Button,
} from 'react-native';
import Form from './src/components/Form';
import Footer from './src/components/Footer';
import ResultCalculation from './src/components/ResultCalculation';
import colors from './src/utils/colors';

YellowBox.ignoreWarnings(['Picker has been extracted']);

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
const toNumber = (value) => {
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

export default function App() {
  const [capital, setCapital] = useState(null);
  const [interest, setInterest] = useState(null);
  const [months, setMonths] = useState(null);
  const [total, setTotal] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (capital && interest && months) calculate();
    else reset();
  }, [capital, interest, months]);

  const calculate = () => {
    reset();

    const amount = toNumber(capital);
    const rate = toNumber(interest);
    const term = toNumber(months);

    if (amount === null || amount <= 0) {
      setErrorMessage('Añade la cantidad que quieres solicitar');
      return;
    }

    if (rate === null || rate < 0) {
      setErrorMessage('Añade el interes del prestamos');
      return;
    }

    if (term === null || term <= 0) {
      setErrorMessage('Seleccióna los meses a pagar');
      return;
    }

    const i = rate / 100;

    // At 0% the annuity formula is 0/0: (1 - (1+0)^-n) is zero and so is the
    // divisor, so the monthly fee came out NaN and the summary read "NaN €".
    // With no interest the payment is just the capital spread over the term.
    //
    // For a rate that is tiny but not zero, writing that numerator as
    // 1 - Math.pow(1 + i, -term) cancels almost entirely: at i = 1e-15 and a
    // 1.000 € twelve-month loan it gave 75,06 € instead of 83,33 €, and by
    // i = 1e-16 the divisor reached zero and the summary read "Infinity €".
    // expm1 and log1p compute the same quantity without ever forming the
    // near-1 intermediate, so the value slides into the 0% answer instead of
    // falling apart near it. Above about 1e-8 both spellings agree exactly.
    const discount = -Math.expm1(-term * Math.log1p(i));
    const fee = i === 0 ? amount / term : amount / (discount / i);

    setTotal({
      monthlyFee: fee.toFixed(2).replace('.', ','),
      totalPayable: (fee * term).toFixed(2).replace('.', ','),
    });
  };

  const reset = () => {
    setErrorMessage('');
    setTotal(null);
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.background} />
        <Text style={styles.titleApp}>Cotizador de Prestamos</Text>
        <Form
          setCapital={setCapital}
          setInterest={setInterest}
          setMonths={setMonths}
        />
      </SafeAreaView>
      <ResultCalculation
        capital={capital}
        interest={interest}
        months={months}
        total={total}
        errorMessage={errorMessage}
      />
      <Footer calculate={calculate} />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    height: 290,
    alignItems: 'center',
  },
  background: {
    backgroundColor: colors.PRIMARY_COLOR,
    height: 200,
    width: '100%',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    position: 'absolute',
    zIndex: -1,
  },
  titleApp: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 15,
  },
});
