import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'import', 'vitest'],
  rules: {
    'import/no-namespace': 'error',
    'typescript/ban-ts-comment': [
      'error',
      {
        minimumDescriptionLength: 10,
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': true,
      },
    ],
    'typescript/consistent-type-imports': [
      'error',
      {
        disallowTypeAnnotations: true,
        fixStyle: 'separate-type-imports',
        prefer: 'type-imports',
      },
    ],
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
  },
})
