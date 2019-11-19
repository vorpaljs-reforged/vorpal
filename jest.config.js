module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: ['lcov'],
  testMatch: ['**/*.spec.ts'],
  globals: {
    'ts-jest': {
      diagnostics: false, // TMP: disable compilation verification
      tsConfig: 'tsconfig.json',
    },
  }
};
