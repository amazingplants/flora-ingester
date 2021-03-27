module.exports = {
  /*preset: 'ts-jest',*/
  globals: {
    extensionsToTreatAsEsm: ['.ts', '.js'],
    'ts-jest': {
      useESM: true,
    },
  },

  preset: 'ts-jest/presets/js-with-ts-esm',
  /*preset: 'ts-jest/presets/default-esm',*/
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },

  setupFilesAfterEnv: ['./tests/setup.ts'],
}
