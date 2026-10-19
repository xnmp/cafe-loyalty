// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/motion.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native-reanimated',
              importNames: ['withSpring'],
              message: "Use spring() from src/ui/motion: Reanimated 4's own defaults make these springs far bouncier.",
            },
          ],
        },
      ],
    },
  },
]);
