// Safety check: tests create data that is never deleted, so they must only
// ever run against a test database. Import this first in every test file.
const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);

if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run tests on database "${dbName}". Use .env.test (a *_test database).`);
  process.exit(1);
}
