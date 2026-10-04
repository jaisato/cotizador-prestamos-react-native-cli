/**
 * @format
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import ReactTestRenderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer as Renderer,
} from 'react-test-renderer';
import App from '../App';

async function renderApp(): Promise<Renderer> {
  let renderer!: Renderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  return renderer;
}

function inputByPlaceholder(
  renderer: Renderer,
  placeholder: string,
): ReactTestInstance {
  const inputs = renderer.root
    .findAllByType(TextInput)
    .filter(input => input.props.placeholder === placeholder);

  expect(inputs).toHaveLength(1);

  return inputs[0];
}

async function type(renderer: Renderer, placeholder: string, text: string) {
  await act(async () => {
    inputByPlaceholder(renderer, placeholder).props.onChangeText(text);
  });
}

async function pickTerm(renderer: Renderer, months: number) {
  await act(async () => {
    renderer.root.findByType(RNPickerSelect).props.onValueChange(months);
  });
}

/** The picker draws a TouchableOpacity too; this is the one with CALCULAR. */
async function pressCalculate(renderer: Renderer) {
  const buttons = renderer.root
    .findAllByType(TouchableOpacity)
    .filter(button =>
      button
        .findAllByType(Text)
        .some(text => text.props.children === 'CALCULAR'),
    );

  expect(buttons).toHaveLength(1);

  await act(async () => {
    buttons[0].props.onPress();
  });
}

/** Every Text on screen, in render order. */
function shownTexts(renderer: Renderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(text => [text.props.children].flat().join(''));
}

function summary(renderer: Renderer): string[] {
  const texts = shownTexts(renderer);
  const start = texts.indexOf('RESUMEN');

  return start === -1 ? [] : texts.slice(start, start + 11);
}

test('renders correctly', async () => {
  const renderer = await renderApp();

  // jest.setup.js mocks the safe area provider so it renders its children
  // right away; without the mock it would render nothing and still pass.
  expect(shownTexts(renderer)).toContain('Cotizador de Prestamos');
});

test('quotes the loan as the user types, without pressing CALCULAR', async () => {
  const renderer = await renderApp();

  await type(renderer, 'Cantidad a pedir', '1000');
  await type(renderer, 'Interes %', '1');
  expect(summary(renderer)).toEqual([]);

  await pickTerm(renderer, 12);

  expect(summary(renderer)).toEqual([
    'RESUMEN',
    'Cantidad solicitada:',
    '1000 €',
    'Interes %:',
    '1 %',
    'Plazos:',
    '12 meses',
    'Pago mensual:',
    '88,85 €',
    'Total a pagar:',
    '1066,19 €',
  ]);
});

test('CALCULAR shows the message of the first empty field', async () => {
  const renderer = await renderApp();

  await pressCalculate(renderer);
  expect(shownTexts(renderer)).toContain(
    'Añade la cantidad que quieres solicitar',
  );

  await type(renderer, 'Cantidad a pedir', '1000');
  await pressCalculate(renderer);
  expect(shownTexts(renderer)).toContain('Añade el interes del prestamos');

  await type(renderer, 'Interes %', '1');
  await pressCalculate(renderer);
  expect(shownTexts(renderer)).toContain('Seleccióna los meses a pagar');

  expect(summary(renderer)).toEqual([]);
});

test('offers the four terms, with none selected at first', async () => {
  const renderer = await renderApp();
  const picker = renderer.root.findByType(RNPickerSelect);

  expect(picker.props.items).toEqual([
    { label: '3 meses', value: 3 },
    { label: '6 meses', value: 6 },
    { label: '12 meses', value: 12 },
    { label: '24 meses', value: 24 },
  ]);
  expect(picker.props.placeholder).toEqual({
    label: 'Seleccióna los plazos...',
    value: null,
  });
});
