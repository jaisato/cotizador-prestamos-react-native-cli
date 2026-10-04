import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Form from './src/components/Form';
import Footer from './src/components/Footer';
import ResultCalculation from './src/components/ResultCalculation';
import colors from './src/utils/colors';
import { calculateLoan, type LoanQuote } from './src/utils/loan';

const HEADER_HEIGHT = 290;
const BACKGROUND_HEIGHT = 200;

export default function App() {
  return (
    // initialMetrics gives useSafeAreaInsets the real insets on the first
    // render, so the header does not start at one height and jump to another.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar barStyle="light-content" />
      <LoanQuoter />
    </SafeAreaProvider>
  );
}

function LoanQuoter() {
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

  // In 0.62 the Android status bar was opaque and the app started below it.
  // Drawn edge to edge, the bar now covers the top of the header, so on
  // Android the header and its background grow by that inset and keep the
  // 290 and 200 points they had under the bar. iOS already measured both from
  // the top of the screen, so it keeps them as they were.
  const { top } = useSafeAreaInsets();
  const statusBarInset = Platform.OS === 'android' ? top : 0;

  return (
    // Edge to edge, adjustResize no longer shrinks the Android window when the
    // keyboard opens, and the insets the footer adds do not include it, so the
    // keyboard would cover CALCULAR. "height" shrinks this view to the top of
    // the keyboard and the footer, pinned to its bottom, moves up with it, as
    // the resized window did in 0.62. "padding" would not move the footer,
    // which is absolutely positioned, and "position" would push the header off
    // screen. iOS keeps what it did in 0.62: the keyboard covers the footer.
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'android' ? 'height' : undefined}
    >
      {/* Only the top edge: this is the header, and the footer takes care of
          the bottom inset itself. */}
      <SafeAreaView
        style={[styles.safeArea, { height: HEADER_HEIGHT + statusBarInset }]}
        edges={['top']}
      >
        <View
          style={[
            styles.background,
            { height: BACKGROUND_HEIGHT + statusBarInset },
          ]}
        />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    alignItems: 'center',
  },
  background: {
    backgroundColor: colors.PRIMARY_COLOR,
    width: '100%',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    position: 'absolute',
    // From the top of the header, behind the status bar, not from below the
    // safe area padding.
    top: 0,
    zIndex: -1,
  },
  titleApp: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 15,
  },
});
