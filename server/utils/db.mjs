import pg from 'pg';
import { logError, logDebug } from './logger.mjs';

const { Pool } = pg;

// Default local connection for development/tests if DATABASE_URL is not set
const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://replypilot:changeme@localhost:5432/replypilot';

// Create connection pool
const pool = new Pool({
  connectionString: DEFAULT_DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Pool error handling
pool.on('error', (err) => {
  logError('Unexpected database pool error', { error: err.message });
});

// Health check function
export const checkDbHealth = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    return { healthy: true, timestamp: result.rows[0].now };
  } catch (error) {
    logError('Database health check failed', { error: error.message });
    return { healthy: false, error: error.message };
  } finally {
    client.release();
  }
};

// Query helper with timeout
export const query = async (text, params, timeoutMs = 10000) => {
  const start = Date.now();
  const client = await pool.connect();
  
  try {
    // Set statement timeout
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    
    logDebug('Query executed', { 
      duration: `${duration}ms`, 
      rows: result.rowCount,
      command: result.command 
    });
    
    return result;
  } catch (error) {
    logError('Query failed', { 
      error: error.message, 
      query: text.substring(0, 100),
      params: params ? 'present' : 'none'
    });
    throw error;
  } finally {
    client.release();
  }
};

// Transaction helper
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get pool stats
export const getPoolStats = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
});

export { pool };