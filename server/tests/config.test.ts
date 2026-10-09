import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const validSecret = "x".repeat(32);

describe("loadConfig", () => {
  it("throws when JWT_SECRET is missing", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET is not set/);
  });

  it("throws when JWT_SECRET is too short", () => {
    expect(() => loadConfig({ JWT_SECRET: "short" })).toThrow(/at least 32/);
  });

  it("returns the values when the environment is valid", () => {
    const config = loadConfig({
      JWT_SECRET: validSecret,
      PORT: "4000",
      DATABASE_URL: "file:./test.db",
    });

    expect(config).toEqual({
      port: 4000,
      jwtSecret: validSecret,
      databaseUrl: "file:./test.db",
      isProduction: false,
    });
  });

  it("defaults the port and database url", () => {
    const config = loadConfig({ JWT_SECRET: validSecret });

    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe("file:./dev.db");
  });

  it("detects production from NODE_ENV", () => {
    expect(loadConfig({ JWT_SECRET: validSecret, NODE_ENV: "production" }).isProduction).toBe(true);
    expect(loadConfig({ JWT_SECRET: validSecret }).isProduction).toBe(false);
  });
});
