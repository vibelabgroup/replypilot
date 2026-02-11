import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.mjs";
import { logError } from "./logger.mjs";

// In a real system you might use JWTs; here we use an opaque token table for simplicity.

export async function initAuthDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
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

export async function createSession(userId) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  await pool.query(
    `
      INSERT INTO sessions (token, user_id, expires_at)
      VALUES ($1, $2, $3);
    `,
    [token, userId, expiresAt]
  );

  return { token, expiresAt };
}

export async function getSession(token) {
  if (!token) return null;

  const result = await pool.query(
    `
      SELECT s.*, u.customer_id
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = $1
        AND s.expires_at > NOW()
      LIMIT 1;
    `,
    [token]
  );

  return result.rows[0] || null;
}

export async function destroySession(token) {
  try {
    await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
  } catch (err) {
    logError("Failed to destroy session", { error: err });
  }
}

