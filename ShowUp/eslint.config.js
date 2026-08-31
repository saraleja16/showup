// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      'import/no-unresolved': [
        'error',
        {
          ignore: [
            '^maplibre-gl$',
            '^maplibre-gl/dist/maplibre-gl\\.css$',
            '^react-native-webview$',
          ],
        },
      ],
    },
  },
]);
