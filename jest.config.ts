export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    coverageThreshold: {
        global: {
            branches: 75,
            functions: 75,
            lines: 75,
            statements: 75,
        },
    },
    moduleFileExtensions: ['ts', 'mts', 'js', 'json'],
    testMatch: ['**/__tests__/**/*.+(ts|mts|js)', '**/?(*.)+(spec|test).+(ts|mts|js)'],
};
