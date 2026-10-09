import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Runs once before all tests: give them a fresh, separate database file
// so running the tests never touches the dev database.
export default function setup() {
  for (const file of ["test.db", "test.db-journal"]) {
    rmSync(file, { force: true });
  }
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
