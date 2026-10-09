// Shared config for tests: a fixed secret so tests can verify tokens.
export const TEST_JWT_SECRET = "test-secret-".padEnd(48, "x");

export const testConfig = { jwtSecret: TEST_JWT_SECRET, isProduction: false };
