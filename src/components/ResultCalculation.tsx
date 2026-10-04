import { StyleSheet, Text, View } from 'react-native';
import type { LoanQuote } from '../utils/loan';

type ResultCalculationProps = {
  capital: string | null;
  interest: string | null;
  months: number | null;
  total: LoanQuote | null;
  errorMessage: string;
};

export default function ResultCalculation({
  capital,
  interest,
  months,
  total,
  errorMessage,
}: ResultCalculationProps) {
  return (
    <View style={styles.content}>
      {total && (
        <View style={styles.boxResult}>
          <Text style={styles.title}>RESUMEN</Text>
          <DataResult title="Cantidad solicitada:" value={`${capital} €`} />
          <DataResult title="Interes %:" value={`${interest} %`} />
          <DataResult title="Plazos:" value={`${months} meses`} />
          <DataResult title="Pago mensual:" value={`${total.monthlyFee} €`} />
          <DataResult
            title="Total a pagar:"
            value={`${total.totalPayable} €`}
          />
        </View>
      )}
      <View>
        <Text style={styles.error}>{errorMessage}</Text>
      </View>
    </View>
  );
}

type DataResultProps = {
  title: string;
  value: string;
};

function DataResult({ title, value }: DataResultProps) {
  return (
    <View style={styles.value}>
      <Text>{title}</Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    marginHorizontal: 40,
  },
  boxResult: {
    padding: 30,
  },
  title: {
    fontSize: 25,
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  value: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  error: {
    textAlign: 'center',
    color: '#f00',
    fontWeight: 'bold',
    fontSize: 20,
  },
});
