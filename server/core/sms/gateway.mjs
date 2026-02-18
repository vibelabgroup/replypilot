// Shared SMS gateway entrypoint for both customer and admin APIs.
// It re-exports the existing implementation from `server/sms/gateway.mjs`
// so that new services can depend on the `core` path while the legacy
// server keeps using its current imports.

export * from '../../sms/gateway.mjs';

