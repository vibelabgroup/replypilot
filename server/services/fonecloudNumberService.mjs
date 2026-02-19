import { query, withTransaction } from '../utils/db.mjs';
import { logInfo, logError } from '../utils/logger.mjs';

/**
 * Allocate one number from the pool to the customer.
 * Uses FOR UPDATE SKIP LOCKED to avoid race conditions.
 * @param {string} customerId
 * @returns {{ success: boolean, phoneNumber?: string, id?: string, error?: string }}
 */
export async function allocateFromPool(customerId) {
  try {
    const result = await withTransaction(async (client) => {
      const row = await client.query(
        `SELECT id, phone_number FROM fonecloud_numbers
         WHERE customer_id IS NULL AND is_active = true
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );

      if (!row.rows.length) {
        return { success: false, error: 'No Fonecloud numbers available in pool' };
      }

      const { id, phone_number } = row.rows[0];

      await client.query(
        `UPDATE fonecloud_numbers
         SET customer_id = $1, allocated_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [customerId, id]
      );

      await client.query(
        `UPDATE customers
         SET fonecloud_number_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [id, customerId]
      );

      return { success: true, phoneNumber: phone_number, id: String(id) };
    });

    if (result.success) {
      logInfo('Fonecloud number allocated', { customerId, phoneNumber: result.phoneNumber });
    }
    return result;
  } catch (err) {
    logError('Fonecloud allocateFromPool failed', { customerId, error: err?.message });
    return { success: false, error: err?.message || 'Failed to allocate number' };
  }
}

/**
 * Release a number back to the pool and clear customer link.
 * @param {string} customerId
 * @param {string} phoneNumber
 * @returns {{ success: boolean, error?: string }}
 */
export async function releaseToPool(customerId, phoneNumber) {
  try {
    const find = await query(
      `SELECT id FROM fonecloud_numbers
       WHERE customer_id = $1 AND phone_number = $2 AND is_active = true`,
      [customerId, phoneNumber]
    );

    if (find.rowCount === 0) {
      return { success: false, error: 'Phone number not found or already released' };
    }

    const { id } = find.rows[0];

    await query(
      `UPDATE fonecloud_numbers
       SET customer_id = NULL, released_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await query(
      `UPDATE customers SET fonecloud_number_id = NULL, updated_at = NOW()
       WHERE id = $1 AND fonecloud_number_id = $2`,
      [customerId, id]
    );

    logInfo('Fonecloud number released', { customerId, phoneNumber });
    return { success: true };
  } catch (err) {
    logError('Fonecloud releaseToPool failed', { customerId, phoneNumber, error: err?.message });
    return { success: false, error: err?.message || 'Failed to release number' };
  }
}

/**
 * List numbers in the pool (unallocated).
 */
export async function getPoolNumbers() {
  const result = await query(
    `SELECT id, phone_number, notes, created_at
     FROM fonecloud_numbers
     WHERE customer_id IS NULL AND is_active = true
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * List allocated numbers with optional customer info.
 */
export async function getAllocatedNumbers() {
  const result = await query(
    `SELECT fn.id, fn.phone_number, fn.customer_id, fn.allocated_at, fn.notes,
            c.email AS customer_email, c.name AS customer_name
     FROM fonecloud_numbers fn
     LEFT JOIN customers c ON fn.customer_id = c.id
     WHERE fn.customer_id IS NOT NULL AND fn.is_active = true
     ORDER BY fn.allocated_at DESC`
  );
  return result.rows;
}

/**
 * Add a number to the pool. Validates format and uniqueness.
 * @param {string} phoneNumber - E.164 or national format
 * @param {string} [notes]
 */
export async function addToPool(phoneNumber, notes = null) {
  const normalized = String(phoneNumber).trim().replace(/\s/g, '');
  if (!normalized || normalized.length < 8) {
    throw new Error('Invalid phone number');
  }

  const result = await query(
    `INSERT INTO fonecloud_numbers (phone_number, customer_id, notes, updated_at)
     VALUES ($1, NULL, $2, NOW())
     RETURNING id, phone_number, notes, created_at`,
    [normalized, notes || null]
  );

  logInfo('Fonecloud number added to pool', { phone_number: normalized });
  return result.rows[0];
}
