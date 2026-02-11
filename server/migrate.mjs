import fs from 'fs';
import path from 'path';
import url from 'url';
import { pool } from './utils/db.mjs';
import { logInfo, logError } from './utils/logger.mjs';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      logInfo('Running migration', { file });
      await client.query(sql);
    }

    await client.query('COMMIT');
    logInfo('All migrations applied successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logError('Migration failed', { error: error.message });
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();

