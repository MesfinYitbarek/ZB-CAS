/* services/loginThrottle.js
 *
 * Per-source login lockout used by authController.login().
 *
 * SECURITY (account-lockout DoS hardening):
 *   Locking an account "globally" after N failed passwords lets anyone who
 *   knows a username lock its legitimate owner out — repeatedly, every window —
 *   without ever knowing the password. On a shared/NAT'd network (the normal
 *   case for a bank exam cohort) that is a worse failure mode than the
 *   brute-force it defends against, because it doubles as a denial-of-service.
 *
 *   Failed attempts are therefore keyed by (username + client IP). An attacker
 *   only ever locks out their own source, while the real user logging in from
 *   their usual network is unaffected. The per-IP `authLimiter` on /login still
 *   caps how many attempts any single source can make.
 *
 * In-memory by design, matching the express-rate-limit store (single process).
 * Counters reset on restart; that is acceptable for lockout state and is
 * consistent with the rest of the auth throttling.
 */

const MAX_ATTEMPTS = parseInt(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS, 10) || 5;
const LOCK_MS = parseInt(process.env.AUTH_LOCKOUT_WINDOW_MS, 10) || 15 * 60 * 1000;

// Failures older than one lock window no longer count toward a new lock.
const ATTEMPT_TTL_MS = LOCK_MS;

// Opportunistic sweep so a long-running process can't accumulate stale keys.
const SWEEP_EVERY = 500;

const entries = new Map(); // key -> { attempts, lockUntil, firstAttemptAt }
let writes = 0;

const keyFor = (username, ip) =>
  `${String(username || '').trim().toLowerCase()}|${ip || 'unknown'}`;

const sweepExpired = (t) => {
  for (const [key, entry] of entries) {
    const lockActive = entry.lockUntil && entry.lockUntil > t;
    if (!lockActive && t - entry.firstAttemptAt > ATTEMPT_TTL_MS) {
      entries.delete(key);
    }
  }
};

/**
 * Is this (username, IP) source currently locked?
 * @returns {{ locked: boolean, waitMinutes: number }}
 */
export function checkLock(username, ip) {
  const key = keyFor(username, ip);
  const entry = entries.get(key);
  if (!entry) return { locked: false, waitMinutes: 0 };

  const t = Date.now();
  if (entry.lockUntil && entry.lockUntil > t) {
    return {
      locked: true,
      waitMinutes: Math.max(1, Math.ceil((entry.lockUntil - t) / 60000)),
    };
  }
  // Lock elapsed → drop the record so the next failure starts a fresh window.
  if (entry.lockUntil && entry.lockUntil <= t) entries.delete(key);
  return { locked: false, waitMinutes: 0 };
}

/**
 * Record a failed login for this source.
 * @returns {{ locked: boolean, attempts: number, lockUntil: number|null }}
 */
export function recordFailure(username, ip) {
  const t = Date.now();
  const key = keyFor(username, ip);
  const existing = entries.get(key);
  const stale = !existing || t - existing.firstAttemptAt > ATTEMPT_TTL_MS;
  const entry = stale
    ? { attempts: 0, lockUntil: null, firstAttemptAt: t }
    : existing;

  entry.attempts += 1;
  let locked = false;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockUntil = t + LOCK_MS;
    locked = true;
  }
  entries.set(key, entry);

  if (++writes % SWEEP_EVERY === 0) sweepExpired(t);
  return { locked, attempts: entry.attempts, lockUntil: entry.lockUntil };
}

/** Clear this source's failure counter (call on successful login). */
export function recordSuccess(username, ip) {
  entries.delete(keyFor(username, ip));
}

/** Test/ops helper: clear all lockout state. */
export function resetLoginThrottle() {
  entries.clear();
  writes = 0;
}
