// Compatibility wrapper that re-exports the shared core DB helpers.
// This keeps existing imports working while allowing a dedicated
// `server/core/db.mjs` module to be shared with the new admin API.
export {
  checkDbHealth,
  query,
  withTransaction,
  getPoolStats,
  pool,
} from '../core/db.mjs';
