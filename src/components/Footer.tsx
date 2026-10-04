import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../utils/colors';

const FOOTER_HEIGHT = 100;

type FooterProps = {
  calculate: () => void;
};

export default function Footer({ calculate }: FooterProps) {
  // The app is drawn edge to edge (edgeToEdgeEnabled in gradle.properties, and
  // Android 15+ enforces it anyway), so the navigation bar sits on top of the
  // bottom of the screen; on iOS the home indicator does the same. The bar
  // grows by that inset so the button stays above them instead of under them.
  const { bottom } = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.viewFooter,
        { height: FOOTER_HEIGHT + bottom, paddingBottom: bottom },
      ]}
    >
      <TouchableOpacity style={styles.button} onPress={calculate}>
        <Text style={styles.text}>CALCULAR</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  viewFooter: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: colors.PRIMARY_COLOR,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: colors.PRIMARY_COLOR_DARK,
    padding: 16,
    borderRadius: 20,
    width: '75%',
  },
  text: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
});
