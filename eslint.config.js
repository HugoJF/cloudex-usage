import js from '@eslint/js';

const commonRules = {
    ...js.configs.recommended.rules,
    complexity: ['error', {max: 10, variant: 'modified'}],
    curly: ['error', 'all'],
    'max-depth': ['error', 3],
    'max-lines': ['error', {max: 300, skipBlankLines: true, skipComments: true}],
    'max-lines-per-function': ['error', {max: 80, skipBlankLines: true, skipComments: true}],
    'max-params': ['error', 4],
    'max-classes-per-file': ['error', 1],
    'no-duplicate-imports': 'error',
    'no-else-return': 'error',
    'no-magic-numbers': ['error', {ignore: [-1, 0, 1, 2, 100]}],
    'no-unused-vars': ['error', {
        argsIgnorePattern: '^_$',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_$',
        varsIgnorePattern: '^_$',
    }],
    'object-shorthand': 'error',
    'prefer-const': 'error',
};

const nodeGlobals = {
    Buffer: 'readonly',
    console: 'readonly',
    process: 'readonly',
    setImmediate: 'readonly',
    URL: 'readonly',
};

const gjsGlobals = {
    ARGV: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    console: 'readonly',
    global: 'readonly',
    log: 'readonly',
    print: 'readonly',
};

export default [
    {
        ignores: [
            'node_modules/**',
            'extension/stylesheet.css',
            'design/direction-lab/stylesheet.css',
            'scripts/doc-lint.mjs',
            'tests/lint/invalid.js',
        ],
    },
    {
        files: ['**/*.{js,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: 'error',
        },
        rules: {
            ...commonRules,
            'no-magic-numbers': 'off',
        },
    },
    {
        files: ['tests/lint/valid.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: nodeGlobals,
        },
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: 'error',
        },
        rules: commonRules,
    },
    {
        files: ['eslint.config.js', 'scripts/**/*.{js,mjs}', 'tests/unit/**/*.js',
            'tests/lint/valid.js'],
        languageOptions: {
            globals: nodeGlobals,
        },
    },
    {
        files: ['extension/**/*.js', 'design/direction-lab/**/*.js',
            'tests/journeys/**/*.js', 'tests/gjs/**/*.js',
            'tests/fixtures/**/*.js'],
        languageOptions: {globals: gjsGlobals},
    },
    {
        files: ['extension/**/*.js', 'design/direction-lab/**/*.js'],
        rules: {'no-magic-numbers': commonRules['no-magic-numbers']},
    },
    {
        files: ['scripts/*.journey.js', 'tests/unit/{claude-adapter,codex-adapter,history-runtime}.test.js'],
        languageOptions: {globals: gjsGlobals},
    },
    {
        files: ['tests/journeys/**/*.js', 'tests/gjs/**/*.js',
            'scripts/*.journey.js'],
        rules: {
            complexity: ['error', {max: 12, variant: 'modified'}],
            'max-lines': ['error', {max: 400, skipBlankLines: true,
                skipComments: true}],
            'max-lines-per-function': ['error', {max: 120,
                skipBlankLines: true, skipComments: true}],
        },
    },
    {
        files: [
            'tests/journeys/J-002-usage-surface.journey.test.js',
            'tests/journeys/J-003-panel-preferences.journey.test.js',
            'tests/journeys/J-006-usage-history.journey.test.js',
        ],
        rules: {
            complexity: ['error', {max: 60, variant: 'modified'}],
            'max-lines': ['error', {max: 600, skipBlankLines: true,
                skipComments: true}],
            'max-lines-per-function': ['error', {max: 420,
                skipBlankLines: true, skipComments: true}],
        },
    },
];
