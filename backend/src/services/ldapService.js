/* services/ldapService.js
 *
 * Authenticates a user against the Zemen Bank Active Directory via LDAPS.
 *
 * Uses the `ldapts` library (promise-based, ESM-compatible).
 * TLS certificate verification is disabled because the bank's LDAP server
 * uses a self-signed / internal CA certificate.
 *
 * AUTH_MODE env var controls which path login() uses:
 *   "local"  → bcrypt comparison against local DB (development / offline)
 *   anything else (default) → LDAP bind against AD
 */
import { Client } from 'ldapts';
import logger from '../utils/logger.js';

// ── Env helpers ──────────────────────────────────────────────────────────────
function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} is not set.`);
  return value;
}

// Lazy-read so the server can still start even if LDAP vars are absent
// when running in AUTH_MODE=local.
function getLdapConfig() {
  return {
    url:    requireEnv('LDAP_URL'),
    baseDN: requireEnv('LDAP_BASE_DN'),
  };
}

/**
 * Build the LDAP bind DN from a raw username input.
 *
 * Examples:
 *   "samuel.girma"            → "Zemenbank\samuel.girma"
 *   "samuel.girma@zemenbank.local" → "Zemenbank\samuel.girma"
 *   "Zemenbank\samuel.girma"  → kept as-is
 *   "cn=...,dc=..."           → kept as-is
 */
function buildBindDN(username) {
  // Already a fully-qualified bind DN
  if (username.includes('\\') || username.includes('dc=')) return username;

  // Strip domain suffix if the user typed the full UPN
  const bare = username.includes('@') ? username.split('@')[0] : username;

  return `Zemenbank\\${bare}`;
}

/**
 * Authenticate a user against Active Directory via LDAP bind.
 *
 * @param {string} username - sAMAccountName or UPN (e.g. "samuel.girma")
 * @param {string} password - AD password
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function ldapAuthenticate(username, password) {
  let config;
  try {
    config = getLdapConfig();
  } catch (err) {
    logger.error({ event: 'ldap_config_missing', error: err.message });
    return { success: false, message: 'LDAP is not configured on this server.' };
  }

  const bindDN = buildBindDN(username);

  const client = new Client({
    url: config.url,
    tlsOptions: {
      rejectUnauthorized: false, // Internal AD cert; disable strict TLS verification
    },
  });

  try {
    await client.bind(bindDN, password);
    logger.info({ event: 'ldap_auth_success', bindDN });
    return { success: true, message: 'Authentication successful' };
  } catch (err) {
    // LDAP error code 49 = InvalidCredentials
    if (err?.code === 49) {
      logger.warn({ event: 'ldap_auth_failed', bindDN, reason: 'invalid_credentials' });
      return { success: false, message: 'Invalid username or password.' };
    }
    logger.error({ event: 'ldap_auth_error', bindDN, error: err?.message });
    return { success: false, message: `LDAP error: ${err?.message || err}` };
  } finally {
    try {
      await client.unbind();
    } catch {
      // Ignore unbind errors
    }
  }
}
