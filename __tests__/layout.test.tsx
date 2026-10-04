/**
 * @format
 */

import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaView,
} from 'react-native-safe-area-context';
import ReactTestRenderer, {
  act,
  type ReactTestRenderer as Renderer,
} from 'react-test-renderer';
import App from '../App';
import colors from '../src/utils/colors';

// Jest resolves platform files for iOS (the preset's defaultPlatform), so
// with Platform.OS switched to android the picker would pick its Android
// branch with the iOS build of its modules, and it fails to render. The
// picker is not what these tests look at; App.test.tsx renders the real one.
jest.mock('react-native-picker-select', () => 'RNPickerSelect');

async function renderApp(): Promise<Renderer> {
  let renderer!: Renderer;

  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  return renderer;
}

function keyboardBehavior(renderer: Renderer) {
  return renderer.root.findByType(KeyboardAvoidingView).props.behavior;
}

function header(renderer: Renderer) {
  const safeArea = renderer.root.findByType(SafeAreaView);
  const backgrounds = safeArea.findAllByType(View).filter(view => {
    const style = StyleSheet.flatten(view.props.style);

    return (
      style?.position === 'absolute' &&
      style.backgroundColor === colors.PRIMARY_COLOR
    );
  });

  expect(backgrounds).toHaveLength(1);

  return {
    height: StyleSheet.flatten(safeArea.props.style).height,
    backgroundHeight: StyleSheet.flatten(backgrounds[0].props.style).height,
  };
}

beforeEach(() => {
  // A status bar of 24 points and a navigation bar of 48.
  jest.replaceProperty(initialWindowMetrics!, 'insets', {
    top: 24,
    right: 0,
    bottom: 48,
    left: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('iOS: the keyboard is left alone and the header keeps 290 and 200', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const renderer = await renderApp();

  expect(keyboardBehavior(renderer)).toBeUndefined();
  expect(header(renderer)).toEqual({ height: 290, backgroundHeight: 200 });
});

test('Android: the screen shrinks above the keyboard and the header grows by the status bar', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const renderer = await renderApp();

  expect(keyboardBehavior(renderer)).toBe('height');
  expect(header(renderer)).toEqual({
    height: 290 + 24,
    backgroundHeight: 200 + 24,
  });
});
