module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The preset's pattern plus react-native-picker-select, which publishes its
  // untranspiled source (JSX and ES modules) as "main".
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-picker-select)/)',
  ],
};
