/**
 * @format
 */

import 'react-native';
import React from 'react';
import {Text, TextInput} from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import renderer, {act} from 'react-test-renderer';
import App from '../App';
import {toAmount, toNumber} from '../src/utils/number';

describe('toNumber', () => {
  it.each([
    ['3,5', 3.5],
    ['3.5', 3.5],
    [' 12 ', 12],
    [6, 6],
  ])('reads %p as %p', (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });

  it.each([null, undefined, '', '  ', '1e', '-', 'abc'])(
    'rejects %p',
    (input) => {
      expect(toNumber(input)).toBeNull();
    },
  );
});

describe('toAmount', () => {
  it.each([
    ['1.000', 1000],
    ['25.000', 25000],
    ['1.250.000', 1250000],
    ['1.500,50', 1500.5],
    ['1500', 1500],
    ['1500,50', 1500.5],
    ['1500.5', 1500.5],
    ['1.5', 1.5],
    ['1.50', 1.5],
    [' 2.000 ', 2000],
  ])('reads %p as %p', (input, expected) => {
    expect(toAmount(input)).toBe(expected);
  });

  it.each([null, undefined, '', '1.000.0', '1..000', 'abc'])(
    'rejects %p',
    (input) => {
      expect(toAmount(input)).toBeNull();
    },
  );
});

it('quotes a loan typed with a thousands separator', () => {
  let tree;
  act(() => {
    tree = renderer.create(<App />);
  });
  const [capital, interest] = tree.root.findAllByType(TextInput);
  act(() => {
    capital.props.onChange({nativeEvent: {text: '1.200'}});
    interest.props.onChange({nativeEvent: {text: '0'}});
  });
  act(() => {
    tree.root.findByType(RNPickerSelect).props.onValueChange(12);
  });
  const texts = tree.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .filter((c) => typeof c === 'string');
  expect(texts).toContain('100,00 €');
  expect(texts).toContain('1200,00 €');
});
