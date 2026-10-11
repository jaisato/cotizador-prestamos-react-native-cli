/* eslint-env jest */
// SafeAreaProvider waits for the native insets event before it renders its
// children, and that event never fires under Jest. The library's own mock
// starts with zero insets so the tests see the whole screen.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
