import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.mjs";
import { logError } from "./logger.mjs";

// In a real system you might use JWTs; here we use an opaque token table for simplicity.

export async function initAuthDb() {
  // db.mjs initDb() already creates the sessions table with the full schema.
  // This function now just ensures the table exists (noop if already created).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address INET,
      user_agent TEXT,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId) {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  await pool.query(
    `
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, $3);
    `,
    [tokenHash, userId, expiresAt]
  );

  return { token, expiresAt };
}

export async function getSession(token) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await pool.query(
    `
      SELECT s.*, u.customer_id
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND s.revoked = FALSE
      LIMIT 1;
    `,
    [tokenHash]
  );

  return result.rows[0] || null;
}

export async function destroySession(token) {
  try {
    const tokenHash = hashToken(token);
    await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  } catch (err) {
    logError("Failed to destroy session", { error: err });
  }
}

