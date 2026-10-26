// Wipes the TEST database and re-applies every migration.
// Run: npm run db:test:reset   (loads .env.test)
// Refuses to run on any database whose name does not end in _test.
// Never use this on real data: see "expand and contract" in CLAUDE.md.

import { spawnSync } from "node:child_process";

const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);

if (!dbName.endsWith("_test")) {
  console.error(`Refusing to reset database "${dbName}". Only *_test databases can be reset.`);
  process.exit(1);
}

console.log(`Resetting test database "${dbName}" (all data in it will be deleted)...`);

const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
