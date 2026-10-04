import React, {useState, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  StatusBar,
  YellowBox,
} from 'react-native';
import Form from './src/components/Form';
import Footer from './src/components/Footer';
import ResultCalculation from './src/components/ResultCalculation';
import colors from './src/utils/colors';
import {toAmount, toNumber} from './src/utils/number';

YellowBox.ignoreWarnings(['Picker has been extracted']);

export default function App() {
  const [capital, setCapital] = useState(null);
  const [interest, setInterest] = useState(null);
  const [months, setMonths] = useState(null);
  const [total, setTotal] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const reset = useCallback(() => {
    setErrorMessage('');
    setTotal(null);
  }, []);

  const calculate = useCallback(() => {
    reset();

    const amount = toAmount(capital);
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
  }, [capital, interest, months, reset]);

  // Recalculates as the user types. calculate is memoised on the three inputs,
  // so listing it here is the same trigger as before, stated honestly.
  useEffect(() => {
    if (capital && interest && months) {
      calculate();
    } else {
      reset();
    }
  }, [capital, interest, months, calculate, reset]);

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
