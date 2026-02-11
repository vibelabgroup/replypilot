export function logInfo(message, meta = {}) {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta);
}

export function logWarn(message, meta = {}) {
  console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta);
}

export function logError(message, meta = {}) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta);
}

