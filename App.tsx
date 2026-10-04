import { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Form from './src/components/Form';
import Footer from './src/components/Footer';
import ResultCalculation from './src/components/ResultCalculation';
import colors from './src/utils/colors';
import { calculateLoan, type LoanQuote } from './src/utils/loan';

export default function App() {
  const [capital, setCapital] = useState<string | null>(null);
  const [interest, setInterest] = useState<string | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [total, setTotal] = useState<LoanQuote | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const reset = useCallback(() => {
    setErrorMessage('');
    setTotal(null);
  }, []);

  const calculate = useCallback(() => {
    const result = calculateLoan(capital, interest, months);

    if (result.ok) {
      setErrorMessage('');
      setTotal(result.quote);
    } else {
      setTotal(null);
      setErrorMessage(result.error);
    }
  }, [capital, interest, months]);

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
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {/* Only the top edge: this is the header, and the footer takes care of
          the bottom inset itself. */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
    </SafeAreaProvider>
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
