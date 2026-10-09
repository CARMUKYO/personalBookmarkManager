export type Config = {
  port: number;
  jwtSecret: string;
  databaseUrl: string;
};

const MIN_SECRET_LENGTH = 32;

// Takes the environment as an argument (instead of reading process.env directly)
// so tests can pass in fake values.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "JWT_SECRET is not set. Copy .env.example to .env and fill it in.",
    );
  }
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`,
    );
  }

  return {
    port: Number(env.PORT) || 3000,
    jwtSecret,
    databaseUrl: env.DATABASE_URL ?? "file:./dev.db",
  };
}
