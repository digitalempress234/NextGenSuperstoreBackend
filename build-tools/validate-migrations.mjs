import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const migrationsRoot = resolve('prisma', 'migrations');
const directories = readdirSync(migrationsRoot, { withFileTypes: true }).filter((entry) =>
  entry.isDirectory(),
);
const malformed = directories
  .filter((entry) => !existsSync(join(migrationsRoot, entry.name, 'migration.sql')))
  .map((entry) => entry.name);

if (malformed.length > 0) {
  console.error(
    `Invalid Prisma migration directories (missing migration.sql): ${malformed.join(', ')}`,
  );
  process.exitCode = 1;
} else {
  console.log(`Validated ${directories.length} Prisma migration directories.`);
}
