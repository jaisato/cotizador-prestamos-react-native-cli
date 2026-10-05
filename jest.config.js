module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The app's tests. Since Jest 30 the default testMatch also takes .mjs
  // files, and scripts/*.test.mjs run with node --test (npm run test:scripts),
  // not with Jest.
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)'],
  // The preset's pattern plus react-native-picker-select, which publishes its
  // untranspiled source (JSX and ES modules) as "main".
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-picker-select)/)',
  ],
};
