// Thin compatibility wrapper that re-exports the shared core logger.
// This lets both the existing customer API and the new admin API
// depend on a single logging implementation in `server/core/logger.mjs`.
import coreLogger, {
  logInfo,
  logWarn,
  logError,
  logDebug,
  childLogger,
} from '../core/logger.mjs';

export { logInfo, logWarn, logError, logDebug, childLogger };

export default coreLogger;
