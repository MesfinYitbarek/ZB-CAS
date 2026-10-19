/* utils/jwt.js
 * SECURITY FIX (A02, A07):
 *  - Access token lifetime reduced from 7d â†’ 15m
 *  - Refresh token lifetime kept at 30d but now rotated on every use AND on role switch
 *  - Tokens stored in httpOnly cookies on the response (see authController)
 */
import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN         || '15m';   // FIX: was '7d'
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '1d';

/**
 * Convert a jsonwebtoken-style duration ('15m', '1d', ...) to milliseconds,
 * so the refresh cookie's maxAge always matches the token's own exp claim.
 */
const parseDurationMs = (value, fallbackMs) => {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(String(value ?? '').trim());
  if (!match) return fallbackMs;
  const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * factors[match[2].toLowerCase()];
};

/**
 * Sign an access token.
 * @param {string} userId
 * @param {string} activeRole â€“ the role the user is currently acting as
 */
export const signAccessToken = (userId, activeRole) => {
  return jwt.sign({ id: userId, role: activeRole }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXP,
  });
};

/**
 * Sign a refresh token (longer expiry, separate secret).
 * @param {string} userId
 * @param {string} activeRole â€“ the role the user is currently acting as
 */
export const signRefreshToken = (userId, activeRole) => {
  return jwt.sign({ id: userId, role: activeRole }, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
};

/** Verify an access token.  Throws on failure. */
export const verifyAccessToken  = (token) => jwt.verify(token, ACCESS_SECRET);

/** Verify a refresh token.  Throws on failure. */
export const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_SECRET);

/**
 * Build the standard token-pair response object.
 * @param {string} userId
 * @param {string} activeRole â€“ the role being activated
 */
export const buildTokenPair = (userId, activeRole) => ({
  accessToken:  signAccessToken(userId, activeRole),
  refreshToken: signRefreshToken(userId, activeRole),
});

/**
 * Cookie options for the refresh token.
 *
 * Development  (NODE_ENV !== 'production'):
 *   Frontend and backend share the same origin via the Vite proxy, so
 *   SameSite=Lax + Secure=false is correct and cookies flow freely.
 *
 * Production on Render (or any cross-origin deployment):
 *   Frontend (https://zb-cas.onrender.com) and backend API
 *   (https://zb-cas-api.onrender.com) are DIFFERENT origins.
 *   Cross-origin cookies require SameSite=None AND Secure=true.
 *   Without this the browser silently drops the cookie on every request,
 *   so POST /auth/refresh arrives with no cookie â†’ 400 â†’ user is logged out.
 *
 *   SameSite=None is still safe here because:
 *     â€¢ The token is validated against the DB on every use (rotation check)
 *     â€¢ HTTPS is enforced in production (Secure=true)
 *     â€¢ httpOnly prevents JS access entirely
 */
export const refreshCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,                     // must be true when SameSite=None
    sameSite: isProd ? 'none' : 'lax',   // 'none' required for cross-origin prod
    maxAge:   parseDurationMs(REFRESH_EXP, 24 * 60 * 60 * 1000), // matches JWT_REFRESH_EXPIRES_IN
    path:     '/',
  };
};
