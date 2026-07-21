import js from '@eslint/js';

const commonRules = {
    ...js.configs.recommended.rules,
    complexity: ['error', 10],
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
            'tests/lint/invalid.js',
        ],
    },
    {
        files: ['**/*.js'],
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
            complexity: 'off',
            'max-classes-per-file': 'off',
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            'max-depth': 'off',
            'max-params': 'off',
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
        files: ['eslint.config.js', 'scripts/**/*.js', 'tests/unit/**/*.js',
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
        files: ['extension/shared/*.js',
            'extension/{controller-snapshot,controller-validation,panel-view,temporal}.js'],
        rules: commonRules,
    },
    {
        files: ['extension/shared/token-geometry.js'],
        rules: {
            complexity: 'off',
            'no-magic-numbers': 'off',
        },
    },
    {
        files: ['scripts/*.journey.js', 'tests/unit/{claude-adapter,codex-adapter,history-runtime}.test.js'],
        languageOptions: {globals: gjsGlobals},
    },
];
