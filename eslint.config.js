// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'dist-check/*', 'node_modules/*', '.expo/*'],
  },
];
