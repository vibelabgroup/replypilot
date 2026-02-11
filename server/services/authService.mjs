import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../utils/db.mjs';
import { logInfo, logWarn, logError, logDebug } from '../utils/logger.mjs';
import { generateSessionToken, createSession, revokeSession, revokeAllUserSessions } from '../middleware/auth.mjs';
import { createValidationError, createUnauthorizedError } from '../middleware/errorHandler.mjs';

const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

// Hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate password reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Sign up new user
export const signup = async (data, ipAddress, userAgent) => {
  const { email, password, name, phone } = data;

  // Check if email already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rowCount > 0) {
    throw createValidationError('Email already registered');
  }

  // Check if customer exists (from checkout)
  const existingCustomer = await query(
    'SELECT id FROM customers WHERE email = $1',
    [email]
  );

  let customerId;

  if (existingCustomer.rowCount > 0) {
    customerId = existingCustomer.rows[0].id;
  } else {
    // Create new customer
    // NOTE: We only insert core fields here and rely on database defaults
    // for status/subscription_status so this works across different schema
    // versions (older and migrated).
    const newCustomer = await query(
      `INSERT INTO customers (email, name, phone)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, name, phone]
    );
    customerId = newCustomer.rows[0].id;

    // Create default settings
    await query(
      `INSERT INTO company_settings (customer_id, company_name)
       VALUES ($1, $2)`,
      [customerId, name]
    );

    await query(
      `INSERT INTO ai_settings (customer_id)
       VALUES ($1)`,
      [customerId]
    );

    await query(
      `INSERT INTO notification_preferences (customer_id)
       VALUES ($1)`,
      [customerId]
    );
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const userResult = await query(
    `INSERT INTO users (customer_id, email, password_hash, role)
     VALUES ($1, $2, $3, 'customer')
     RETURNING id, email, role, customer_id`,
    [customerId, email, passwordHash]
  );

  const user = userResult.rows[0];

  // Create session (separate transaction, FK now valid)
  const token = generateSessionToken();
  await createSession(user.id, token, ipAddress, userAgent);

  logInfo('User signed up', { userId: user.id, email, customerId });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customer_id,
    },
    token,
  };
};

// Login user
export const login = async (email, password, ipAddress, userAgent) => {
  // Find user
  const userResult = await query(
    `SELECT u.id, u.email, u.password_hash, u.role, u.customer_id, 
            u.failed_login_attempts, u.locked_until,
            c.status as customer_status, c.subscription_status
     FROM users u
     JOIN customers c ON u.customer_id = c.id
     WHERE u.email = $1`,
    [email]
  );

  if (userResult.rowCount === 0) {
    throw createUnauthorizedError('Invalid email or password');
  }

  const user = userResult.rows[0];

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw createUnauthorizedError(`Account locked. Try again in ${minutesLeft} minutes`);
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, user.password_hash);

  if (!isValidPassword) {
    // Increment failed attempts
    const newAttempts = (user.failed_login_attempts || 0) + 1;
    let lockedUntil = null;

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60000);
    }

    await query(
      `UPDATE users 
       SET failed_login_attempts = $1, locked_until = $2
       WHERE id = $3`,
      [newAttempts, lockedUntil, user.id]
    );

    logWarn('Failed login attempt', { email, attempts: newAttempts });

    throw createUnauthorizedError('Invalid email or password');
  }

  // Check customer status
  if (user.customer_status === 'cancelled' || user.subscription_status === 'canceled') {
    throw createUnauthorizedError('Account has been cancelled. Please contact support.');
  }

  // Clear failed attempts and update last login
  await query(
    `UPDATE users 
     SET failed_login_attempts = 0, 
         locked_until = NULL,
         last_login_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  // Create session
  const token = generateSessionToken();
  await createSession(user.id, token, ipAddress, userAgent);

  logInfo('User logged in', { userId: user.id, email });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customer_id,
      customerStatus: user.customer_status,
      subscriptionStatus: user.subscription_status,
    },
    token,
  };
};

// Logout user
export const logout = async (token) => {
  try {
    if (token) {
      await revokeSession(token);
    }
  } catch (error) {
    // Never fail logout because of a missing/invalid session
    logWarn('Logout revoke failed', { error: error.message });
  }
  logDebug('User logged out');
  return { success: true };
};

// Request password reset
export const requestPasswordReset = async (email) => {
  const userResult = await query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (userResult.rowCount === 0) {
    // Don't reveal if email exists
    logDebug('Password reset requested for non-existent email', { email });
    return { success: true };
  }

  const userId = userResult.rows[0].id;
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    `UPDATE users 
     SET password_reset_token = $1, password_reset_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );

  logInfo('Password reset requested', { userId, email });

  // In production, send email with reset link
  // sendEmail(email, 'Password Reset', `Click here to reset: ${process.env.FRONTEND_URL}/reset-password?token=${token}`);

  return { success: true, token }; // Return token for development, remove in production
};

// Reset password with token
export const resetPassword = async (token, newPassword) => {
  const userResult = await query(
    `SELECT id, password_reset_expires FROM users 
     WHERE password_reset_token = $1`,
    [token]
  );

  if (userResult.rowCount === 0) {
    throw createValidationError('Invalid or expired reset token');
  }

  const user = userResult.rows[0];

  if (new Date(user.password_reset_expires) < new Date()) {
    throw createValidationError('Reset token has expired');
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password and clear reset token
  await query(
    `UPDATE users 
     SET password_hash = $1, 
         password_reset_token = NULL, 
         password_reset_expires = NULL
     WHERE id = $2`,
    [passwordHash, user.id]
  );

  // Revoke all existing sessions
  await revokeAllUserSessions(user.id);

  logInfo('Password reset successful', { userId: user.id });

  return { success: true };
};

// Change password (authenticated)
export const changePassword = async (userId, currentPassword, newPassword) => {
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rowCount === 0) {
    throw createUnauthorizedError('User not found');
  }

  const isValidPassword = await verifyPassword(currentPassword, userResult.rows[0].password_hash);

  if (!isValidPassword) {
    throw createValidationError('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);

  await query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId]
  );

  // Revoke all existing sessions except current
  await revokeAllUserSessions(userId);

  logInfo('Password changed', { userId });

  return { success: true };
};

// Get current user
export const getCurrentUser = async (userId) => {
  const result = await query(
    `SELECT u.id, u.email, u.role, u.email_verified, u.last_login_at,
            c.id as customer_id, c.name as customer_name, c.email as customer_email,
            c.status as customer_status, c.subscription_status,
            c.current_period_end as subscription_end
     FROM users u
     JOIN customers c ON u.customer_id = c.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0];

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.email_verified,
    lastLoginAt: user.last_login_at,
    customer: {
      id: user.customer_id,
      name: user.customer_name,
      email: user.customer_email,
      status: user.customer_status,
      subscriptionStatus: user.subscription_status,
      subscriptionEnd: user.subscription_end,
    },
  };
};